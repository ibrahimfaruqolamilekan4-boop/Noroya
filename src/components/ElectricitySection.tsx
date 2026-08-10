import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, Loader2, Printer, Copy, RefreshCw, Landmark, ShieldCheck } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import SuccessFeedback from './SuccessFeedback';

interface ProviderOption {
  code: string;
  name: string;
  shortName: string;
  region: string;
  logoBg: string;
  textColor: string;
}

const ELECTRICITY_PROVIDERS: ProviderOption[] = [
  { code: 'EKEDC', name: 'Eko Electricity Distribution', shortName: 'Eko (EKEDC)', region: 'Lagos (Elko)', logoBg: 'bg-blue-600', textColor: 'text-white' },
  { code: 'IKEDC', name: 'Ikeja Electricity Distribution', shortName: 'Ikeja (IKEDC)', region: 'Lagos (Ikeja)', logoBg: 'bg-red-650 bg-red-600', textColor: 'text-white' },
  { code: 'AEDC', name: 'Abuja Electricity', shortName: 'Abuja (AEDC)', region: 'Abuja (FCT)', logoBg: 'bg-amber-500', textColor: 'text-slate-950' },
  { code: 'PHED', name: 'Port Harcourt Electricity', shortName: 'PH (PHED)', region: 'Rivers, South-South', logoBg: 'bg-teal-600', textColor: 'text-white' },
  { code: 'IBEDC', name: 'Ibadan Electricity Distribution', shortName: 'Ibadan (IBEDC)', region: 'Oyo, Osun, Ogun', logoBg: 'bg-purple-600', textColor: 'text-white' },
  { code: 'KAEDCO', name: 'Kaduna Electricity Distribution', shortName: 'Kaduna (KAEDCO)', region: 'Kaduna', logoBg: 'bg-indigo-600', textColor: 'text-white' },
  { code: 'KEDCO', name: 'Kano Electricity', shortName: 'Kano (KEDCO)', region: 'Kano, Katsina', logoBg: 'bg-emerald-600', textColor: 'text-white' },
  { code: 'EEDC', name: 'Enugu Electricity', shortName: 'Enugu (EEDC)', region: 'Enugu, Abia, Imo', logoBg: 'bg-rose-600', textColor: 'text-white' },
];

export default function ElectricitySection() {
  const { user } = useAuth();
  
  // Steps: 1 = Form & Provider select, 2 = Validation Receipt / Confirm, 3 = Receipt Success
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [provider, setProvider] = React.useState<ProviderOption | null>(null);
  const [meterNumber, setMeterNumber] = React.useState('');
  const [meterType, setMeterType] = React.useState<'prepaid' | 'postpaid'>('prepaid');
  const [amount, setAmount] = React.useState('');
  
  // Validation State variables
  const [isValidating, setIsValidating] = React.useState(false);
  const [validatedAccount, setValidatedAccount] = React.useState<{
    customerName: string;
    address: string;
    meterNumber: string;
    provider: string;
    type: string;
    debtAmount: number;
    minimumAmount: number;
  } | null>(null);

  // Loading spinner during final payment dispatch
  const [isPaying, setIsPaying] = React.useState(false);
  const [paymentReceipt, setPaymentReceipt] = React.useState<{
    ref: string;
    provider: string;
    meterNumber: string;
    meterType: string;
    customerName: string;
    address: string;
    amount: number;
    cashbackEarned: number;
    token?: string;
    date: string;
  } | null>(null);

  // Quick Amount Selector
  const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000];

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) {
      toast.error('Please select an electricity distribution provider.');
      return;
    }
    if (!meterNumber.trim()) {
      toast.error('Please enter your meter token ID or account number.');
      return;
    }
    if (meterNumber.trim().length < 6) {
      toast.error('Meter Number must be at least 6 digits long.');
      return;
    }
    if (!amount || Number(amount) < 100) {
      toast.error('Minimum electricity recharge amount is ₦100.00');
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch('/api/v1/utility/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'electricity',
          provider: provider.code,
          number: meterNumber.trim()
        })
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        setValidatedAccount({
          customerName: resData.customerName,
          address: resData.address || 'Address Verified',
          meterNumber: resData.meterNumber,
          provider: resData.provider,
          type: meterType,
          debtAmount: resData.debtAmount || 0,
          minimumAmount: 100
        });
        setStep(2);
        toast.success("Account Details Verified Successfully!");
      } else {
        toast.error(resData.error || "Verification failed. Check your meter number or provider.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Account verification network timeout. Please type meter code again.");
    } finally {
      setIsValidating(false);
    }
  };

  const handlePayment = async () => {
    if (!user || !provider || !validatedAccount) return;
    setIsPaying(true);

    const finalBillingAmount = Number(amount);
    if (user.balance < finalBillingAmount) {
      toast.error("Insufficient wallet balance. Please fund your wallet first.");
      setIsPaying(false);
      return;
    }

    try {
      const displayPlan = `${meterType.toUpperCase()} Electricity Unit Token (${provider.code})`;
      const response = await fetch('/api/v1/utility/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          type: 'electricity',
          provider: provider.code,
          number: meterNumber.trim(),
          plan: displayPlan,
          amount: finalBillingAmount
        })
      });

      const resData = await response.json();
      if (response.ok && resData.status === 'success') {
        const txRef = resData.transaction?.reference || `ELE-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        const cashback = resData.transaction?.cashbackEarned || 0;
        const meterToken = resData.transaction?.token || '';

        setPaymentReceipt({
          ref: txRef,
          provider: provider.name,
          meterNumber: meterNumber.trim(),
          meterType: meterType.toUpperCase(),
          customerName: validatedAccount.customerName,
          address: validatedAccount.address,
          amount: finalBillingAmount,
          cashbackEarned: cashback,
          token: meterToken || undefined,
          date: new Date().toLocaleString()
        });

        toast.success("Electricity Subscription completed!");
        setStep(3);
      } else {
        toast.error(resData.error || "Dispatched transaction was rejected by utility gateway.");
      }
    } catch (err) {
      console.error(err);
      toast.error("High frequency gateway error. Re-requesting transaction...");
    } finally {
      setIsPaying(false);
    }
  };

  const resetFlow = () => {
    setProvider(null);
    setMeterNumber('');
    setAmount('');
    setValidatedAccount(null);
    setPaymentReceipt(null);
    setStep(1);
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Upper header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900">Electricity Bill Payment</h3>
          <p className="text-xs text-slate-500 font-medium">Clear energy tokens & postpaid utility balance instantly</p>
        </div>
        {provider && step === 1 && (
          <button 
            onClick={() => setProvider(null)}
            className="flex items-center gap-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-full transition-all"
          >
            Change Provider
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }} 
            className="space-y-6"
          >
            {/* GRID 1: Select Provider */}
            {!provider ? (
              <div className="space-y-4">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1 block">
                  Select Distribution Company (DISCO)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {ELECTRICITY_PROVIDERS.map((disc) => (
                    <button
                      key={disc.code}
                      onClick={() => setProvider(disc)}
                      className="border border-slate-100 bg-white rounded-3xl p-5 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-50/40 text-left transition-all flex flex-col justify-between h-36 outline-none"
                    >
                      <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm", disc.logoBg, disc.textColor)}>
                        {disc.code.slice(0, 3)}
                      </div>
                      <div className="mt-4">
                        <h4 className="font-extrabold text-slate-800 text-sm tracking-tight truncate">{disc.shortName}</h4>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">{disc.region}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* PROVIDER CHOSEN: Fill details Form */
              <div className="bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm max-w-2xl mx-auto">
                {/* Active Disco Info Bar */}
                <div className="p-6 border-b border-slate-50 bg-slate-50/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                      <Zap size={20} />
                    </span>
                    <div>
                      <h4 className="font-extrabold text-slate-900">{provider.name}</h4>
                      <p className="text-[10px] text-slate-400 font-extrabold tracking-widest uppercase">Verified Instant Token Clearance</p>
                    </div>
                  </div>
                  <div className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">
                    {provider.code}
                  </div>
                </div>

                <form onSubmit={handleValidate} className="p-8 space-y-6">
                  {/* Meter Type Choice */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Meter Mode</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setMeterType('prepaid')}
                        className={cn(
                          "py-4 rounded-2xl border text-sm font-extrabold text-center transition-all",
                          meterType === 'prepaid' 
                            ? "border-amber-500 bg-amber-50/40 text-amber-700" 
                            : "border-slate-100 hover:bg-slate-50 text-slate-600"
                        )}
                      >
                        ⚡ Prepaid (Generate Token PIN)
                      </button>
                      <button
                        type="button"
                        onClick={() => setMeterType('postpaid')}
                        className={cn(
                          "py-4 rounded-2xl border text-sm font-extrabold text-center transition-all",
                          meterType === 'postpaid' 
                            ? "border-amber-500 bg-amber-50/40 text-amber-700" 
                            : "border-slate-100 hover:bg-slate-50 text-slate-600"
                        )}
                      >
                        📄 Postpaid (Direct Bill Settlement)
                      </button>
                    </div>
                  </div>

                  {/* Meter Number / Account Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1 flex justify-between">
                      <span>Meter Token Number / Account ID</span>
                      <span className="text-slate-300 font-bold tracking-normal uppercase text-[9px]">Provider ID check safe</span>
                    </label>
                    <input
                      required
                      type="text"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={meterNumber}
                      onChange={(e) => setMeterNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 54129874612"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4  px-5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500"
                    />
                  </div>

                  {/* Specifying Amount */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Specify Subscription Amount (₦)</label>
                    <input
                      required
                      type="text"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                      placeholder="Minimum: ₦100.00"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500"
                    />

                    {/* Quick values buttons */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 select-none">
                      {QUICK_AMOUNTS.map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setAmount(String(val))}
                          className={cn(
                            "py-2 rounded-xl text-xs font-semibold border transition-all",
                            amount === String(val) 
                              ? "bg-amber-500 text-white border-amber-500 font-bold" 
                              : "bg-white text-slate-600 border-slate-100 hover:bg-slate-50"
                          )}
                        >
                          + ₦{val.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="pt-4 flex gap-4">
                    <button
                      type="button"
                      onClick={() => setProvider(null)}
                      className="flex-1 py-4 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold transition-all text-sm"
                    >
                      Change Disco
                    </button>
                    <button
                      disabled={isValidating}
                      type="submit"
                      className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl py-4 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-100"
                    >
                      {isValidating ? (
                        <>
                          <Loader2 className="animate-spin" size={18} /> Validating Digital Account...
                        </>
                      ) : (
                        <>
                          Verify & Proceed <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </motion.div>
        )}

        {step === 2 && validatedAccount && provider && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0 }} 
            className="max-w-xl mx-auto space-y-6"
          >
            {/* STAGE 2: Verification summary */}
            <div className="p-6 rounded-3xl bg-green-500/5 border border-green-100 flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                <ShieldCheck size={22} />
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase font-black text-green-700 tracking-wider">Account Validation Confirmed</p>
                <h4 className="font-extrabold text-slate-900 text-lg leading-snug">{validatedAccount.customerName}</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-sans mt-0.5">{validatedAccount.address}</p>
              </div>
            </div>

            {/* In-depth Billing Invoice summary */}
            <div className="p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm space-y-4 font-sans">
              <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider pl-1 pb-2 border-b border-slate-50">Transaction Bill Invoice</h4>
              
              <div className="divide-y divide-slate-150 divide-slate-100 text-xs">
                <div className="py-3 flex justify-between">
                  <span className="text-slate-400 font-medium">Service Operator</span>
                  <span className="font-extrabold text-slate-800">{provider.name}</span>
                </div>
                <div className="py-3 flex justify-between">
                  <span className="text-slate-400 font-medium font-sans">Meter Number Token ID</span>
                  <span className="font-mono font-extrabold text-slate-800 tracking-wider">{validatedAccount.meterNumber}</span>
                </div>
                <div className="py-3 flex justify-between">
                  <span className="text-slate-400 font-medium">Operation Scheme</span>
                  <span className="font-extrabold text-slate-800 uppercase">{meterType} Token Delivery</span>
                </div>
                {validatedAccount.debtAmount > 0 ? (
                  <div className="py-3 flex justify-between text-red-500">
                    <span className="text-red-400 font-medium">Accumulated Out-of-cycle Debt</span>
                    <span className="font-bold font-mono">₦{validatedAccount.debtAmount.toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="py-3 flex justify-between">
                  <span className="text-slate-400 font-medium font-sans">Distribution Surcharge</span>
                  <span className="font-bold text-emerald-600 uppercase flex items-center gap-1">₦0.00 <span className="text-[9px] bg-emerald-50 px-1 py-0.5 rounded">FREE</span></span>
                </div>
                <div className="py-4 flex justify-between text-sm border-t border-dashed border-slate-200">
                  <span className="text-slate-900 font-extrabold">Total Outflow Debit</span>
                  <span className="text-lg font-black text-blue-600 font-mono">{formatCurrency(Number(amount))}</span>
                </div>
              </div>

              {user && (
                <div className="border border-dashed border-slate-200 bg-slate-50 p-3 rounded-xl flex justify-between items-center text-xs text-slate-500">
                  <span>Current Bal: <strong>{formatCurrency(user.balance)}</strong></span>
                  <span>Bal After: <strong className="text-slate-700">{formatCurrency(user.balance - Number(amount))}</strong></span>
                </div>
              )}
            </div>

            {/* Actions for flow */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setStep(1)}
                className="py-4 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-2xl font-bold transition-all text-sm"
              >
                Change Details
              </button>
              <button
                disabled={isPaying}
                onClick={handlePayment}
                className="py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-100"
              >
                {isPaying ? (
                  <>
                    <Loader2 className="animate-spin" size={18} /> Instantly paying...
                  </>
                ) : (
                  <>
                    Confirm & Complete <CheckCircle2 size={18} />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && paymentReceipt && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="max-w-xl mx-auto space-y-6"
          >
            {/* SUCCESS INTERFACE WITH METADATA TOKEN */}
            <div className="text-center py-6 space-y-3">
              <SuccessFeedback size={70} showConfetti={true} />
              <div>
                <h4 className="text-2xl font-black text-slate-900 mt-2">Payment Completed!</h4>
                <p className="text-xs text-slate-400 font-extrabold tracking-widest uppercase">AUTOMATED ENERGY DISPATCH CLEAR</p>
              </div>
            </div>

            {/* PREPAID KEY DISPLAY IF AVAILABLE */}
            {paymentReceipt.token && (
              <div className="p-6 rounded-3xl bg-amber-500/5 border border-amber-200 text-center space-y-1 relative overflow-hidden">
                <p className="text-[10px] uppercase font-black text-amber-700 tracking-wider">PREPAID ENERGY TOKEN PIN</p>
                <h5 className="font-mono font-black text-slate-900 text-2xl tracking-widest select-all relative z-10">{paymentReceipt.token}</h5>
                <p className="text-xs text-amber-600 font-semibold max-w-sm mx-auto leading-relaxed">Copy or print this token key and input it in your physical prepaid meter monitor terminal.</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(paymentReceipt.token || '');
                    toast.success('Token PIN Copied!');
                  }}
                  className="absolute top-4 right-4 text-amber-600 hover:text-amber-800 p-1.5 hover:bg-amber-100 rounded-full transition-all"
                  title="Copy Token"
                >
                  <Copy size={16} />
                </button>
              </div>
            )}

            {/* Receipt Summary details */}
            <div className="bg-slate-50 rounded-[2rem] border border-slate-100 p-6 space-y-3.5 divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between items-center first:pt-0">
                <span className="text-slate-400 font-medium">Merchant Business</span>
                <span className="font-extrabold text-slate-800">Noroya Data Hub</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium">Distribution Operator</span>
                <span className="font-extrabold text-slate-800">{paymentReceipt.provider}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium">Customer Name</span>
                <span className="font-extrabold text-slate-800">{paymentReceipt.customerName}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium">Meter Identification</span>
                <span className="font-mono font-extrabold text-slate-800">{paymentReceipt.meterNumber} ({paymentReceipt.meterType})</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium">Outflow Settled Amount</span>
                <span className="font-black text-slate-900 font-mono text-sm">{formatCurrency(paymentReceipt.amount)}</span>
              </div>
              {paymentReceipt.cashbackEarned > 0 ? (
                <div className="py-2.5 flex justify-between items-center">
                  <span className="text-amber-700 font-bold">Instantly Earned Cashback</span>
                  <span className="font-black font-mono text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                    + {formatCurrency(paymentReceipt.cashbackEarned)} Limitless
                  </span>
                </div>
              ) : null}
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium font-sans">Reference Token ID</span>
                <span className="font-mono font-extrabold text-slate-650">{paymentReceipt.ref}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium">Transaction Timestamp</span>
                <span className="font-bold text-slate-700">{paymentReceipt.date}</span>
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => window.print()}
                className="py-4 rounded-xl bg-slate-900 text-white font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 hover:bg-black transition-all shadow-md"
              >
                <Printer size={16} /> Print E-Receipt
              </button>
              <button
                onClick={resetFlow}
                className="py-4 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 font-extrabold text-xs tracking-wider uppercase transition-all"
              >
                New Token Settlement
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
