import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tv, ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, Loader2, Printer, Copy, ShieldCheck, CreditCard } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import SuccessFeedback from './SuccessFeedback';

interface CableProvider {
  code: string;
  name: string;
  shortName: string;
  logoBg: string; // Tailwind class
  textColor: string;
  packages: { id: string; planId: string; name: string; price: number; duration: string }[];
}

export default function CableTvSection() {
  const { user } = useAuth();
  
  // Steps: 1 = Form & Provider/Package selection, 2 = Validation Summary & Confirm, 3 = Success E-Receipt
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [provider, setProvider] = React.useState<CableProvider | null>(null);
  const [smartcardNo, setSmartcardNo] = React.useState('');
  const [selectedPackage, setSelectedPackage] = React.useState<{ id: string; planId: string; name: string; price: number; duration: string } | null>(null);
  const [cableProviders, setCableProviders] = React.useState<CableProvider[]>([]);
  const [plansLoading, setPlansLoading] = React.useState(true);
  
  // Validation States
  const [isValidating, setIsValidating] = React.useState(false);
  const [validatedAccount, setValidatedAccount] = React.useState<{
    customerName: string;
    smartcardNo: string;
    provider: string;
    packageName: string;
    price: number;
    dueDate: string;
  } | null>(null);

  // Payment transaction states
  const [isPaying, setIsPaying] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/services/cable');
        const rows = await response.json();
        if (!response.ok) throw new Error(rows?.error || 'Could not load cable plans');
        const grouped = new Map<string, CableProvider>();
        (Array.isArray(rows) ? rows : []).forEach((row: any) => {
          const code = String(row.provider_or_network || '').trim().toUpperCase();
          if (!code) return;
          const current = grouped.get(code) || { code, name: `${code} Nigeria`, shortName: code, logoBg: 'bg-blue-600', textColor: 'text-white', packages: [] };
          current.packages.push({
            id: String(row.id),
            planId: String(row.bigisub_plan_id || row.mozosubz_plan_id || row.id),
            name: String(row.item_name || row.plan_name || 'Cable package'),
            price: Number(row.selling_price || 0),
            duration: String(row.validity_days || row.duration || '1 Month'),
          });
          grouped.set(code, current);
        });
        if (!cancelled) setCableProviders([...grouped.values()].filter(x => x.packages.length));
      } catch (error: any) {
        if (!cancelled) toast.error(error.message || 'Could not load active cable packages.');
      } finally { if (!cancelled) setPlansLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const [paymentReceipt, setPaymentReceipt] = React.useState<{
    ref: string;
    provider: string;
    smartcardNo: string;
    customerName: string;
    packageName: string;
    amount: number;
    cashbackEarned: number;
    date: string;
  } | null>(null);

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) {
      toast.error('Please select a Cable TV service provider.');
      return;
    }
    if (!smartcardNo.trim()) {
      toast.error('Please enter your Smartcard or IUC number.');
      return;
    }
    if (smartcardNo.trim().length < 8) {
      toast.error('Decoder identification number must be at least 8 digits long.');
      return;
    }
    if (!selectedPackage) {
      toast.error('Please choose a packages subscription bundle.');
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch('/api/v1/utility/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cable',
          provider: provider.code,
          number: smartcardNo.trim()
        })
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        const uppercaseProvider = provider.code.toUpperCase();
        
        // Expiration calculation: Current date + 30 days
        const expire = new Date();
        expire.setDate(expire.getDate() + 30);
        const dueDate = expire.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

        setValidatedAccount({
          customerName: resData.customerName,
          smartcardNo: smartcardNo.trim(),
          provider: uppercaseProvider,
          packageName: selectedPackage.name,
          price: selectedPackage.price,
          dueDate
        });

        setStep(2);
        toast.success("Subscriber Smartcard Verified!");
      } else {
        toast.error(resData.error || "Validation failed. Check smartcard ID and billing operator status.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Validation failed. Check smartcard ID and billing operator status.");
    } finally {
      setIsValidating(false);
    }
  };

  const handlePayment = async () => {
    if (!user || !provider || !validatedAccount || !selectedPackage) return;
    setIsPaying(true);

    const subscriptionPrice = selectedPackage.price;
    if (user.balance < subscriptionPrice) {
      toast.error("Insufficient wallet balance. Please fund your main wallet.");
      setIsPaying(false);
      return;
    }

    try {
      const displayPlan = `${provider.shortName} ${selectedPackage.name} Monthly Pack`;
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/buy-utility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          userId: user.uid,
          type: 'cable',
          provider: provider.code,
          number: smartcardNo.trim(),
          plan: selectedPackage.planId,
          amount: subscriptionPrice,
          phone: (user as any)?.phone || (user as any)?.phone_number || smartcardNo.trim()
        })
      });

      const resData = await response.json();
      if (response.ok && (resData.status === 'success' || resData.success === true)) {
        const txRef = resData.transaction?.reference || `CAB-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        const cashback = resData.transaction?.cashbackEarned || 0;

        setPaymentReceipt({
          ref: txRef,
          provider: provider.name,
          smartcardNo: smartcardNo.trim(),
          customerName: validatedAccount.customerName,
          packageName: selectedPackage.name,
          amount: subscriptionPrice,
          cashbackEarned: cashback,
          date: new Date().toLocaleString()
        });

        toast.success("Cable TV Subscription Completed successfully!");
        setStep(3);
      } else {
        toast.error(resData.error || "Dispatched subscription was rejected by billing gateway.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Billing network gateway connection timeout. Retrying...");
    } finally {
      setIsPaying(false);
    }
  };

  const resetFlow = () => {
    setProvider(null);
    setSmartcardNo('');
    setSelectedPackage(null);
    setValidatedAccount(null);
    setPaymentReceipt(null);
    setStep(1);
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900">Cable TV Subscriptions</h3>
          <p className="text-xs text-slate-500 font-medium">Recharge GOtv, DStv & StarTimes decoders instantly online</p>
        </div>
        {provider && step === 1 && (
          <button 
            type="button"
            onClick={() => { setProvider(null); setSelectedPackage(null); }}
            className="flex items-center gap-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-full transition-all"
          >
            Change Operator
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
            {/* GRID 1: Select Operator */}
            {!provider ? (
              <div className="space-y-4">
                {plansLoading && <p className="text-xs text-slate-500">Loading active cable packages…</p>}
                {!plansLoading && cableProviders.length === 0 && <p className="text-xs text-rose-500">No active cable packages are available. Ask an admin to publish one.</p>}
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1 block">
                  Select Cable Provider
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {cableProviders.map((cab) => (
                    <button
                      key={cab.code}
                      onClick={() => setProvider(cab)}
                      className="border border-slate-100 bg-white rounded-3xl p-6 hover:border-purple-300 hover:shadow-lg hover:shadow-purple-50/40 text-left transition-all flex flex-col justify-between h-40 outline-none"
                    >
                      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm", cab.logoBg, cab.textColor)}>
                        {cab.shortName}
                      </div>
                      <div className="mt-4">
                        <h4 className="font-extrabold text-slate-800 text-base tracking-tight">{cab.name}</h4>
                        <p className="text-xs text-slate-400 font-medium mt-1">Starting from ₦{cab.packages[0].price.toLocaleString()} / month</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* PROVIDER CHOSEN: Smartcard form & package list selection */
              <div className="bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm max-w-2xl mx-auto">
                {/* Active operator banner header */}
                <div className="p-6 border-b border-slate-50 bg-slate-50/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                      <Tv size={20} />
                    </span>
                    <div>
                      <h4 className="font-extrabold text-slate-900">{provider.name} Booster</h4>
                      <p className="text-[10px] text-slate-400 font-extrabold tracking-widest uppercase">Verified decoder account activation</p>
                    </div>
                  </div>
                  <div className="text-xs font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg">
                    {provider.code}
                  </div>
                </div>

                <form onSubmit={handleValidate} className="p-8 space-y-6">
                  
                  {/* Smartcard Number / IUC ID input */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1 flex justify-between">
                      <span>Smartcard / IUC Decoder Identification</span>
                      <span className="text-slate-300 font-bold tracking-normal uppercase text-[9px]">MultiChoice validation safe</span>
                    </label>
                    <input
                      required
                      type="text"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={smartcardNo}
                      onChange={(e) => setSmartcardNo(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 1024567890"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4  px-5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/10 focus:border-purple-500"
                    />
                  </div>

                  {/* Selecting premium packages */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Select Cable subscription Bouquet Package</label>
                    <div className="grid grid-cols-1 gap-2.5 max-h-60 overflow-y-auto pr-1">
                      {provider.packages.map((pkg) => {
                        const isChosen = selectedPackage?.id === pkg.id;
                        return (
                          <button
                            key={pkg.id}
                            type="button"
                            onClick={() => setSelectedPackage(pkg)}
                            className={cn(
                              "w-full text-left p-4 rounded-2xl border text-sm font-bold flex items-center justify-between transition-all outline-none",
                              isChosen 
                                ? "border-purple-600 bg-purple-50/50 text-purple-700" 
                                : "border-slate-100 bg-slate-50/30 hover:bg-slate-50 text-slate-700"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn("w-2.5 h-2.5 rounded-full", isChosen ? "bg-purple-600" : "bg-slate-300")} />
                              <span>{pkg.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-base font-black">₦{pkg.price.toLocaleString()}</span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-white border border-slate-100 px-1.5 py-0.5 rounded">
                                {pkg.duration}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="pt-4 flex gap-4">
                    <button
                      type="button"
                      onClick={() => { setProvider(null); setSelectedPackage(null); }}
                      className="flex-1 py-4 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold transition-all text-sm"
                    >
                      Change operator
                    </button>
                    <button
                      disabled={isValidating}
                      type="submit"
                      className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl py-4 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-100"
                    >
                      {isValidating ? (
                        <>
                          <Loader2 className="animate-spin" size={18} /> Validating Subscriber...
                        </>
                      ) : (
                        <>
                          Verify Subscription <ArrowRight size={18} />
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
                <p className="text-xs uppercase font-black text-green-700 tracking-wider">Subscriber Details Verified</p>
                <h4 className="font-extrabold text-slate-900 text-lg leading-snug">{validatedAccount.customerName}</h4>
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  Smartcard / IUC Code safe check confirm. Status: Active.
                </p>
              </div>
            </div>

            {/* Billing detail card summary */}
            <div className="p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm space-y-4 font-sans">
              <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider pl-1 pb-2 border-b border-slate-50 font-sans">Cable TV Subscription Invoice</h4>
              
              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-3 flex justify-between">
                  <span className="text-slate-400 font-medium font-sans">Channel Operator</span>
                  <span className="font-extrabold text-slate-800">{provider.name}</span>
                </div>
                <div className="py-3 flex justify-between">
                  <span className="text-slate-400 font-medium font-sans">Decoder Card PIN</span>
                  <span className="font-mono font-extrabold text-slate-800 tracking-wider">{validatedAccount.smartcardNo}</span>
                </div>
                <div className="py-3 flex justify-between">
                  <span className="text-slate-400 font-medium">Selected Package Bouquet</span>
                  <span className="font-extrabold text-slate-800">{validatedAccount.packageName}</span>
                </div>
                <div className="py-3 flex justify-between">
                  <span className="text-slate-400 font-medium">Scheduled Coverage Duration</span>
                  <span className="font-extrabold text-slate-800">30 Days (Renew: {validatedAccount.dueDate})</span>
                </div>
                <div className="py-3 flex justify-between">
                  <span className="text-slate-400 font-medium">Utility Billing Fee</span>
                  <span className="font-bold text-emerald-600 uppercase flex items-center gap-1">₦0.00 <span className="text-[9px] bg-emerald-50 px-1 py-0.5 rounded">FREE</span></span>
                </div>
                <div className="py-4 flex justify-between text-sm border-t border-dashed border-slate-200">
                  <span className="text-slate-900 font-extrabold">Total Outflow Debit</span>
                  <span className="text-lg font-black text-blue-600 font-mono">{formatCurrency(validatedAccount.price)}</span>
                </div>
              </div>

              {user && (
                <div className="border border-dashed border-slate-200 bg-slate-50 p-3 rounded-xl flex justify-between items-center text-xs text-slate-500">
                  <span>Current Bal: <strong>{formatCurrency(user.balance)}</strong></span>
                  <span>Bal After: <strong className="text-slate-700">{formatCurrency(user.balance - validatedAccount.price)}</strong></span>
                </div>
              )}
            </div>

            {/* Confirmation actions buttons */}
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
                    <Loader2 className="animate-spin" size={18} /> Recharging Decoder...
                  </>
                ) : (
                  <>
                    Confirm & Purchase <CheckCircle2 size={18} />
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
            {/* SUCCESS INTERFACE */}
            <div className="text-center py-6 space-y-3">
              <SuccessFeedback size={70} showConfetti={true} />
              <div>
                <h4 className="text-2xl font-black text-slate-900 mt-2">Subscription Completed!</h4>
                <p className="text-xs text-slate-400 font-extrabold tracking-widest uppercase font-sans">AUTOMATED CABLE DECODER RECHARGED</p>
              </div>
            </div>

            {/* Receipt Summary details */}
            <div className="bg-slate-50 rounded-[2rem] border border-slate-100 p-6 space-y-3.5 divide-y divide-slate-100 text-xs font-sans">
              <div className="py-2.5 flex justify-between items-center first:pt-0">
                <span className="text-slate-400 font-medium font-sans">Merchant Outlet</span>
                <span className="font-extrabold text-slate-800">NORODATA Hub</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium font-sans">Cable TV Service</span>
                <span className="font-extrabold text-slate-800">{paymentReceipt.provider}</span>
              </div>
              <span className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium">Subscriber Name</span>
                <span className="font-extrabold text-slate-800">{paymentReceipt.customerName}</span>
              </span>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium font-sans">IUC Smartcard Number</span>
                <span className="font-mono font-extrabold text-slate-800">{paymentReceipt.smartcardNo}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium">Recharged Package Plan</span>
                <span className="font-extrabold text-slate-800">{paymentReceipt.packageName}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-slate-400 font-medium font-mono">Outflow Debit Cost</span>
                <span className="font-black text-slate-900 font-mono text-sm">{formatCurrency(paymentReceipt.amount)}</span>
              </div>
              {paymentReceipt.cashbackEarned > 0 ? (
                <div className="py-2.5 flex justify-between items-center col">
                  <span className="text-amber-700 font-bold">Earned Cashback Bonus</span>
                  <span className="font-black font-mono text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                    + {formatCurrency(paymentReceipt.cashbackEarned)}
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
                New Subscription
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
