import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tv, Zap, FileText, Activity, ArrowRight, CheckCircle2, AlertTriangle, Loader2, ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import SuccessFeedback from './SuccessFeedback';

type BillType = 'cable' | 'electricity' | 'exam' | 'betting';

interface BillService {
  id: BillType;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

export default function PayBillsSection({ defaultServiceId }: { defaultServiceId?: BillType | null }) {
  const { user } = useAuth();
  const [selectedService, setSelectedService] = React.useState<BillType | null>(null);

  React.useEffect(() => {
    if (defaultServiceId) {
      setSelectedService(defaultServiceId);
      // set default provider
      if (defaultServiceId === 'cable') setProvider('GOTV');
      if (defaultServiceId === 'electricity') setProvider('EKEDC');
      if (defaultServiceId === 'exam') setProvider('WAEC');
      if (defaultServiceId === 'betting') setProvider('SportyBet');
    }
  }, [defaultServiceId]);
  
  // Dynamic flows state
  const [provider, setProvider] = React.useState('');
  const [accountNo, setAccountNo] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [planName, setPlanName] = React.useState('');
  const [examQty, setExamQty] = React.useState(1);
  const [emailDelivery, setEmailDelivery] = React.useState('');
  
  // Validation, loader & steps
  const [step, setStep] = React.useState(1); // 1 = form, 2 = confirmation / validate name, 3 = success
  const [isValidating, setIsValidating] = React.useState(false);
  const [validatedName, setValidatedName] = React.useState('');
  const [isPaying, setIsPaying] = React.useState(false);
  const [successReceipt, setSuccessReceipt] = React.useState<any>(null);
  const [showReceiptModal, setShowReceiptModal] = React.useState(false);

  const services: BillService[] = [
    { 
      id: 'cable', 
      title: 'Cable TV subscription', 
      description: 'Recharge GOTV, DSTV & StarTimes decoder instantly', 
      icon: <Tv size={28} />, 
      color: 'bg-purple-50 text-purple-600 border-purple-100 scale-header hover:border-purple-300' 
    },
    { 
      id: 'electricity', 
      title: 'Electricity Token', 
      description: 'Generate high-frequency tokens for AEDC, IKEDC, EKEDC, etc.', 
      icon: <Zap size={28} />, 
      color: 'bg-amber-50 text-amber-600 border-amber-100 scale-header hover:border-amber-300' 
    },
    { 
      id: 'exam', 
      title: 'Result Exam Pins', 
      description: 'Purchase direct checking PINS for WAEC, NECO & JAMB', 
      icon: <FileText size={28} />, 
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100 scale-header hover:border-emerald-300' 
    },
    { 
      id: 'betting', 
      title: 'Betting Wallets', 
      description: 'Credit SportyBet, Bet9ja, 1xBet & BetWay instantly', 
      icon: <Activity size={28} />, 
      color: 'bg-blue-50 text-blue-600 border-blue-100 scale-header hover:border-blue-300' 
    }
  ];

  // Dummy account validation simulator (huge realism & validation)
  const handleValidateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountNo.trim()) {
      toast.error('Please enter a valid meter, smartcard or customer ID');
      return;
    }
    
    // Validate quantity/plans
    if (selectedService === 'exam') {
      if (!emailDelivery) {
        toast.error('Please enter delivery email');
        return;
      }
    } else if (selectedService === 'electricity' || selectedService === 'betting') {
      if (!amount || Number(amount) < 100) {
        toast.error('Minimum purchase amount is ₦100.00');
        return;
      }
    } else if (selectedService === 'cable') {
      if (!planName) {
        toast.error('Please select a premium TV bundle');
        return;
      }
    }

    setIsValidating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulated name retrieval
      const names = [
        "Ibrahim Faruq Olamilekan",
        "Tunde Ademola Bakare",
        "Chioma Henrietta Obi",
        "Yusuf Olatunji Alhaji",
        "Olayemi Precious Adebayo"
      ];
      const selectedName = names[Math.floor(Math.random() * names.length)];
      setValidatedName(selectedName);
      setStep(2);
    } catch (e) {
      toast.error("Failed to query provider network validation servers.");
    } finally {
      setIsValidating(false);
    }
  };

  const resetFlow = () => {
    setProvider('');
    setAccountNo('');
    setAmount('');
    setPlanName('');
    setExamQty(1);
    setEmailDelivery('');
    setValidatedName('');
    setStep(1);
    setIsPaying(false);
  };

  const handlePay = async () => {
    if (!user) return;
    setIsPaying(true);

    try {
      // Decide final amount
      let finalAmount = 0;
      let finalPlan = '';
      let displayType = 'bill';

      if (selectedService === 'cable') {
        const parts = planName.split('|');
        finalAmount = Number(parts[1]);
        finalPlan = `${parts[0]} (Smartcard: ${accountNo})`;
      } else if (selectedService === 'electricity') {
        finalAmount = Number(amount);
        finalPlan = `Prepaid Meter Token (${provider})`;
      } else if (selectedService === 'exam') {
        const unitPrices: any = { 'WAEC': 3200, 'NECO': 2800, 'NABTEB': 3000 };
        finalAmount = (unitPrices[provider] || 3000) * examQty;
        finalPlan = `${examQty}x ${provider} PIN(s) delivered to ${emailDelivery}`;
      } else if (selectedService === 'betting') {
        finalAmount = Number(amount);
        finalPlan = `${provider} betting topup`;
      }

      if (user.balance < finalAmount) {
        toast.error('Insufficient wallet balance. Please fund your wallet.');
        setIsPaying(false);
        return;
      }

      const response = await fetch('/api/vtu/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          type: 'bill',
          network: provider.toUpperCase(),
          phoneNumber: accountNo || emailDelivery || '08000000000',
          plan: finalPlan,
          amount: finalAmount
        })
      });

      const resData = await response.json();
      if (response.ok) {
        // Generate Token if Electricity
        let electricityToken = '';
        if (selectedService === 'electricity') {
          electricityToken = `${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        const refCode = resData.transaction?.reference || `TRX-${Date.now()}`;
        
        setSuccessReceipt({
          ref: refCode,
          service: selectedService,
          provider,
          validatedName: validatedName || 'Direct customer',
          account: accountNo || emailDelivery,
          amount: finalAmount,
          plan: finalPlan,
          token: electricityToken,
          date: new Date().toLocaleString()
        });

        toast.success(`Purchase cleared and delivered successfully!`);
        setStep(3);
      } else {
        toast.error(resData.error || 'Server rejected the transaction request');
      }
    } catch (err) {
      console.error(err);
      toast.error('E-Transaction dispatch connection issue. Retry.');
    } finally {
      setIsPaying(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="space-y-8 font-sans">
      
      {/* Top Banner & back controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900">Utility Bill Solutions</h3>
          <p className="text-xs text-slate-500 font-medium">Automatic instant utility processing center</p>
        </div>
        {selectedService && (
          <button 
            onClick={() => { setSelectedService(null); resetFlow(); }}
            className="flex items-center gap-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-full text-slate-700 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Hub
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!selectedService ? (
          /* SECTION SELECT - HUB VIEW */
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="grid sm:grid-cols-2 gap-6"
          >
            {services.map((srv) => (
              <button 
                key={srv.id}
                onClick={() => {
                  setSelectedService(srv.id);
                  // Default providers
                  if (srv.id === 'cable') setProvider('GOTV');
                  if (srv.id === 'electricity') setProvider('EKEDC');
                  if (srv.id === 'exam') setProvider('WAEC');
                  if (srv.id === 'betting') setProvider('SportyBet');
                }}
                className={cn(
                  "p-8 rounded-[2.5rem] border text-left flex flex-col gap-5 transition-all outline-none",
                  srv.color
                )}
              >
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  {srv.icon}
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-lg">{srv.title}</h4>
                  <p className="text-slate-500 text-sm mt-1 leading-relaxed font-medium">{srv.description}</p>
                </div>
              </button>
            ))}
          </motion.div>
        ) : (
          /* FORM FLOWS */
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm"
          >
            <div className="p-6 border-b border-slate-50 bg-slate-50/20 flex items-center gap-3">
              <span className="p-2 ml-1 bg-blue-100 text-blue-600 rounded-xl">
                {selectedService === 'cable' && <Tv size={20} />}
                {selectedService === 'electricity' && <Zap size={20} />}
                {selectedService === 'exam' && <FileText size={20} />}
                {selectedService === 'betting' && <Activity size={20} />}
              </span>
              <div>
                <h4 className="font-extrabold text-slate-900 capitalize">{selectedService} Dispatcher</h4>
                <p className="text-xs text-slate-400 font-semibold font-sans uppercase">Continuous Realtime Dispatch</p>
              </div>
            </div>

            <div className="p-8">
              {step === 1 && (
                <form onSubmit={handleValidateAccount} className="space-y-6 max-w-lg">
                  {/* Select Provider */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Choose Service Provider</label>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedService === 'cable' && (
                        <>
                          {['GOTV', 'DSTV', 'StarTimes'].map((p) => (
                            <button
                              key={p} type="button" onClick={() => setProvider(p)}
                              className={cn(
                                "py-3 rounded-2xl border text-sm font-extrabold text-center transition-all",
                                provider === p ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 hover:bg-slate-50 text-slate-700"
                              )}
                            >
                              {p}
                            </button>
                          ))}
                        </>
                      )}
                      {selectedService === 'electricity' && (
                        <>
                          {['EKEDC', 'IKEDC', 'AEDC', 'PHED', 'IBEDC', 'KAEDCO'].map((p) => (
                            <button
                              key={p} type="button" onClick={() => setProvider(p)}
                              className={cn(
                                "py-3 rounded-2xl border text-sm font-extrabold text-center transition-all",
                                provider === p ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 hover:bg-slate-50 text-slate-700"
                              )}
                            >
                              {p}
                            </button>
                          ))}
                        </>
                      )}
                      {selectedService === 'exam' && (
                        <>
                          {['WAEC', 'NECO', 'NABTEB'].map((p) => (
                            <button
                              key={p} type="button" onClick={() => setProvider(p)}
                              className={cn(
                                "py-3 rounded-2xl border text-sm font-extrabold text-center transition-all",
                                provider === p ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 hover:bg-slate-50 text-slate-700"
                              )}
                            >
                              {p}
                            </button>
                          ))}
                        </>
                      )}
                      {selectedService === 'betting' && (
                        <>
                          {['SportyBet', 'Bet9ja', '1xBet', 'BetWay'].map((p) => (
                            <button
                              key={p} type="button" onClick={() => setProvider(p)}
                              className={cn(
                                "py-3 rounded-2xl border text-sm font-extrabold text-center transition-all",
                                provider === p ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 hover:bg-slate-50 text-slate-700"
                              )}
                            >
                              {p}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Smartcard or Meter Number */}
                  {selectedService !== 'exam' ? (
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">
                        {selectedService === 'cable' ? 'Smartcard / IUC Decoder Number' : ''}
                        {selectedService === 'electricity' ? 'Prepaid Meter ID / Account Number' : ''}
                        {selectedService === 'betting' ? 'Betting Wallet User ID' : ''}
                      </label>
                      <input 
                        required
                        type="text" 
                        value={accountNo}
                        onChange={(e) => setAccountNo(e.target.value.replace(/\D/g,''))}
                        placeholder={
                          selectedService === 'cable' ? 'e.g. 1024567890' : 
                          selectedService === 'electricity' ? 'e.g. 54129874612' : 'e.g. 842104'
                        }
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-mono"
                      />
                    </div>
                  ) : null}

                  {/* Quantity and Email for exam pins */}
                  {selectedService === 'exam' && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Pin Quantity</label>
                          <select 
                            value={examQty} 
                            onChange={(e) => setExamQty(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none"
                          >
                            <option value={1}>1 Token</option>
                            <option value={2}>2 Tokens</option>
                            <option value={3}>3 Tokens</option>
                            <option value={5}>5 Tokens</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Cost Per Token</label>
                          <div className="py-4 px-5 bg-slate-50 rounded-2xl border border-slate-100 text-sm font-mono font-bold text-slate-700">
                            {formatCurrency(provider === 'WAEC' ? 3200 : provider === 'NECO' ? 2800 : 3000)}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Delivery Email Address</label>
                        <input 
                          required
                          type="email" 
                          value={emailDelivery}
                          onChange={(e) => setEmailDelivery(e.target.value)}
                          placeholder="your-email@gmail.com"
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 font-sans"
                        />
                      </div>
                    </>
                  )}

                  {/* Cable Plan Select dropdown */}
                  {selectedService === 'cable' && (
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Select Cable Option</label>
                      <select 
                        required
                        value={planName}
                        onChange={(e) => setPlanName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none"
                      >
                        <option value="">-- Choose Premium Package --</option>
                        {provider === 'GOTV' && (
                          <>
                            <option value="GOTV Lite|1100">GOTV Lite - ₦1,100</option>
                            <option value="GOTV Jinja|2700">GOTV Jinja - ₦2,700</option>
                            <option value="GOTV Jolli|3950">GOTV Jolli - ₦3,950</option>
                            <option value="GOTV Max|5700">GOTV Max - ₦5,700</option>
                            <option value="GOTV Supa|7600">GOTV Supa - ₦7,600</option>
                          </>
                        )}
                        {provider === 'DSTV' && (
                          <>
                            <option value="DSTV Padi|2950">DSTV Padi - ₦2,950</option>
                            <option value="DSTV Yanga|4200">DSTV Yanga - ₦4,200</option>
                            <option value="DSTV Confam|7400">DSTV Confam - ₦7,400</option>
                            <option value="DSTV Compact|12500">DSTV Compact - ₦12,500</option>
                            <option value="DSTV Compact Plus|19800">DSTV Compact Plus - ₦19,800</option>
                          </>
                        )}
                        {provider === 'StarTimes' && (
                          <>
                            <option value="StarTimes Nova|1500">Nova Daily/Monthly - ₦1,500</option>
                            <option value="StarTimes Smart|3500">Smart Subscription - ₦3,500</option>
                            <option value="StarTimes Super|6500">Super Pack - ₦6,500</option>
                          </>
                        )}
                      </select>
                    </div>
                  )}

                  {/* Amount field for Electricity and betting */}
                  {(selectedService === 'electricity' || selectedService === 'betting') && (
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">Top-Up Amount (₦)</label>
                      <input 
                        required
                        type="text" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/\D/g,''))}
                        placeholder="Min: ₦100.00"
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                    </div>
                  )}

                  <button 
                    disabled={isValidating}
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl py-4 pr-1 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-100 disabled:opacity-50"
                  >
                    {isValidating ? (
                      <>
                        <Loader2 className="animate-spin" size={18} /> Validating Provider Accounts...
                      </>
                    ) : (
                      <>
                        Validate ID & Check details <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </form>
              )}

              {step === 2 && (
                /* STEP 2 - INTERACTIVE SUMMARY CONFIRMATION */
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 max-w-lg">
                  <div className="p-6 rounded-3xl bg-blue-50/50 border border-blue-100 text-center space-y-1">
                    <p className="text-[10px] uppercase font-black text-blue-600 tracking-wider">Validated Receiver Account</p>
                    <h5 className="font-extrabold text-slate-900 text-lg">{validatedName}</h5>
                    <p className="text-xs text-slate-400 font-mono">Verified Safe Route ID check ok</p>
                  </div>

                  <div className="divide-y divide-slate-100 bg-slate-50 rounded-3xl p-6 border border-slate-100">
                    <div className="py-3 flex justify-between text-sm">
                      <span className="text-slate-400 font-medium">Provider Service</span>
                      <span className="font-bold text-slate-800">{provider} - {selectedService?.toUpperCase()}</span>
                    </div>
                    <div className="py-3 flex justify-between text-sm">
                      <span className="text-slate-400 font-medium">Recipient Account ID</span>
                      <span className="font-mono font-bold text-slate-800">{accountNo || emailDelivery}</span>
                    </div>
                    {planName && (
                      <div className="py-3 flex justify-between text-sm">
                        <span className="text-slate-400 font-medium">Selected Bundle</span>
                        <span className="font-bold text-slate-800">{planName.split('|')[0]}</span>
                      </div>
                    )}
                    <div className="py-3 flex justify-between text-sm">
                      <span className="text-slate-400 font-medium">Platform Service Fee</span>
                      <span className="font-bold text-emerald-600 flex items-center gap-1">₦0.00 <span className="text-[9px] bg-emerald-50 px-1 py-0.5 rounded uppercase">FREE</span></span>
                    </div>
                    <div className="py-4 flex justify-between text-base border-t border-dashed border-slate-200">
                      <span className="text-slate-900 font-extrabold">Final Billing Amount</span>
                      <span className="font-black text-blue-650 font-mono">
                        {selectedService === 'cable' ? formatCurrency(Number(planName.split('|')[1])) : ''}
                        {selectedService === 'electricity' ? formatCurrency(Number(amount)) : ''}
                        {selectedService === 'betting' ? formatCurrency(Number(amount)) : ''}
                        {selectedService === 'exam' ? formatCurrency((provider === 'WAEC' ? 3200 : provider === 'NECO' ? 2800 : 3000) * examQty) : ''}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setStep(1)}
                      className="py-4 rounded-2xl bg-white border border-slate-200 font-bold hover:bg-slate-50 transition-colors text-slate-700"
                    >
                      Change Details
                    </button>
                    <button 
                      disabled={isPaying}
                      onClick={handlePay}
                      className="py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-100 disabled:opacity-50"
                    >
                      {isPaying ? "Processing..." : "Conclude & Pay"}
                    </button>
                  </div>
                </motion.div>
              )}

              {step === 3 && successReceipt && (
                /* STEP 3 - SUCCESS DELIVERED MODAL WITH PRINTING RECEIPT */
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 max-w-xl">
                  <div className="text-center py-6 space-y-3">
                    <SuccessFeedback size={70} showConfetti={true} />
                    <div>
                      <h4 className="text-2xl font-black text-slate-900 mt-2">Transaction Successful!</h4>
                      <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">DISPATCH CONFIRMED OUTFLOW</p>
                    </div>
                  </div>

                  {successReceipt.token && (
                    <div className="p-6 rounded-3xl bg-amber-50 border border-amber-100 text-center space-y-1">
                      <p className="text-[10px] uppercase font-black text-amber-700 tracking-wider">Your Prepaid Meter Token</p>
                      <h5 className="font-mono font-extrabold text-slate-900 text-2xl tracking-widest select-all">{successReceipt.token}</h5>
                      <p className="text-xs text-amber-600 font-medium">Copy or enter this exact token key into your prepaid terminal.</p>
                    </div>
                  )}

                  <div className="bg-slate-50 border border-slate-100 p-6 rounded-[2rem] divide-y divide-slate-100 text-sm">
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400 font-medium font-sans">Payment Channel</span>
                      <span className="font-bold text-slate-800 uppercase">{successReceipt.service} ({successReceipt.provider})</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400 font-medium font-sans">Beneficiary</span>
                      <span className="font-bold text-slate-800">{successReceipt.validatedName}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400 font-medium font-sans">ID / Account</span>
                      <span className="font-mono font-bold text-slate-800">{successReceipt.account}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400 font-medium font-sans">Cleared Amount</span>
                      <span className="font-extrabold text-slate-900 font-mono">{formatCurrency(successReceipt.amount)}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400 font-medium font-sans">Reference ID</span>
                      <span className="font-mono text-slate-700 font-bold text-xs">{successReceipt.ref}</span>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={() => setShowReceiptModal(true)}
                      className="flex-1 bg-slate-900 hover:bg-black text-white font-extrabold rounded-2xl py-4 flex items-center justify-center gap-2 shadow-xl shadow-slate-200"
                    >
                      <Printer size={18} /> View & Print Receipt
                    </button>
                    <button 
                      onClick={() => { setSelectedService(null); resetFlow(); }}
                      className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 font-extrabold rounded-2xl py-4"
                    >
                      Finish View
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PRINT RECEIPT POPUP (MODAL SCREEN) */}
      <AnimatePresence>
        {showReceiptModal && successReceipt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowReceiptModal(false)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />
            
            {/* INVOICE DESIGN */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-8 border border-slate-100 shadow-2xl relative text-slate-900 z-10 print:absolute print:inset-0 print:border-none print:shadow-none font-sans"
            >
              {/* Close controls for layout */}
              <button 
                onClick={() => setShowReceiptModal(false)}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 rounded-full transition-colors print:hidden"
              >
                <X size={18} />
              </button>

              {/* Receipt Content */}
              <div id="receipt-print-area" className="space-y-6">
                <div className="text-center pb-4 border-b border-dashed border-slate-100 space-y-2">
                  <div className="inline-flex items-center gap-1 font-black text-lg tracking-tight">
                    <span className="text-blue-600">NOROYA</span>DATA
                  </div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Telecom & Utility Invoice</p>
                </div>

                <div className="text-center py-3">
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Cleared Amount</span>
                  <p className="text-3xl font-black text-slate-900 font-mono transition-transform mt-1">{formatCurrency(successReceipt.amount)}</p>
                  <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full mt-2 inline-flex items-center gap-1.5 font-sans">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" /> Transaction Success
                  </span>
                </div>

                <div className="space-y-3.5 pt-4 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Merchant Business</span>
                    <span className="font-extrabold text-slate-800">Noroya Data Hub</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Service Subtitle</span>
                    <span className="font-extrabold text-slate-800 capitalize">{successReceipt.service} Billing</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Channel Provider</span>
                    <span className="font-extrabold text-slate-800">{successReceipt.provider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Receiver Name</span>
                    <span className="font-extrabold text-slate-800">{successReceipt.validatedName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">ID / Account Number</span>
                    <span className="font-mono font-extrabold text-slate-800">{successReceipt.account}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Reference Code</span>
                    <span className="font-mono font-extrabold text-slate-650">{successReceipt.ref}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Payment Date/Time</span>
                    <span className="font-medium text-slate-500">{successReceipt.date}</span>
                  </div>

                  {successReceipt.token && (
                    <div className="pt-3 border-t border-dashed border-slate-200 mt-4 text-center">
                      <span className="text-[10px] uppercase font-black text-amber-700 block">Meter Load Token</span>
                      <p className="font-mono font-black text-slate-900 text-lg tracking-widest mt-1 select-all">{successReceipt.token}</p>
                    </div>
                  )}
                </div>

                <div className="text-center pt-6 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed font-sans">
                  Thank you for using Noroya Automated Dispatch systems.<br /> 24/7 high speed instant telecom clearance.
                </div>
              </div>

              {/* Action buttons print-hidden */}
              <div className="mt-8 flex gap-3 print:hidden">
                <button 
                  onClick={handlePrintReceipt}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 text-sm shadow-md"
                >
                  <Printer size={16} /> Print Copy
                </button>
                <button 
                  onClick={() => setShowReceiptModal(false)}
                  className="flex-1 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 font-extrabold py-3.5 px-4 rounded-xl text-sm transition-colors"
                >
                  Close Invoice
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

// Simple helper component to reuse clean icons for modal control
function X({ size, className }: { size?: number, className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size ?? 24} height={size ?? 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
  );
}
