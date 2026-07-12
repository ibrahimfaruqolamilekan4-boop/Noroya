import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, 
  TrendingUp, 
  Smartphone, 
  Zap, 
  Tv, 
  Trophy, 
  ChevronRight, 
  Users, 
  ArrowRight, 
  Compass, 
  DollarSign, 
  Building2, 
  Award, 
  Sparkles, 
  Printer, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  ArrowUpRight 
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface ProductPlan {
  id: string;
  name: string;
  price: number;
}

export default function ResellerPortal() {
  const { user, updateLocalProfile } = useAuth();
  const [activeSubTab, setActiveSubTab] = React.useState<'upgrade' | 'terminal' | 'bulk-fund' | 'ledger'>('upgrade');

  // Upgrade States
  const [isUpgrading, setIsUpgrading] = React.useState(false);

  // POS Sales terminal states
  const [saleType, setSaleType] = React.useState<'airtime' | 'data' | 'cable' | 'electricity' | 'betting'>('airtime');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  const [carrier, setCarrier] = React.useState('');
  const [salePlan, setSalePlan] = React.useState<string>('');
  const [saleCost, setSaleCost] = React.useState('');
  const [customerPrice, setCustomerPrice] = React.useState(''); // Margin Markup
  const [isSelling, setIsSelling] = React.useState(false);
  const [saleReceipt, setSaleReceipt] = React.useState<any>(null);

  // Simulated validation names for customer
  const CUSTOMER_NAMES = [
    "Adewunmi Gbenga", "Ngozi Chika", "Bello Ibrahim", "Precious Adebayo", 
    "Chioma Henrietta", "Yusuf Olatunji", "Daniel Kelechi", "Mustapha Aliyu"
  ];

  // Bulk funding states
  const [isFunding, setIsFunding] = React.useState(false);
  const [bulkAmount, setBulkAmount] = React.useState('');

  const BULK_BUNDLES = [
    { amount: 15000, bonusPercent: 0.5, tag: "Bronze Starter" },
    { amount: 30000, bonusPercent: 0.5, tag: "Silver Medium" },
    { amount: 50000, bonusPercent: 1.0, tag: "Gold Premium" },
    { amount: 100000, bonusPercent: 1.5, tag: "Elite Wholesaler" }
  ];

  // Auto set active subtab based on role
  React.useEffect(() => {
    if (user && (user.role === 'agent' || user.role === 'reseller')) {
      setActiveSubTab('terminal');
    } else {
      setActiveSubTab('upgrade');
    }
  }, [user?.role]);

  // Handle Account upgrade through API
  const handleUpgrade = async (role: 'agent' | 'reseller') => {
    if (!user) {
      toast.error("Please log in to continue");
      return;
    }
    const fee = role === 'agent' ? 1500 : 3500;
    if (user.balance < fee) {
      toast.error(`Insufficient wallet funds. You need ${formatCurrency(fee)} to subscribe.`);
      return;
    }

    setIsUpgrading(true);
    try {
      const response = await fetch('/api/agent/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, desireRole: role })
      });

      const resData = await response.json();
      if (response.ok) {
        toast.success(resData.message);
        // Update user state locally
        updateLocalProfile({
          role: role,
          balance: resData.balance,
          wallet_balance: resData.balance,
        });
        setActiveSubTab('terminal');
      } else {
        toast.error(resData.error || "Upgrade transaction failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Network issue. Upgrade failed.");
    } finally {
      setIsUpgrading(false);
    }
  };

  // Handle simulated sales to customer in POS Terminal
  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerPhone || !carrier || !salePlan || !saleCost) {
      toast.error("Please fill all sales field elements.");
      return;
    }

    const costNum = Number(saleCost);
    const priceNum = customerPrice ? Number(customerPrice) : costNum;

    if (isNaN(costNum) || costNum <= 0) {
      toast.error("Please specify a valid wholesale cost.");
      return;
    }

    if (user && user.balance < costNum) {
      toast.error(`Your primary reseller capital wallet is insufficient to settle the ₦${costNum} wholesale cost.`);
      return;
    }

    setIsSelling(true);
    try {
      // Direct call to standard VTU endpoints to simulate dispatching the customer recharge
      const response = await fetch('/api/vtu/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid,
          type: saleType === 'airtime' ? 'airtime' : saleType === 'data' ? 'data' : 'bill',
          network: carrier,
          phoneNumber: customerPhone,
          plan: salePlan,
          amount: costNum
        })
      });

      const resData = await response.json();
      if (response.ok) {
        const cashback = resData.transaction?.cashbackEarned || 0;
        const totalProfitAfterMarkup = (priceNum - costNum) + cashback;

        setSaleReceipt({
          ref: resData.transaction?.reference || `POS-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
          customerPhone,
          customerName: customerName || CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)],
          type: saleType,
          carrier,
          plan: salePlan,
          actualCost: costNum,
          customerCharge: priceNum,
          cashbackEarned: cashback,
          markupProfit: priceNum - costNum,
          totalProfit: totalProfitAfterMarkup,
          date: new Date().toLocaleString()
        });

        // Update balance locally
        if (user) {
          updateLocalProfile({
            balance: user.balance - costNum + cashback,
            wallet_balance: (user.wallet_balance || user.balance) - costNum + cashback,
          });
        }

        toast.success("POS Customer Order Dispatched Instantly!");
      } else {
        toast.error(resData.error || "POS purchase rejected by operator gateway.");
      }
    } catch (err) {
      console.error(err);
      toast.error("POS gateway connection error.");
    } finally {
      setIsSelling(false);
    }
  };

  // Handle simulated bulk capital funding through endpoint
  const handleBulkFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = Number(bulkAmount);
    if (isNaN(amountVal) || amountVal < 1000) {
      toast.error("Minimum bulk funding threshold is ₦1,000");
      return;
    }

    setIsFunding(true);
    try {
      const response = await fetch('/api/agent/bulk-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.uid, amount: amountVal })
      });

      const resData = await response.json();
      if (response.ok) {
        toast.success(`Merchant Capital Deposited! Bonus awarded: ₦${resData.bonusEarned.toFixed(2)}`);
        
        if (user) {
          updateLocalProfile({
            balance: resData.balance,
            wallet_balance: resData.balance,
          });
        }
        setBulkAmount('');
        setActiveSubTab('terminal');
      } else {
        toast.error(resData.error || "Bulk funding was declined.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Bulk fund processing network timeout.");
    } finally {
      setIsFunding(false);
    }
  };

  // Compute live potential agent commissions dynamically based on a user inputting a test sales volume
  const [projVol, setProjVol] = React.useState('50000');
  const userRate = user?.role === 'reseller' ? 0.04 : user?.role === 'agent' ? 0.03 : 0.02;

  return (
    <div className="space-y-8 font-sans">
      
      {/* Visual Level indicator card */}
      <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 md:p-10 relative overflow-hidden shadow-xl shadow-slate-950/15">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl -ml-24 -mb-24" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <span className={cn(
              "px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase inline-flex items-center gap-1.5 shadow-sm",
              user?.role === 'reseller' ? "bg-amber-400 text-slate-950 font-bold" :
              user?.role === 'agent' ? "bg-blue-500 text-white font-bold" :
              "bg-slate-800 text-slate-300 font-bold"
            )}>
              <Award size={14} className="animate-pulse" />
              {user?.role === 'reseller' ? 'ELITE RE-SELLER RANK' :
               user?.role === 'agent' ? 'VIP AGENT RANK' :
               'BASIC USER CLASS'}
            </span>
            <h2 className="text-3xl font-black tracking-tight leading-none text-white">Merchant Agency Dashboard</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider max-w-lg leading-relaxed">
              Wholesale VTU Distribution Engine & Point-of-Sale (POS) commissions terminal
            </p>
          </div>
          <div className="bg-white/5 border border-white/5 p-5 rounded-[2rem] text-right md:min-w-64">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">RESELLER TRADING CAPITAL</p>
            <h3 className="text-3xl font-mono font-black text-white">{formatCurrency(user?.balance || 0)}</h3>
            <p className="text-[10px] text-emerald-400 font-semibold mt-1 flex items-center justify-end gap-1">
              <span>Commission Rate:</span>
              <strong className="bg-emerald-400/10 px-1.5 py-0.5 rounded">{(userRate * 100).toFixed(0)}% cashback</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Mini Tab Links */}
      <div className="flex border-b border-slate-100 pb-3 gap-6 overflow-x-auto select-none">
        {(!user || (user.role !== 'agent' && user.role !== 'reseller')) && (
          <button
            onClick={() => setActiveSubTab('upgrade')}
            className={cn(
              "text-xs uppercase font-black tracking-widest pb-2 transition-all cursor-pointer",
              activeSubTab === 'upgrade' ? "border-b-2 border-blue-600 text-blue-600 font-extrabold" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Become Reseller
          </button>
        )}
        {user && (user.role === 'agent' || user.role === 'reseller') && (
          <>
            <button
              onClick={() => setActiveSubTab('terminal')}
              className={cn(
                "text-xs uppercase font-black tracking-widest pb-2 transition-all cursor-pointer",
                activeSubTab === 'terminal' ? "border-b-2 border-blue-600 text-blue-600 font-extrabold" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Sales POS Console
            </button>
            <button
              onClick={() => setActiveSubTab('bulk-fund')}
              className={cn(
                "text-xs uppercase font-black tracking-widest pb-2 transition-all cursor-pointer",
                activeSubTab === 'bulk-fund' ? "border-b-2 border-blue-600 text-blue-600 font-extrabold" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Bulk Capital Deposit
            </button>
          </>
        )}
        <button
          onClick={() => setActiveSubTab('ledger')}
          className={cn(
            "text-xs uppercase font-black tracking-widest pb-2 transition-all cursor-pointer",
            activeSubTab === 'ledger' ? "border-b-2 border-blue-600 text-blue-600 font-extrabold" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Margin Calculator & Perks
        </button>
      </div>

      {/* TABS CONTAINER */}
      <AnimatePresence mode="wait">
        
        {/* SUBTAB 1: Become an Agent or Reseller Upgrade */}
        {activeSubTab === 'upgrade' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {/* Value Proposition Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Agent Membership Option */}
              <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 space-y-6 shadow-sm flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900">VIP Agent Tier</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">ONBOARDING FEE: ₦1,500</p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Excellent for VTU retailers who service immediate friends, family, and neighborhood clients. Instant cashbacks and optimized network routes.
                  </p>
                  
                  {/* Perk list */}
                  <ul className="space-y-2 text-xs font-semibold text-slate-600">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-500" />
                      <span>Flat 3.0% Guaranteed Cashback on all recharges</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-500" />
                      <span>Access to Reseller POS Quick Terminal console</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-500" />
                      <span>0.5% Cash Bonus on bulk bank capital transfers</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-500" />
                      <span>Priority operator route validation clearance</span>
                    </li>
                  </ul>
                </div>

                <button
                  disabled={isUpgrading || (user?.role === 'agent' || user?.role === 'reseller')}
                  onClick={() => handleUpgrade('agent')}
                  className={cn(
                    "w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all",
                    user?.role === 'agent' ? "bg-green-50 text-green-600 font-bold" :
                    user?.role === 'reseller' ? "bg-slate-100 text-slate-400 font-bold cursor-not-allowed" :
                    "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100 cursor-pointer"
                  )}
                >
                  {isUpgrading ? "Processing..." :
                   user?.role === 'agent' ? "You are a VIP Agent" :
                   user?.role === 'reseller' ? "Tier Level Exceeded" :
                   "Subscribe to Agent Tier (₦1,500)"}
                </button>
              </div>

              {/* Reseller Membership Option */}
              <div className="bg-amber-500/5 border border-amber-200 rounded-[2.5rem] p-8 space-y-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-amber-400 text-slate-950 px-4 py-1.5 rounded-bl-2xl text-[9px] font-black tracking-widest uppercase">
                  Best Value Rank
                </div>
                
                <div className="space-y-4">
                  <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900">Elite Reseller Rank</h3>
                    <p className="text-xs text-amber-700 font-bold uppercase tracking-wider mt-1">ONBOARDING FEE: ₦3,500</p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Built for wholesale distributors with active clienteles. Leverage bulk rates, mark up retail costs, and earn maximum profit commissions!
                  </p>
                  
                  {/* Perk list */}
                  <ul className="space-y-2 text-xs font-semibold text-slate-600">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-amber-600 animate-pulse" />
                      <span className="font-extrabold text-amber-950">Maximize 4.0% Cashback on every transaction</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-500" />
                      <span>Custom Markup Margin setting for billing clients</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-500" />
                      <span>Earn 1.5% loyalty cache back on bulk credits</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-500" />
                      <span>Exclusive printable receipts for branding invoice</span>
                    </li>
                  </ul>
                </div>

                <button
                  disabled={isUpgrading || user?.role === 'reseller'}
                  onClick={() => handleUpgrade('reseller')}
                  className={cn(
                    "w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all",
                    user?.role === 'reseller' ? "bg-amber-100 text-amber-700 font-bold" :
                    "bg-amber-500 text-white hover:bg-amber-600 shadow-xl shadow-amber-200 cursor-pointer"
                  )}
                >
                  {isUpgrading ? "Processing..." :
                   user?.role === 'reseller' ? "You are an Elite Reseller" :
                   "Subscribe to Reseller Tier (₦3,500)"}
                </button>
              </div>

            </div>

            {/* Matrix comparison table */}
            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-6 shadow-sm overflow-x-auto">
              <h4 className="text-sm font-black uppercase tracking-wider text-slate-400 mb-4 pl-2">Perks Matrix Comparison</h4>
              <table className="w-full text-left text-xs text-slate-600 min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-50 text-[10px] text-slate-400 font-extrabold uppercase uppercase">
                    <th className="py-2.5 pl-2">Benefit Feature</th>
                    <th className="py-2.5">Standard User</th>
                    <th className="py-2.5 text-blue-600">VIP Agent</th>
                    <th className="py-2.5 text-amber-600">Elite Reseller</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-semibold">
                  <tr className="hover:bg-slate-50/50">
                    <td className="py-3 pl-2 font-medium">Data / Airtime Cashback</td>
                    <td>2.0%</td>
                    <td className="text-blue-600">3.0%</td>
                    <td className="text-amber-700 font-bold">4.0%</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="py-3 pl-2 font-medium">Electricity & Utility Cashback</td>
                    <td>2.0%</td>
                    <td className="text-blue-600">3.0%</td>
                    <td className="text-amber-700 font-bold">4.0%</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="py-3 pl-2 font-medium">POS Quick Terminal Support</td>
                    <td className="text-slate-300">No</td>
                    <td className="text-emerald-600">Yes</td>
                    <td className="text-emerald-600">Yes</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="py-3 pl-2 font-medium">Custom Client Mark-up Profit</td>
                    <td className="text-slate-300">No</td>
                    <td className="text-slate-400">Fixed</td>
                    <td className="text-emerald-600 font-bold">Unlimited Custom</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="py-3 pl-2 font-medium">Bulk Funding Loyalty Bonus</td>
                    <td>None</td>
                    <td>Up to 1.0%</td>
                    <td className="text-amber-700 font-bold">Up to 1.5% Cashback</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* SUBTAB 2: Reseller POS Sales Console Terminal */}
        {activeSubTab === 'terminal' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Left FORM Column */}
            <div className="lg:col-span-7 bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-sm space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Smartphone size={22} />
                </span>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">POS Retail Cashier Terminal</h3>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Automated Wholesale Order Desk</p>
                </div>
              </div>

              {/* Service Type Buttons */}
              <div className="grid grid-cols-5 gap-1.5 p-1 bg-slate-50 rounded-2xl select-none">
                {[
                  { id: 'airtime', icon: <Zap size={15} />, label: "Airtime" },
                  { id: 'data', icon: <Smartphone size={15} />, label: "Data" },
                  { id: 'cable', icon: <Tv size={15} />, label: "Decoder" },
                  { id: 'electricity', icon: <Zap size={15} />, label: "Power" },
                  { id: 'betting', icon: <Trophy size={15} />, label: "Betting" }
                ].map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSaleType(item.id);
                      setCarrier('');
                      setSalePlan('');
                      setSaleCost('');
                      setCustomerPrice('');
                      setSaleReceipt(null);
                    }}
                    className={cn(
                      "py-2 px-1 flex flex-col items-center gap-1 rounded-xl text-[10px] font-black tracking-tight transition-all",
                      saleType === item.id 
                        ? "bg-slate-900 text-white font-extrabold" 
                        : "text-slate-400 hover:text-slate-650"
                    )}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              {/* POS Sales Form */}
              <form onSubmit={handleSaleSubmit} className="space-y-4">
                
                {/* Client Cell / Identifier */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                      Customer Fullname (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Alao Babajide"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                      {saleType === 'cable' ? 'Smartcard/IUC Decoder Number' : 
                       saleType === 'electricity' ? 'Electricity Meter ID' : 
                       saleType === 'betting' ? 'Bookmaker User ID' : 'Client Phone Call Number'}
                    </label>
                    <input
                      required
                      type="tel"
                      placeholder={saleType === 'cable' ? 'i.e. gotv smartcard num' : '08012345678'}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Carrier details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                      Operator Carrier Provider
                    </label>
                    <select
                      required
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select Carrier</option>
                      {saleType === 'betting' ? (
                        <>
                          <option value="SportyBet">SportyBet</option>
                          <option value="Bet9ja">Bet9ja</option>
                          <option value="1xBet">1xBet</option>
                          <option value="BetWay">BetWay</option>
                        </>
                      ) : saleType === 'cable' ? (
                        <>
                          <option value="GOTV">GOtv Nigeria</option>
                          <option value="DSTV">DStv Nigeria</option>
                          <option value="STARTIMES">StarTimes TV</option>
                        </>
                      ) : saleType === 'electricity' ? (
                        <>
                          <option value="IKEDC">Ikeja Electric (IKEDC)</option>
                          <option value="EKEDC">Eko Electric (EKEDC)</option>
                          <option value="AEDC">Abuja Electric (AEDC)</option>
                          <option value="KEDCO">Kano Electric (KEDCO)</option>
                        </>
                      ) : (
                        <>
                          <option value="MTN">MTN Nigeria</option>
                          <option value="Airtel">Airtel Africa</option>
                          <option value="Glo">Glo Mobile</option>
                          <option value="9mobile">9mobile</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                      Product Package / Plan
                    </label>
                    {saleType === 'data' ? (
                      <select
                        required
                        value={salePlan}
                        onChange={(e) => {
                          setSalePlan(e.target.value);
                          const planOpts: Record<string, number> = {
                            "MTN 1.2GB Gifting": 250, "MTN 3GB Corporate Gifting": 620, "MTN 10GB Corporate Gifting": 1850,
                            "Airtel 1GB Monthly": 240, "Airtel 5GB Monthly": 1150,
                            "Glo 1.5GB Data": 400, "Glo 6GB Monthly": 1200,
                            "9mobile 1.5GB": 450, "9mobile 5GB Corporate Gifting": 1300
                          };
                          if (planOpts[e.target.value]) {
                            setSaleCost(String(planOpts[e.target.value]));
                            setCustomerPrice(String(planOpts[e.target.value] + 50)); // default markup
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Choose Bundle</option>
                        <option value="MTN 1.2GB Gifting">MTN 1.2GB Gifting (₦250)</option>
                        <option value="MTN 3GB Corporate Gifting">MTN 3GB Corporate Gifting (₦620)</option>
                        <option value="MTN 10GB Corporate Gifting">MTN 10GB Corporate Gifting (₦1,850)</option>
                        <option value="Airtel 1GB Monthly">Airtel 1GB Monthly (₦240)</option>
                        <option value="Airtel 5GB Monthly">Airtel 5GB Monthly (₦1,150)</option>
                        <option value="Glo 1.5GB">Glo 1.5GB (₦400)</option>
                        <option value="Glo 6GB Monthly">Glo 6GB Monthly (₦1,200)</option>
                      </select>
                    ) : (
                      <input
                        required
                        type="text"
                        placeholder="e.g. 500 Airtime, DSTV Premium"
                        value={salePlan}
                        onChange={(e) => setSalePlan(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </div>
                </div>

                {/* Pricing / Markup Calculator */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                      Wholesale Cost Cost (₦)
                    </label>
                    <input
                      required
                      type="tel"
                      value={saleCost}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setSaleCost(val);
                        setCustomerPrice(String(Number(val) + 50));
                      }}
                      placeholder="e.g. 1000"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-mono font-bold focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5 p-3 rounded-2xl bg-amber-500/5 border border-amber-100 border-dashed">
                    <label className="text-[10px] font-black uppercase tracking-wider text-amber-700 ml-1 flex justify-between">
                      <span>Customer Retail Selling Price (Markup)</span>
                      <span className="text-amber-800 text-[9px] font-extrabold uppercase bg-amber-100 px-1 py-0.2 rounded">YOUR MARGIN PROFIT</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 1050"
                      value={customerPrice}
                      onChange={(e) => setCustomerPrice(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-white border border-amber-200 rounded-xl py-2 px-3 text-xs font-mono font-bold focus:outline-none focus:border-amber-500 text-slate-800"
                    />
                  </div>
                </div>

                {/* Margin summary preview */}
                {saleCost && (
                  <div className="p-4 bg-emerald-500/5 border border-emerald-100 rounded-2xl divide-y divide-emerald-100/30 text-xs text-slate-600 font-semibold space-y-2">
                    <div className="flex justify-between">
                      <span>Wholesale Cost Deduction:</span>
                      <span className="font-mono">{formatCurrency(Number(saleCost))}</span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span>Cashback rebate earned ({userRate * 100}% rate):</span>
                      <span className="text-emerald-700 font-bold font-mono">+ {formatCurrency(Number(saleCost) * userRate)}</span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span>Markup Margin spread profit:</span>
                      <span className="text-emerald-700 font-bold font-mono">+ {formatCurrency(Math.max(0, Number(customerPrice || saleCost) - Number(saleCost)))}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-dashed border-emerald-200 text-sm font-black text-slate-900">
                      <span>Total Net Profit:</span>
                      <span className="text-emerald-700 font-mono">
                        {formatCurrency((Number(saleCost) * userRate) + Math.max(0, Number(customerPrice || saleCost) - Number(saleCost)))}
                      </span>
                    </div>
                  </div>
                )}

                <button
                  disabled={isSelling || !saleCost}
                  type="submit"
                  className="w-full py-4 rounded-2xl bg-slate-900 text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
                >
                  {isSelling ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> DISPATCHING POS CHARGE...
                    </>
                  ) : (
                    <>
                      Process Customer Invoice Sale <ArrowUpRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Right RECEIPT Column */}
            <div className="lg:col-span-5 flex flex-col justify-start">
              {saleReceipt ? (
                <div className="bg-slate-50 border border-slate-100 p-6 rounded-[2rem] space-y-5 shadow-sm">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900">Receipt Dispatch Out</h4>
                      <p className="text-[9px] text-slate-400 font-extrabold tracking-widest uppercase mb-1">POS COUNTER PRINTER</p>
                    </div>
                  </div>

                  <div className="space-y-3.5 divide-y divide-slate-200/60 text-xs font-sans">
                    <div className="py-2 flex justify-between">
                      <span className="text-slate-400 font-medium">Customer Fullname</span>
                      <span className="font-extrabold text-slate-800">{saleReceipt.customerName}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400 font-medium font-sans">Drawn Receiver ID</span>
                      <span className="font-mono font-extrabold text-slate-800">{saleReceipt.customerPhone}</span>
                    </div>
                    <div className="py-2.5 flex justify-between animate-pulse">
                      <span className="text-slate-400 font-medium">Product Dispatched</span>
                      <span className="font-extrabold text-slate-800">{saleReceipt.carrier} {saleReceipt.plan}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400 font-medium">Margin markup margin</span>
                      <span className="font-extrabold font-mono text-emerald-600">+ {formatCurrency(saleReceipt.markupProfit)}</span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-400 font-medium">Wholesale cashback</span>
                      <span className="font-extrabold font-mono text-emerald-600">+ {formatCurrency(saleReceipt.cashbackEarned)}</span>
                    </div>
                    <div className="py-2.5 flex justify-between bg-white border border-slate-100 rounded-xl p-2.5 shadow-sm mt-2">
                      <span className="text-slate-900 font-black">Customer Invoice Charge</span>
                      <span className="font-black text-slate-900 font-mono text-sm">{formatCurrency(saleReceipt.customerCharge)}</span>
                    </div>
                    <div className="py-2 flex justify-between text-[10px] text-slate-450">
                      <span>Invoice Reference</span>
                      <span className="font-mono font-bold">{saleReceipt.ref}</span>
                    </div>
                  </div>

                  {/* Actions Print */}
                  <div className="grid grid-cols-2 gap-3 pt-2 select-none">
                    <button
                      onClick={() => window.print()}
                      className="py-3 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Printer size={14} /> Print E-Slip
                    </button>
                    <button
                      onClick={() => setSaleReceipt(null)}
                      className="py-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition-all"
                    >
                      Next POS Sale
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-100 border-dashed p-10 rounded-[2.5rem] flex flex-col items-center justify-center text-center h-full min-h-64">
                  <span className="p-4 bg-slate-50 rounded-2xl text-slate-400 mb-4 animate-bounce">
                    <Building2 size={32} />
                  </span>
                  <h4 className="font-extrabold text-slate-800 text-sm">POS Awaiting Customer Ticket</h4>
                  <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
                    Fill the form details on the left, set your markup customer charge, and clear the transaction ticket!
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* SUBTAB 3: Bulk Capital funding with bonuses */}
        {activeSubTab === 'bulk-fund' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Quick bundles select */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {BULK_BUNDLES.map((bundle) => {
                const bonusValue = bundle.amount * (bundle.bonusPercent / 100);
                return (
                  <button
                    key={bundle.amount}
                    onClick={() => setBulkAmount(String(bundle.amount))}
                    className={cn(
                      "p-6 bg-white border rounded-3xl text-left hover:shadow-md transition-all outline-none flex flex-col justify-between h-36 border-slate-100 cursor-pointer",
                      Number(bulkAmount) === bundle.amount ? "border-amber-400 bg-amber-500/5 ring-1 ring-amber-400" : ""
                    )}
                  >
                    <div>
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-wider">{bundle.tag}</span>
                      <h4 className="font-black text-slate-900 text-xl font-mono mt-2">{formatCurrency(bundle.amount)}</h4>
                    </div>
                    <div className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-1 mt-3">
                      <span>Cash bonus:</span>
                      <strong className="bg-emerald-50 px-1 py-0.5 rounded">+{formatCurrency(bonusValue)} (+{bundle.bonusPercent}%)</strong>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom request panel form */}
            <div className="max-w-xl mx-auto bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                <span className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                  <DollarSign size={22} className="animate-spin-slow" />
                </span>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Credit Capital Account</h3>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Automated Wholesale deposit portal</p>
                </div>
              </div>

              <form onSubmit={handleBulkFundSubmit} className="space-y-4">
                
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">
                    Select Simulated Funding Code/Amount (₦)
                  </label>
                  <input
                    required
                    type="tel"
                    value={bulkAmount}
                    onChange={(e) => setBulkAmount(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 20000"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4  px-5 text-lg font-mono font-black focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500"
                  />
                  <p className="text-[10px] text-slate-450 leading-relaxed pl-1 font-semibold">
                    * Capital bonuses: ₦15,000+ (+0.5% boost), ₦50,000+ (+1.0% boost), ₦100,000+ (+1.5% premium boost!).
                  </p>
                </div>

                {bulkAmount && Number(bulkAmount) >= 1000 && (
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-semibold text-slate-600 space-y-2">
                    <div className="flex justify-between">
                      <span>Manual base funding deposit:</span>
                      <span className="font-mono">{formatCurrency(Number(bulkAmount))}</span>
                    </div>
                    {Number(bulkAmount) >= 15000 && (
                      <div className="flex justify-between pt-1 text-emerald-600">
                        <span>Agency deposit loyalty bonus credit:</span>
                        <span className="font-mono font-bold">
                          + {formatCurrency(Number(bulkAmount) * (Number(bulkAmount) >= 100000 ? 0.015 : Number(bulkAmount) >= 50000 ? 0.01 : 0.005))}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black text-slate-900">
                      <span>Total balance added:</span>
                      <span className="text-blue-600 font-mono">
                        {formatCurrency(Number(bulkAmount) + (Number(bulkAmount) >= 15000 ? Number(bulkAmount) * (Number(bulkAmount) >= 100000 ? 0.015 : Number(bulkAmount) >= 50000 ? 0.01 : 0.005) : 0))}
                      </span>
                    </div>
                  </div>
                )}

                <button
                  disabled={isFunding || !bulkAmount}
                  type="submit"
                  className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-amber-100 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isFunding ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> DISPATCHING BULLETIN BANK WIRE...
                    </>
                  ) : (
                    <>
                      Clear simulated manual wire payment <CheckCircle2 size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {/* SUBTAB 4: Margin Calculator & Perks */}
        {activeSubTab === 'ledger' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Live projecting profit calculator tool */}
            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-8">
              
              <div className="md:col-span-7 space-y-4">
                <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-lg">PROFIT SIMULATOR</span>
                <h3 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">Project Your Monthly Earnings Capital</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  Adjust simulated sales ticket turnovers to see live margins, cashbacks, and markup profits compounding.
                </p>

                {/* Range turnover inputs */}
                <div className="space-y-3 pt-4">
                  <div className="flex justify-between text-xs font-black text-slate-400 uppercase">
                    <span>Projected Monthly VTU Turn-over sales (₦)</span>
                    <span className="text-blue-600 font-bold font-mono text-sm">{formatCurrency(Number(projVol))}</span>
                  </div>
                  <input
                    type="range"
                    min="5000"
                    max="500000"
                    step="5000"
                    value={projVol}
                    onChange={(e) => setProjVol(e.target.value)}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                    <span>₦5,000 Min</span>
                    <span>₦250,000 Mid</span>
                    <span>₦500,000 Max</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="p-4 bg-slate-50 rounded-2xl text-center">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-2">Commission rate cashbacks</p>
                    <h4 className="text-xl font-mono font-black text-slate-900">{formatCurrency(Number(projVol) * userRate)}</h4>
                  </div>
                  <div className="p-4 bg-emerald-500/5 border border-emerald-100 rounded-2xl text-center">
                    <p className="text-[10px] text-emerald-800 font-black uppercase tracking-wider mb-2">Estimated retail mark-ups</p>
                    <h4 className="text-xl font-mono font-black text-emerald-600">{formatCurrency(Number(projVol) * 0.05)}</h4>
                  </div>
                </div>
              </div>

              {/* Graphical representation side */}
              <div className="md:col-span-5 flex flex-col justify-between bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 font-sans">Visual Compounding trends</h4>
                  
                  {/* BEAUTIFUL SVG PROGRESS CHART */}
                  <div className="h-32 w-full pt-4 flex items-end justify-between relative select-none">
                    <svg className="absolute inset-0 w-full h-full text-blue-600" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path 
                        d="M0,90 Q25,80 50,45 T100,20 L100,100 L0,100 Z" 
                        fill="currentColor" 
                        fillOpacity="0.05" 
                      />
                      <path 
                        d="M0,90 Q25,80 50,45 T100,20" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="3" 
                        strokeLinecap="round" 
                      />
                    </svg>
                    
                    {/* Graph Pillars/Points */}
                    {[1, 2, 3, 4, 5].map((index) => {
                      const heights = [20, 35, 55, 75, 95];
                      return (
                        <div key={index} className="flex flex-col items-center gap-1.5 z-10 shrink-0">
                          <span className="text-[9px] font-bold text-blue-600 bg-white border border-slate-100 px-1 py-0.5 rounded shadow-sm">
                            {(heights[index - 1] * Number(projVol) * (userRate + 0.05) / 100 / 12).toFixed(0)}₦
                          </span>
                          <div className="w-1.5 bg-blue-600/35 rounded-full" style={{ height: `${heights[index - 1] * 0.5}px` }} />
                          <span className="text-[8px] text-slate-400 font-black uppercase">W{index}</span>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-slate-400 font-medium text-center italic mt-2">
                    compounding profits over a active 5-week commercial distribution period
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-200/60 text-center">
                  <p className="text-xs text-slate-500 font-medium font-sans">Overall Compounded Net Earnings</p>
                  <h3 className="text-2xl font-mono font-black text-blue-600 mt-1">
                    {formatCurrency(Number(projVol) * (userRate + 0.05))}
                  </h3>
                </div>

              </div>

            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}
