import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Smartphone, 
  Tv, 
  Printer, 
  Eye, 
  EyeOff, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Menu, 
  X, 
  HelpCircle, 
  Star, 
  Copy, 
  Check, 
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Percent,
  History,
  FileCheck2,
  DollarSign,
  Plus,
  Minus,
  Sparkles,
  Zap as ZapIcon
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function LandingPage({ onAuth }: { onAuth: () => void }) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [balanceVisible, setBalanceVisible] = React.useState(true);
  const [activeNetworkTab, setActiveNetworkTab] = React.useState<'mtn' | 'glo' | 'airtel' | '9mobile'>('mtn');
  const [activeCableTab, setActiveCableTab] = React.useState<'dstv' | 'gotv' | 'startimes'>('dstv');
  const [faqOpenIdx, setFaqOpenIdx] = React.useState<number | null>(null);
  const [depositModalOpen, setDepositModalOpen] = React.useState(false);
  const [copiedText, setCopiedText] = React.useState<string | null>(null);

  const [pinNetwork, setPinNetwork] = React.useState<'mtn' | 'glo' | 'airtel' | '9mobile'>('mtn');
  const [pinDenom, setPinDenom] = React.useState<number>(100);
  const [pinQty, setPinQty] = React.useState<number>(10);

  const [livePlans, setLivePlans] = React.useState<any[]>([]);
  const [liveCablePlans, setLiveCablePlans] = React.useState<any[]>([]);
  
  React.useEffect(() => {
    fetch('/api/services/data').then(r => r.ok ? r.json() : []).then(data => {
      if (Array.isArray(data)) setLivePlans(data);
    }).catch(() => {});
    fetch('/api/services/all').then(r => r.ok ? r.json() : []).then(data => {
      if (Array.isArray(data)) {
        setLiveCablePlans(data.filter((s: any) => s.is_active && s.service_type === 'cable'));
      }
    }).catch(() => {});
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const networkKeyMap: Record<string, string> = { MTN: 'mtn', GLO: 'glo', AIRTEL: 'airtel', '9MOBILE': '9mobile' };
  const planRates: Record<string, Array<{ size: string; duration: string; type: string; price: string }>> = { mtn: [], glo: [], airtel: [], '9mobile': [] };
  livePlans
    .slice()
    .sort((a: any, b: any) => (a.selling_price || 0) - (b.selling_price || 0))
    .forEach((p: any) => {
      const key = networkKeyMap[String(p.network || p.provider_or_network || '').toUpperCase()];
      if (key && planRates[key].length < 6) {
        planRates[key].push({
          size: p.item_name || p.name || 'Data Plan',
          duration: p.validity_days || '-',
          type: p.plan_category || 'Data',
          price: `₦${Number(p.selling_price || 0).toLocaleString()}`
        });
      }
    });

  const cablePlans: Record<string, Array<{ name: string; price: string; channels: string }>> = { dstv: [], gotv: [], startimes: [] };
  liveCablePlans.forEach((p: any) => {
    const prov = String(p.provider_or_network || '').toUpperCase();
    const key = prov.includes('DSTV') ? 'dstv' : prov.includes('GOTV') ? 'gotv' : prov.includes('STARTIMES') ? 'startimes' : null;
    if (key) {
      cablePlans[key].push({
        name: p.item_name || p.name || 'Cable Plan',
        price: `₦${Number(p.selling_price || 0).toLocaleString()} / month`,
        channels: p.metadata?.channels || ''
      });
    }
  });

  const faqs = [
    {
      q: "How does wallet funding work on NORODATA?",
      a: "When you wish to fund your wallet, we assign you a personalized, automated transfer account. Simple bank transfers to this account credit your NORODATA wallet balance automatically in under 10 seconds, with zero human intervention."
    },
    {
      q: "Are there any hidden costs or fees?",
      a: "None at all. We believe in complete transparency. Wallet funding incurs only the standard nominal gateway charge of ₦50. We display all discount rates and pricing structures upfront so you know exactly what you are paying."
    },
    {
      q: "Which networks can I recharge?",
      a: "We support instant, automated airtime top-ups for MTN, Airtel, Glo, and 9mobile networks. Each transaction is monitored by our active confirmation engine to ensure immediate dispatch."
    },
    {
      q: "What kinds of internet data bundles are available?",
      a: "We offer heavily discounted data packages across all networks, including SME data, Corporate Gifting (CG), Gifting, and special promo bundles. Validity ranges from 1 to 30 days depending on your selection."
    },
    {
      q: "Can I easily renew my television package?",
      a: "Yes! Simply input your smartcard or IUC number, let our system auto-verify the customer name to ensure it's correct, and select your preferred plan for GOtv, DStv, or StarTimes. Activation completes in seconds."
    },
    {
      q: "Which regional electricity companies are integrated?",
      a: "We are directly integrated with all primary Nigerian electricity boards (IKEDC, EKEDC, AEDC, KEDCO, PHED, JED, EEDC, KAEDCO, BEDC, YEDC). Prepaid tokens are generated and shown on your screen instantly."
    },
    {
      q: "Where do I find my prepaid electricity token?",
      a: "As soon as your payment is processed, the prepaid token is rendered directly on your screen. We also deliver it to your registered email and archive it permanently in your transaction history for quick lookup."
    },
    {
      q: "Is there a bulk recharge pin generator?",
      a: "Indeed! Resellers and physical retail vendors can utilize our bulk pin generator to print high-quality recharge cards of any major network. Select denominations from ₦100 to ₦500 and print in custom batches."
    },
    {
      q: "What happens if my transaction is unsuccessful?",
      a: "Our system operates on a 100% automated failsafe. If a telecom network partner fails to deliver your airtime or data, our smart contract engine automatically reverses the full purchase amount back to your wallet balance."
    }
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden relative font-sans selection:bg-emerald-600 selection:text-white">
      
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            
            {/* Logo */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 cursor-pointer group" 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:shadow-emerald-500/50 transition-all">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-black tracking-tight text-slate-900">NORODATA</span>
            </motion.div>
            
            {/* Desktop Nav */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600"
            >
              <a href="#services" className="hover:text-emerald-600 transition-colors">Services</a>
              <a href="#prices" className="hover:text-emerald-600 transition-colors">Prices</a>
              <a href="#features" className="hover:text-emerald-600 transition-colors">Features</a>
              <a href="#faq" className="hover:text-emerald-600 transition-colors">FAQ</a>
            </motion.div>

            {/* Desktop Buttons */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="hidden md:flex items-center gap-3"
            >
              <motion.button 
                onClick={onAuth}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="text-slate-700 hover:text-emerald-600 font-bold text-sm px-4 py-2.5 transition-all"
              >
                Log in
              </motion.button>
              <motion.button 
                onClick={onAuth}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm px-6 py-3.5 rounded-2xl hover:from-emerald-600 hover:to-green-700 transition-all shadow-lg shadow-emerald-500/30 flex items-center gap-2"
              >
                Get Started <ArrowRight size={16} />
              </motion.button>
            </motion.div>

            {/* Mobile Menu Button */}
            <motion.button 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="md:hidden p-2.5 hover:bg-slate-100 rounded-2xl text-slate-800 transition-all" 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </motion.button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 inset-x-0 z-40 bg-white border-b border-slate-100 px-6 py-8 md:hidden shadow-xl"
          >
            <div className="flex flex-col gap-6 text-lg font-bold text-slate-800">
              <a href="#services" onClick={() => setIsMenuOpen(false)} className="hover:text-emerald-600 py-1 transition-colors">Services</a>
              <a href="#prices" onClick={() => setIsMenuOpen(false)} className="hover:text-emerald-600 py-1 transition-colors">Prices</a>
              <a href="#features" onClick={() => setIsMenuOpen(false)} className="hover:text-emerald-600 py-1 transition-colors">Features</a>
              <a href="#faq" onClick={() => setIsMenuOpen(false)} className="hover:text-emerald-600 py-1 transition-colors">FAQ</a>
              
              <div className="h-[1px] bg-slate-100 my-2" />
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => { onAuth(); setIsMenuOpen(false); }}
                  className="w-full bg-slate-100 text-slate-800 font-bold py-4 rounded-2xl text-center hover:bg-slate-200 transition-all"
                >
                  Log in
                </button>
                <button 
                  onClick={() => { onAuth(); setIsMenuOpen(false); }}
                  className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold py-4 rounded-2xl text-center hover:from-emerald-600 hover:to-green-700 shadow-lg shadow-emerald-500/20 transition-all"
                >
                  Get Started →
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HERO SECTION */}
      <header className="pt-32 pb-24 md:pt-40 md:pb-32 px-4 sm:px-6 relative bg-gradient-to-b from-white via-emerald-50/30 to-white">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-emerald-100/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-16 items-center relative z-10">
          
          {/* Left Column */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-7 space-y-8 text-left"
          >
            
            {/* Badge */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              Airtime • Data • Cable • Electricity • Pins
            </motion.div>

            {/* Heading */}
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl sm:text-7xl md:text-7xl font-black tracking-tight leading-[1.08] text-slate-900"
            >
              Smart payments.<br />
              Delivered <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-green-600">instantly.</span>
            </motion.h1>

            {/* Description */}
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl font-medium"
            >
              Fund your NORODATA wallet securely to recharge airtime, buy cheap data bundles, pay power bills, and renew TV subscriptions across Nigeria in under 5 seconds.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 pt-4"
            >
              <motion.button 
                onClick={onAuth}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-lg px-8 py-5 rounded-2xl hover:from-emerald-600 hover:to-green-700 transition-all shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2"
              >
                Get Started Now <ArrowRight size={20} />
              </motion.button>
              <motion.a 
                href="#prices"
                whileHover={{ scale: 1.05 }}
                className="bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-bold text-lg px-8 py-5 rounded-2xl border border-slate-200 transition-all text-center flex items-center justify-center"
              >
                Check rates
              </motion.a>
            </motion.div>

            {/* Checkmarks */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-y-3 gap-x-6 pt-4 border-t border-slate-200"
            >
              <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                Direct wallet funding
              </div>
              <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
                <ZapIcon className="w-5 h-5 text-emerald-600" />
                Instant delivery
              </div>
              <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Auto-refunds
              </div>
            </motion.div>
          </motion.div>

          {/* Right Column: Wallet Card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="lg:col-span-5 relative"
          >
            
            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500 to-green-500 rounded-[3rem] blur-2xl opacity-15 -z-10" />

            <div className="space-y-6">
              
              {/* Wallet Card */}
              <motion.div 
                whileHover={{ y: -4 }}
                className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden border border-slate-800/50"
              >
                
                {/* Background elements */}
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-600/10 rounded-full blur-xl pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-52 h-52 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />

                {/* Header */}
                <div className="flex justify-between items-center mb-6 relative z-10">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Wallet Balance</span>
                  <motion.button 
                    onClick={() => setBalanceVisible(!balanceVisible)}
                    whileHover={{ scale: 1.1 }}
                    className="p-1.5 hover:bg-slate-800/80 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors"
                  >
                    {balanceVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </motion.button>
                </div>

                {/* Balance */}
                <div className="mb-8 relative z-10">
                  <AnimatePresence mode="wait">
                    <motion.h2 
                      key={balanceVisible ? 'visible' : 'hidden'}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-5xl font-black font-mono tracking-tight text-emerald-300"
                    >
                      {balanceVisible ? "₦24,580.00" : "₦ • • • • • •"}
                    </motion.h2>
                  </AnimatePresence>
                </div>

                {/* Action label */}
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3.5 block relative z-10">Quick Actions</span>

                {/* Deposit button */}
                <motion.button 
                  onClick={() => setDepositModalOpen(true)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-bold text-base rounded-2xl py-4 w-full text-center mb-8 relative z-10 transition-all shadow-lg shadow-emerald-500/20"
                >
                  Deposit Funds
                </motion.button>

                {/* Service icons */}
                <div className="grid grid-cols-4 gap-4 pt-1 relative z-10 border-t border-slate-800">
                  {[
                    { icon: Smartphone, label: 'Airtime' },
                    { icon: ZapIcon, label: 'Data' },
                    { icon: Tv, label: 'Cable' },
                    { icon: Zap, label: 'Power' }
                  ].map((item, i) => (
                    <motion.button
                      key={i}
                      onClick={onAuth}
                      whileHover={{ scale: 1.1, backgroundColor: 'rgba(16, 185, 129, 0.1)' }}
                      className="flex flex-col items-center gap-2 group"
                    >
                      <div className="w-12 h-12 bg-slate-800/50 group-hover:bg-emerald-600/20 rounded-xl flex items-center justify-center text-emerald-400 group-hover:text-emerald-300 transition-all border border-slate-700">
                        <item.icon size={18} />
                      </div>
                      <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">{item.label}</span>
                    </motion.button>
                  ))}
                </div>

              </motion.div>

              {/* Transaction Item */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                whileHover={{ y: -2 }}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-lg shadow-slate-200/50 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 rounded-full flex items-center justify-center font-black text-xs tracking-tight shadow-md">
                    MTN
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">MTN SME - 1GB</h4>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Just now • 0803 123 4567</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-sm text-rose-600">-₦240</span>
                  <p className="text-xs text-emerald-600 font-black uppercase tracking-wider mt-0.5">Success</p>
                </div>
              </motion.div>

            </div>
          </motion.div>

        </div>
      </header>

      {/* STATS SECTION */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-emerald-900 to-slate-950 py-12 px-4"
      >
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }} />
        
        <div className="max-w-7xl mx-auto relative z-10 flex flex-wrap justify-center sm:justify-between items-center gap-x-20 gap-y-8 text-white">
          {[
            { value: '50k+', label: 'Active resellers' },
            { value: '99.9%', label: 'Success rate' },
            { value: '<10s', label: 'Avg delivery' }
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="text-center sm:text-left group"
            >
              <b className="block text-4xl sm:text-5xl font-black text-emerald-300 group-hover:text-emerald-200 transition-colors">
                {stat.value}
              </b>
              <span className="text-sm text-emerald-100/80 font-bold group-hover:text-emerald-100 transition-colors">{stat.label}</span>
            </motion.div>
          ))}
          
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-200 bg-emerald-500/20 border border-emerald-500/40 px-4 py-2 rounded-full backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            All providers online
          </div>
        </div>
      </motion.section>

      {/* NETWORK LOGOS */}
      <motion.section 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="py-16 bg-white border-y border-slate-100"
      >
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-10">Works with every major network</p>
          
          <div className="flex flex-wrap justify-center items-center gap-12 sm:gap-20">
            {[
              { name: 'MTN', bg: 'bg-amber-400', border: 'border-amber-300', text: 'text-slate-900' },
              { name: 'glo', bg: 'bg-green-600', border: 'border-green-500', text: 'text-white' },
              { name: 'airtel', bg: 'bg-red-600', border: 'border-red-500', text: 'text-white' },
              { name: '9mob', bg: 'bg-emerald-950', border: 'border-emerald-800', text: 'text-emerald-400' }
            ].map((network) => (
              <motion.div
                key={network.name}
                whileHover={{ scale: 1.1 }}
                onClick={() => window.location.hash = "#prices"}
                className="flex flex-col items-center gap-3 cursor-pointer group"
              >
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center font-black text-sm tracking-tight shadow-lg group-hover:shadow-xl transition-all border-2 group-hover:scale-110",
                  network.bg, network.border, network.text
                )}>
                  {network.name}
                </div>
                <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">
                  {network.name === '9mob' ? '9mobile' : network.name}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* SERVICES SECTION */}
      <section id="services" className="py-28 px-4 bg-white relative">
        <div className="max-w-7xl mx-auto space-y-20">
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-left space-y-4 max-w-3xl"
          >
            <span className="text-xs font-bold tracking-widest uppercase text-emerald-600">Our Services</span>
            <h2 className="text-5xl md:text-6xl font-black tracking-tight text-slate-900">
              All your daily subscriptions in one place.
            </h2>
            <p className="text-slate-600 text-lg font-medium leading-relaxed max-w-2xl">
              Experience seamless, instant fulfillment on all networks and utility portals through direct telecom API handshakes.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Airtime Service Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -4 }}
              className="bg-gradient-to-br from-slate-50 to-emerald-50/30 rounded-3xl p-8 border border-slate-200 shadow-lg flex flex-col justify-between group"
            >
              <div className="space-y-6">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm border border-slate-200 group-hover:shadow-lg group-hover:scale-110 transition-all">
                  <Smartphone size={24} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-black text-slate-900">Instant Airtime</h3>
                  <p className="text-slate-600 text-base font-medium leading-relaxed">
                    Top up MTN, Airtel, Glo, or 9mobile instantly. Send values from ₦50 to ₦100,000.
                  </p>
                </div>
              </div>
              <motion.button 
                onClick={onAuth}
                whileHover={{ x: 4 }}
                className="mt-8 text-emerald-600 hover:text-emerald-700 font-bold text-sm flex items-center gap-1"
              >
                Recharge airtime <ChevronRight size={16} />
              </motion.button>
            </motion.div>

            {/* Cable Service Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              whileHover={{ y: -4 }}
              className="bg-gradient-to-br from-slate-50 to-emerald-50/30 rounded-3xl p-8 border border-slate-200 shadow-lg flex flex-col justify-between group"
            >
              <div className="space-y-6">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm border border-slate-200 group-hover:shadow-lg group-hover:scale-110 transition-all">
                  <Tv size={24} />
                </div>
                <div className="space-y-4">
                  <h3 className="text-3xl font-black text-slate-900">Cable TV Renewals</h3>
                  <p className="text-slate-600 text-base font-medium">
                    Enter IUC number and choose your plan. Works with GOtv, DStv, and StarTimes.
                  </p>
                  
                  <div className="flex gap-2 p-1.5 bg-slate-200/50 rounded-xl max-w-xs">
                    {(['dstv', 'gotv', 'startimes'] as const).map((p) => (
                      <motion.button
                        key={p}
                        onClick={() => setActiveCableTab(p)}
                        whileHover={{ scale: 1.05 }}
                        className={cn(
                          "flex-1 text-xs font-bold py-2 rounded-lg capitalize transition-all",
                          activeCableTab === p ? "bg-white text-slate-900 shadow-md" : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        {p}
                      </motion.button>
                    ))}
                  </div>

                  <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2 max-w-md">
                    {cablePlans[activeCableTab].length === 0 ? (
                      <div className="text-xs text-slate-400 font-bold py-2 text-center">Coming soon</div>
                    ) : cablePlans[activeCableTab].slice(0, 3).map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-800">{p.name}</span>
                        <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md text-xs">{p.price.split(' ')[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <motion.button 
                onClick={onAuth}
                whileHover={{ x: 4 }}
                className="mt-8 text-emerald-600 hover:text-emerald-700 font-bold text-sm flex items-center gap-1"
              >
                Renew subscription <ChevronRight size={16} />
              </motion.button>
            </motion.div>

            {/* Electricity Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              whileHover={{ y: -4 }}
              className="bg-gradient-to-br from-slate-50 to-emerald-50/30 rounded-3xl p-8 border border-slate-200 shadow-lg md:col-span-2"
            >
              <div className="grid lg:grid-cols-12 gap-8 items-center">
                
                <div className="lg:col-span-7 space-y-6">
                  <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm border border-slate-200 group-hover:shadow-lg group-hover:scale-110 transition-all">
                    <Zap size={24} />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-3xl font-black text-slate-900">Instant Electricity</h3>
                    <p className="text-slate-600 text-base font-medium">
                      Buy prepaid tokens or pay postpaid bills across all DISCOs. Tokens display instantly.
                    </p>
                  </div>
                  <motion.button 
                    onClick={onAuth}
                    whileHover={{ x: 4 }}
                    className="text-emerald-600 hover:text-emerald-700 font-bold text-sm flex items-center gap-1"
                  >
                    Buy power token <ChevronRight size={16} />
                  </motion.button>
                </div>

                <div className="lg:col-span-5">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Supported zones</span>
                    <div className="flex flex-wrap gap-2">
                      {["Abuja", "Benin", "Eko", "Enugu", "Ibadan", "Ikeja", "Jos", "Kaduna"].map((city) => (
                        <span key={city} className="bg-slate-50 hover:bg-emerald-50 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-full border border-slate-200 transition-all">
                          {city}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* PRICING TABLE */}
      <section id="prices" className="py-28 px-4 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-12">
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <div className="space-y-3">
              <span className="text-xs font-bold tracking-widest uppercase text-emerald-600">Data pricing</span>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900">Competitive rates on all networks</h2>
              <p className="text-slate-600 text-lg font-medium max-w-2xl">
                Live plans fetched from providers. What you see is what you pay.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 p-1.5 bg-white rounded-2xl w-fit border border-slate-200">
              {(['mtn', 'glo', 'airtel', '9mobile'] as const).map((nw) => (
                <motion.button
                  key={nw}
                  onClick={() => setActiveNetworkTab(nw)}
                  whileHover={{ scale: 1.05 }}
                  className={cn(
                    "text-xs font-black px-5 py-3 rounded-xl capitalize transition-all",
                    activeNetworkTab === nw 
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30" 
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {nw}
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Plans Table */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-lg"
          >
            <div className="grid grid-cols-4 bg-slate-50 p-4 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-widest">
              <div>Data Size</div>
              <div>Validity</div>
              <div>Plan Type</div>
              <div className="text-right">Price</div>
            </div>
            <div className="divide-y divide-slate-200">
              {planRates[activeNetworkTab].length === 0 ? (
                <div className="p-6 text-xs text-slate-400 font-bold text-center">Loading plans...</div>
              ) : (
                planRates[activeNetworkTab].map((p, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.05 }}
                    className="grid grid-cols-4 p-4 text-sm font-bold text-slate-700 hover:bg-emerald-50/50 transition-all items-center"
                  >
                    <div className="text-base text-slate-900">{p.size}</div>
                    <div className="text-slate-600">{p.duration}</div>
                    <div>
                      <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-lg text-xs font-bold tracking-widest">
                        {p.type}
                      </span>
                    </div>
                    <div className="text-right text-lg text-emerald-600 font-black">{p.price}</div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>

          <div className="text-center pt-4">
            <motion.button 
              onClick={onAuth}
              whileHover={{ scale: 1.05 }}
              className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-bold transition-all"
            >
              View all plans in dashboard <ArrowRight size={16} />
            </motion.button>
          </div>
        </div>
      </section>

      {/* BULK PINS SECTION */}
      <section className="py-28 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-16 items-center">
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-7 space-y-8"
            >
              <span className="bg-emerald-100 text-emerald-700 font-black text-xs uppercase tracking-widest px-4 py-2 rounded-full inline-block">
                For resellers & kiosks
              </span>
              <h2 className="text-5xl font-black text-slate-900">
                Print pins in bulk, instantly.
              </h2>
              <p className="text-slate-600 text-lg font-medium">
                Generate MTN, Glo, Airtel and 9mobile pins. Pick denominations, choose quantity, and download immediately.
              </p>

              <div className="space-y-4">
                {[
                  'Up to 50 pins per batch',
                  'All four networks available',
                  'Funded from your wallet'
                ].map((item, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3 text-base font-semibold text-slate-700"
                  >
                    <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    {item}
                  </motion.div>
                ))}
              </div>

              <motion.button 
                onClick={onAuth}
                whileHover={{ scale: 1.05, y: -2 }}
                className="bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-lg px-8 py-5 rounded-2xl shadow-xl shadow-emerald-500/30 flex items-center gap-2 w-fit"
              >
                Start generating <ArrowRight size={20} />
              </motion.button>
            </motion.div>

            {/* Interactive Calculator */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-5 bg-gradient-to-br from-white to-emerald-50 p-8 rounded-3xl border border-slate-200 shadow-2xl space-y-8"
            >
              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest block">Calculator</span>
              
              {/* Network */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-700 block">Network</label>
                <div className="flex justify-between gap-2">
                  {(['mtn', 'glo', 'airtel', '9mobile'] as const).map((nw) => (
                    <motion.button
                      key={nw}
                      onClick={() => setPinNetwork(nw)}
                      whileHover={{ scale: 1.05 }}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-xs font-bold capitalize border-2 transition-all",
                        pinNetwork === nw 
                          ? "bg-slate-900 text-white border-slate-900" 
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      )}
                    >
                      {nw}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Denomination */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-700 block">Denomination</label>
                <div className="grid grid-cols-2 gap-2">
                  {[100, 200, 400, 500].map((denom) => (
                    <motion.button
                      key={denom}
                      onClick={() => setPinDenom(denom)}
                      whileHover={{ scale: 1.05 }}
                      className={cn(
                        "py-3 rounded-xl border-2 text-xs font-black transition-all text-center",
                        pinDenom === denom 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300" 
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      )}
                    >
                      ₦{denom}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-xs font-black text-slate-700">Quantity</label>
                  <span className="text-xs font-bold text-slate-800">{pinQty} pins</span>
                </div>
                <div className="flex items-center gap-3">
                  <motion.button 
                    onClick={() => setPinQty(prev => Math.max(1, prev - 1))}
                    whileHover={{ scale: 1.1 }}
                    className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-all"
                  >
                    <Minus size={16} />
                  </motion.button>
                  <input 
                    type="range" 
                    min="1" 
                    max="50" 
                    value={pinQty}
                    onChange={(e) => setPinQty(Number(e.target.value))}
                    className="flex-1 accent-emerald-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <motion.button 
                    onClick={() => setPinQty(prev => Math.min(50, prev + 1))}
                    whileHover={{ scale: 1.1 }}
                    className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-all"
                  >
                    <Plus size={16} />
                  </motion.button>
                </div>
              </div>

              {/* Total */}
              <div className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl border-2 border-emerald-200 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700">Total Cost</span>
                <span className="text-2xl font-black text-emerald-600 font-mono">₦{(pinDenom * pinQty).toLocaleString()}</span>
              </div>

            </motion.div>

          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-28 px-4 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 space-y-4"
          >
            <span className="text-xs font-bold tracking-widest uppercase text-emerald-600">How it works</span>
            <h2 className="text-5xl font-black text-slate-900">Three steps to your first payment.</h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            
            {[
              { num: '01', title: 'Create account', desc: 'Sign up with email and phone. Takes under a minute.' },
              { num: '02', title: 'Fund wallet', desc: 'Get a one-time bank account. Transfer any amount and wallet credits instantly.' },
              { num: '03', title: 'Pay for anything', desc: 'Buy airtime, data, cable, electricity or print pins from your balance.' }
            ].map((step, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg relative group overflow-hidden"
              >
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-emerald-100 rounded-full group-hover:scale-110 transition-transform duration-500 opacity-0 group-hover:opacity-100" />
                
                <span className="text-6xl font-black text-slate-200 group-hover:text-emerald-200 transition-colors">{step.num}</span>
                
                <div className="relative z-10 mt-6 space-y-3">
                  <h4 className="text-2xl font-black text-slate-900">{step.title}</h4>
                  <p className="text-slate-600 font-medium">{step.desc}</p>
                </div>
              </motion.div>
            ))}

          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-28 px-4 bg-white">
        <div className="max-w-7xl mx-auto space-y-16">
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-4 max-w-2xl"
          >
            <span className="text-xs font-bold tracking-widest uppercase text-emerald-600">Why NORODATA</span>
            <h2 className="text-5xl font-black text-slate-900">Built for speed, honesty and reliability.</h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            
            {[
              { icon: ShieldCheck, title: 'Secure payments', desc: 'One-time accounts powered by Monnify' },
              { icon: ZapIcon, title: 'Instant delivery', desc: 'Airtime, data, cable in seconds' },
              { icon: Sparkles, title: 'Auto-refunds', desc: 'Failed transactions reversed instantly' },
              { icon: DollarSign, title: 'Transparent fees', desc: 'No hidden costs or surprises' },
              { icon: FileCheck2, title: 'All receipts saved', desc: 'Timestamped and printable' },
              { icon: TrendingUp, title: 'Live pricing', desc: 'Real-time rates from providers' }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -4 }}
                className="bg-gradient-to-br from-slate-50 to-emerald-50/20 p-8 rounded-2xl border border-slate-200 shadow-md group"
              >
                <div className="w-12 h-12 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center text-emerald-600 group-hover:scale-110 group-hover:border-emerald-300 transition-all">
                  <feature.icon size={24} />
                </div>
                <h4 className="text-xl font-black text-slate-900 mt-4">{feature.title}</h4>
                <p className="text-slate-600 text-sm font-medium mt-2">{feature.desc}</p>
              </motion.div>
            ))}

          </div>
        </div>
      </section>

      {/* FAQs */}
      <section id="faq" className="py-28 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16 space-y-4"
          >
            <span className="text-xs font-bold tracking-widest uppercase text-emerald-600">FAQ</span>
            <h2 className="text-5xl font-black text-slate-900">Frequently asked questions.</h2>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((f, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "border-2 rounded-2xl overflow-hidden transition-all duration-300",
                  faqOpenIdx === idx ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                <motion.button
                  onClick={() => setFaqOpenIdx(faqOpenIdx === idx ? null : idx)}
                  className="w-full px-6 py-5 text-left flex justify-between items-center font-bold text-slate-900 transition-colors"
                >
                  <span className="pr-4">{f.q}</span>
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0 transition-all">
                    {faqOpenIdx === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </motion.button>
                
                <AnimatePresence initial={false}>
                  {faqOpenIdx === idx && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-6 pb-6 text-slate-600 font-medium leading-relaxed"
                    >
                      {f.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* FINAL CTA */}
      <motion.section 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="py-28 px-4 bg-white border-t border-slate-100"
      >
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-5xl md:text-6xl font-black text-slate-900">
            Start paying bills instantly.
          </h2>
          <p className="text-slate-600 text-xl font-medium max-w-2xl mx-auto">
            Create your free account today and experience lightning-fast automated data, instant airtime, and seamless bill payments.
          </p>
          <div className="flex flex-col items-center gap-4 pt-4">
            <motion.button 
              onClick={onAuth}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-black text-xl px-10 py-6 rounded-2xl shadow-xl shadow-emerald-500/30 flex items-center gap-3 transition-all"
            >
              Get Started Now <ArrowRight size={24} />
            </motion.button>
            <motion.button 
              onClick={onAuth}
              whileHover={{ scale: 1.05 }}
              className="text-slate-600 hover:text-slate-900 font-bold transition-all"
            >
              Already have an account? <span className="text-emerald-600 underline">Log in</span>
            </motion.button>
          </div>
        </div>
      </motion.section>

      {/* FOOTER */}
      <footer className="bg-slate-950 text-white pt-20 pb-12 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12">
            
            <div className="col-span-2 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="text-2xl font-black tracking-tight">NORODATA</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-sm font-medium">
                Simplify how you recharge, subscribe, and pay utilities in Nigeria.
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Company</h4>
              <ul className="space-y-2.5 text-sm text-slate-400 font-bold">
                <li><a href="#services" className="hover:text-emerald-400 transition-colors">Services</a></li>
                <li><span onClick={onAuth} className="hover:text-emerald-400 transition-colors cursor-pointer">Login</span></li>
                <li><span onClick={onAuth} className="hover:text-emerald-400 transition-colors cursor-pointer">Create account</span></li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Services</h4>
              <ul className="space-y-2.5 text-sm text-slate-400 font-bold">
                <li><span onClick={onAuth} className="hover:text-emerald-400 transition-colors cursor-pointer">Airtime</span></li>
                <li><span onClick={onAuth} className="hover:text-emerald-400 transition-colors cursor-pointer">Data</span></li>
                <li><span onClick={onAuth} className="hover:text-emerald-400 transition-colors cursor-pointer">Electricity</span></li>
              </ul>
            </div>

            <div className="space-y-4 col-span-2 md:col-span-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Developers</h4>
              <ul className="space-y-2.5 text-sm text-slate-400 font-bold">
                <li><a href="#" className="hover:text-emerald-400 transition-colors">API Docs</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">Getting Started</a></li>
              </ul>
            </div>

          </div>

          <div className="pt-8 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="space-y-1 text-center md:text-left">
              <p className="text-slate-500 text-xs font-bold">© 2026 NORODATA. All rights reserved.</p>
              <p className="text-slate-600 text-xs font-bold uppercase tracking-wider">Powered by Monnify</p>
            </div>
            <div className="flex gap-6 text-xs text-slate-500 font-bold">
              <a href="#" className="hover:text-emerald-400 transition-colors">Privacy</a>
              <a href="#" className="hover:text-emerald-400 transition-colors">Terms</a>
            </div>
          </div>

        </div>
      </footer>

      {/* DEPOSIT MODAL */}
      <AnimatePresence>
        {depositModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
              onClick={() => setDepositModalOpen(false)}
            />

            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md relative z-10 border border-slate-200 shadow-2xl space-y-6"
            >
              
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full inline-block">
                    Monnify Gateway
                  </span>
                  <h3 className="text-2xl font-black text-slate-900">Your Bank Account</h3>
                </div>
                <motion.button 
                  onClick={() => setDepositModalOpen(false)}
                  whileHover={{ scale: 1.1 }}
                  className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <X size={18} />
                </motion.button>
              </div>

              <p className="text-slate-600 text-sm font-medium">
                Transfer any amount to this account. Your wallet credits instantly.
              </p>

              <div className="bg-gradient-to-br from-slate-50 to-emerald-50/30 rounded-2xl p-6 space-y-4 border border-slate-200">
                
                {[
                  { label: 'Bank Name', value: 'Sterling Bank' },
                  { label: 'Account Number', value: '8234850192' },
                  { label: 'Account Name', value: 'NORODATA / Ibrahim Faruq' }
                ].map((item, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={cn(
                      "flex justify-between items-center text-sm",
                      i < 2 && "pb-4 border-b border-slate-200"
                    )}
                  >
                    <span className="text-slate-600 font-bold">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{item.value}</span>
                      <motion.button 
                        onClick={() => handleCopy(item.value, item.label)}
                        whileHover={{ scale: 1.1 }}
                        className="text-slate-400 hover:text-emerald-600 transition-colors"
                      >
                        {copiedText === item.label ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </motion.button>
                    </div>
                  </motion.div>
                ))}

              </div>

              <div className="flex gap-3 bg-emerald-50 border border-emerald-200 p-4 rounded-xl items-start">
                <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-black text-emerald-900 block mb-1">Instant & Automatic</span>
                  <p className="text-xs text-emerald-700 font-medium">
                    No OTP or passwords. Your wallet credits in seconds.
                  </p>
                </div>
              </div>

              <motion.button 
                onClick={() => setDepositModalOpen(false)}
                whileHover={{ scale: 1.02 }}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-4 rounded-xl w-full transition-all"
              >
                Close
              </motion.button>

            </motion.div>

          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
