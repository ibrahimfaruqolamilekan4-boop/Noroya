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
  Minus
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

  // Pin Generator state variables
  const [pinNetwork, setPinNetwork] = React.useState<'mtn' | 'glo' | 'airtel' | '9mobile'>('mtn');
  const [pinDenom, setPinDenom] = React.useState<number>(100);
  const [pinQty, setPinQty] = React.useState<number>(10);

  // Copy handler with temporary state feedback
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const planRates = {
    mtn: [
      { size: "500MB", duration: "30 Days", type: "SME", price: "₦135" },
      { size: "1GB", duration: "30 Days", type: "SME", price: "₦265" },
      { size: "2GB", duration: "30 Days", type: "SME", price: "₦530" },
      { size: "5GB", duration: "30 Days", type: "SME", price: "₦1,325" },
      { size: "10GB", duration: "30 Days", type: "SME", price: "₦2,650" }
    ],
    glo: [
      { size: "750MB", duration: "14 Days", type: "SME", price: "₦190" },
      { size: "1.5GB", duration: "30 Days", type: "SME", price: "₦290" },
      { size: "3GB", duration: "30 Days", type: "SME", price: "₦580" },
      { size: "5GB", duration: "30 Days", type: "SME", price: "₦950" },
      { size: "10GB", duration: "30 Days", type: "SME", price: "₦1,900" }
    ],
    airtel: [
      { size: "500MB", duration: "7 Days", type: "Gifting", price: "₦145" },
      { size: "1GB", duration: "30 Days", type: "Gifting", price: "₦250" },
      { size: "2GB", duration: "30 Days", type: "Gifting", price: "₦500" },
      { size: "5GB", duration: "30 Days", type: "Gifting", price: "₦1,250" },
      { size: "10GB", duration: "30 Days", type: "Gifting", price: "₦2,500" }
    ],
    "9mobile": [
      { size: "1GB", duration: "30 Days", type: "SME", price: "₦295" },
      { size: "1.5GB", duration: "30 Days", type: "SME", price: "₦445" },
      { size: "3GB", duration: "30 Days", type: "SME", price: "₦890" },
      { size: "5GB", duration: "30 Days", type: "SME", price: "₦1,480" },
      { size: "10GB", duration: "30 Days", type: "SME", price: "₦2,950" }
    ]
  };

  const cablePlans = {
    dstv: [
      { name: "DStv Padi", price: "₦2,950 / month", channels: "45+ Channels" },
      { name: "DStv Yanga", price: "₦4,200 / month", channels: "85+ Channels" },
      { name: "DStv Confam", price: "₦6,200 / month", channels: "105+ Channels" },
      { name: "DStv Compact", price: "₦12,500 / month", channels: "135+ Channels" }
    ],
    gotv: [
      { name: "GOtv Lite", price: "₦1,200 / month", channels: "25+ Channels" },
      { name: "GOtv Value", price: "₦1,850 / month", channels: "40+ Channels" },
      { name: "GOtv Jinja", price: "₦2,700 / month", channels: "45+ Channels" },
      { name: "GOtv Max", price: "₦4,850 / month", channels: "75+ Channels" }
    ],
    startimes: [
      { name: "Startimes Nova", price: "₦1,500 / month", channels: "30+ Channels" },
      { name: "Startimes Basic", price: "₦3,000 / month", channels: "80+ Channels" },
      { name: "Startimes Smart", price: "₦4,500 / month", channels: "100+ Channels" },
      { name: "Startimes Super", price: "₦6,500 / month", channels: "150+ Channels" }
    ]
  };

  const faqs = [
    {
      q: "How does wallet funding work on Noroyasub?",
      a: "When you wish to fund your wallet, we assign you a personalized, automated transfer account. Simple bank transfers to this account credit your Noroyasub wallet balance automatically in under 10 seconds, with zero human intervention."
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
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden relative font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Dynamic Header / Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            
            {/* Logo */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <div className="w-11 h-11 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                {/* Modern "N" Custom SVG inside blue box */}
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 20V4L20 20V4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-2xl font-black tracking-tight text-slate-900 font-display">Noroyasub</span>
            </div>
            
            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
              <a href="#services" className="hover:text-blue-600 transition-colors">Services</a>
              <a href="#prices" className="hover:text-blue-600 transition-colors">Prices</a>
              <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
              <a href="#faq" className="hover:text-blue-600 transition-colors">FAQ</a>
            </div>

            {/* Desktop Auth Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <button 
                onClick={onAuth}
                className="text-slate-700 hover:text-blue-600 font-bold text-sm px-4 py-2.5 transition-all"
              >
                Log in
              </button>
              <button 
                onClick={onAuth}
                className="bg-blue-600 text-white font-bold text-sm px-6 py-3.5 rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transform hover:-translate-y-0.5"
              >
                Create free account →
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2.5 hover:bg-slate-100 rounded-2xl text-slate-800 transition-all" 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Dropdown Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-20 inset-x-0 z-40 bg-white border-b border-slate-100 px-6 py-8 md:hidden shadow-xl"
          >
            <div className="flex flex-col gap-6 text-lg font-bold text-slate-800">
              <a href="#services" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 py-1 transition-colors">Services</a>
              <a href="#prices" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 py-1 transition-colors">Prices</a>
              <a href="#features" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 py-1 transition-colors">Features</a>
              <a href="#faq" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 py-1 transition-colors">FAQ</a>
              
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
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl text-center hover:bg-blue-700 shadow-lg shadow-blue-500/10 transition-all"
                >
                  Create free account →
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero & Interactive Wallet Showcase Grid Section */}
      <header className="pt-32 pb-24 md:pt-40 md:pb-32 px-4 sm:px-6 relative bg-white">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-16 items-center">
          
          {/* Left Column: Hero Text */}
          <div className="lg:col-span-7 space-y-8 text-left">
            
            {/* Services Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full border border-blue-100">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
              Airtime • Data • Cable • Electricity • Pins
            </div>

            {/* Display Header */}
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.08] text-slate-900 font-display">
              Smart payments.<br />
              Delivered <span className="text-blue-600 underline underline-offset-8 decoration-3 decoration-blue-500/30">instantly.</span>
            </h1>

            {/* Description */}
            <p className="text-lg md:text-xl text-slate-500 leading-relaxed max-w-2xl font-medium">
              Fund your Noroyasub wallet securely to recharge airtime, buy cheap data bundles, pay power bills, and renew TV subscriptions across Nigeria in under 5 seconds.
            </p>

            {/* Primary Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={onAuth}
                className="bg-blue-600 text-white font-bold text-lg px-8 py-5 rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/15 hover:-translate-y-0.5 transform flex items-center justify-center gap-2"
              >
                Get Started Now <ArrowRight size={18} />
              </button>
              <a 
                href="#prices"
                className="bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-bold text-lg px-8 py-5 rounded-2xl border border-slate-200/40 transition-all text-center flex items-center justify-center"
              >
                Check discounted rates
              </a>
            </div>

            {/* Core Checkmarks List */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-3 gap-x-6 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-600">
                <svg className="w-5 h-5 text-[#00c569]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
                Direct wallet funding
              </div>
              <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-600">
                <svg className="w-5 h-5 text-[#00c569]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
                Automated API delivery
              </div>
              <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-600">
                <svg className="w-5 h-5 text-[#00c569]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
                Failsafe auto-refunds
              </div>
            </div>
          </div>

          {/* Right Column: High Fidelity Interactive Wallet Preview */}
          <div className="lg:col-span-5 relative">
            
            {/* Glowing Accent behind the card */}
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-[3rem] blur-2xl opacity-10 -z-10" />

            <div className="space-y-6">
              
              {/* Wallet Card Mockup */}
              <div className="bg-slate-950 text-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden border border-slate-800/50">
                
                {/* Visual Circle Background elements for card realism */}
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-600/10 rounded-full blur-xl pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-52 h-52 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />

                {/* Header of Card */}
                <div className="flex justify-between items-center mb-6 relative z-10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Wallet Balance</span>
                  <button 
                    onClick={() => setBalanceVisible(!balanceVisible)}
                    className="p-1.5 hover:bg-slate-800/80 rounded-lg text-slate-400 hover:text-white transition-colors"
                  >
                    {balanceVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Balance display with toggle */}
                <div className="mb-8 relative z-10">
                  <AnimatePresence mode="wait">
                    <motion.h2 
                      key={balanceVisible ? 'visible' : 'hidden'}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="text-4xl md:text-5xl font-black font-mono tracking-tight"
                    >
                      {balanceVisible ? "₦24,580.00" : "₦ • • • • • •"}
                    </motion.h2>
                  </AnimatePresence>
                </div>

                {/* Quick Action Heading */}
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3.5 block relative z-10">Quick Actions</span>

                {/* Green Deposit Funds Button */}
                <button 
                  onClick={() => setDepositModalOpen(true)}
                  className="bg-[#00c569] hover:bg-[#00b05c] text-slate-950 font-extrabold text-base rounded-2xl py-4 w-full text-center mb-8 relative z-10 transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-[#00c569]/10"
                >
                  Deposit Funds
                </button>

                {/* Icons Grid: Airtime, Data, Cable, Electricity */}
                <div className="grid grid-cols-4 gap-4 pt-1 relative z-10 border-t border-slate-900">
                  <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={onAuth}>
                    <div className="w-12 h-12 bg-slate-900 group-hover:bg-blue-600/25 rounded-2xl flex items-center justify-center text-blue-400 group-hover:text-blue-300 transition-all border border-slate-800">
                      <Smartphone size={18} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200">Airtime</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={onAuth}>
                    <div className="w-12 h-12 bg-slate-900 group-hover:bg-blue-600/25 rounded-2xl flex items-center justify-center text-blue-400 group-hover:text-blue-300 transition-all border border-slate-800">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200">Data</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={onAuth}>
                    <div className="w-12 h-12 bg-slate-900 group-hover:bg-blue-600/25 rounded-2xl flex items-center justify-center text-blue-400 group-hover:text-blue-300 transition-all border border-slate-800">
                      <Tv size={18} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200">Cable</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={onAuth}>
                    <div className="w-12 h-12 bg-slate-900 group-hover:bg-blue-600/25 rounded-2xl flex items-center justify-center text-blue-400 group-hover:text-blue-300 transition-all border border-slate-800">
                      <Zap size={18} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200">Electricity</span>
                  </div>
                </div>

              </div>

              {/* Live Ticker Transaction Item Mockup */}
              <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xl shadow-slate-100/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* MTN circle brand logo mockup */}
                  <div className="w-11 h-11 bg-amber-400 text-slate-900 rounded-full flex items-center justify-center font-black text-xs border border-amber-300 tracking-tighter shadow-sm shrink-0">
                    MTN
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800">MTN SME - 1GB</h4>
                    <p className="text-[11px] text-slate-400 font-bold mt-0.5">Just now • 0803 123 4567</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-sm text-rose-600">-₦240</span>
                  <p className="text-[9px] text-[#00c569] font-black uppercase tracking-wider mt-0.5">Automated Success</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </header>

      {/* Supported Carrier Logos Segment */}
      <section className="py-12 bg-white border-y border-slate-100/80">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Works with every major network in Nigeria</p>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-16">
            
            {/* MTN logo circle */}
            <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => { setActiveNetworkTab('mtn'); window.location.hash = "#prices"; }}>
              <div className="w-14 h-14 bg-amber-400 border border-amber-300 text-slate-900 rounded-full flex items-center justify-center font-black text-sm tracking-tighter shadow-md group-hover:scale-105 transition-all">
                MTN
              </div>
              <span className="text-xs font-black tracking-tight text-slate-600">MTN</span>
            </div>

            {/* Glo logo circle */}
            <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => { setActiveNetworkTab('glo'); window.location.hash = "#prices"; }}>
              <div className="w-14 h-14 bg-green-600 border border-green-500 text-white rounded-full flex items-center justify-center font-black text-sm tracking-tighter shadow-md group-hover:scale-105 transition-all">
                glo
              </div>
              <span className="text-xs font-black tracking-tight text-slate-600">Glo</span>
            </div>

            {/* Airtel logo circle */}
            <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => { setActiveNetworkTab('airtel'); window.location.hash = "#prices"; }}>
              <div className="w-14 h-14 bg-red-600 border border-red-500 text-white rounded-full flex items-center justify-center font-black text-sm tracking-tighter shadow-md group-hover:scale-105 transition-all">
                airtel
              </div>
              <span className="text-xs font-black tracking-tight text-slate-600">Airtel</span>
            </div>

            {/* 9mobile logo circle */}
            <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => { setActiveNetworkTab('9mobile'); window.location.hash = "#prices"; }}>
              <div className="w-14 h-14 bg-emerald-950 border border-emerald-800 text-[#00c569] rounded-full flex items-center justify-center font-black text-xs tracking-tighter shadow-md group-hover:scale-105 transition-all">
                9mob
              </div>
              <span className="text-xs font-black tracking-tight text-slate-600">9mobile</span>
            </div>

          </div>
        </div>
      </section>

      {/* CORE CAPABILITIES: "WHAT YOU CAN PAY FOR" */}
      <section id="services" className="py-24 px-4 bg-white relative">
        <div className="max-w-7xl mx-auto space-y-20">
          
          {/* Main Title Block */}
          <div className="text-left space-y-4 max-w-3xl">
            <span className="text-xs font-black tracking-widest uppercase text-blue-600">Our Services</span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 font-display">All your daily subscriptions in one place.</h2>
            <p className="text-slate-500 text-base md:text-lg font-medium leading-relaxed">
              Experience seamless, instant fulfillment on all networks and utility portals through direct telecom API handshakes.
            </p>
          </div>

          {/* Grid of services */}
          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Airtime Card */}
            <div className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-slate-100">
                  <Smartphone size={24} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-extrabold text-slate-900 font-display">Instant Airtime</h3>
                  <p className="text-slate-500 text-sm md:text-base font-medium leading-relaxed">
                    Top up MTN, Airtel, Glo, or 9mobile instantly. Send values from ₦50 to ₦100,000. Excellent for personal recharges or wholesale dispatches.
                  </p>
                </div>
              </div>
              <button onClick={onAuth} className="mt-8 text-blue-600 hover:text-blue-700 font-extrabold text-sm flex items-center gap-1">
                Recharge airtime <ChevronRight size={16} />
              </button>
            </div>

            {/* Cable TV Card */}
            <div className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-slate-100">
                  <Tv size={24} />
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-extrabold text-slate-900 font-display">Smooth Cable TV Renewals</h3>
                    <p className="text-slate-500 text-sm font-medium leading-relaxed">
                      Enter your IUC or smartcard number, verify your customer details, and choose your favorite package. Active reactivations for GOtv, DStv, and StarTimes.
                    </p>
                  </div>
                  
                  {/* Interactive Cable Provider Switcher Tabs inside Card */}
                  <div className="flex gap-2 p-1.5 bg-slate-200/50 rounded-xl max-w-xs">
                    {['dstv', 'gotv', 'startimes'].map((p) => (
                      <button
                        key={p}
                        onClick={() => setActiveCableTab(p as any)}
                        className={cn(
                          "flex-1 text-xs font-bold py-2 rounded-lg capitalize transition-all",
                          activeCableTab === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Tiny Cable packages display list */}
                  <div className="bg-white rounded-2xl p-4 border border-slate-200/40 space-y-2 max-w-md">
                    {cablePlans[activeCableTab].map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-slate-800">{p.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-bold">{p.channels}</span>
                          <span className="font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{p.price.split(' ')[0]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={onAuth} className="mt-8 text-blue-600 hover:text-blue-700 font-extrabold text-sm flex items-center gap-1">
                Renew your subscription <ChevronRight size={16} />
              </button>
            </div>

            {/* Electricity Card */}
            <div className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100 flex flex-col justify-between md:col-span-2">
              <div className="grid lg:grid-cols-12 gap-8 items-center">
                
                <div className="lg:col-span-7 space-y-6">
                  <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-slate-100">
                    <Zap size={24} />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-2xl lg:text-3xl font-extrabold text-slate-900 font-display">Instant Electricity Subscriptions</h3>
                    <p className="text-slate-500 text-sm md:text-base font-medium leading-relaxed">
                      Buy prepaid tokens or pay postpaid bills across all electricity distribution companies (DISCOs). Your generated token displays on screen instantly and remains saved in your personal history log.
                    </p>
                  </div>
                  <button onClick={onAuth} className="text-blue-600 hover:text-blue-700 font-extrabold text-sm flex items-center gap-1">
                    Buy power token <ChevronRight size={16} />
                  </button>
                </div>

                {/* Cities List Mockup */}
                <div className="lg:col-span-5">
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-200/40 shadow-sm space-y-4">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Supported Distribution Zones</span>
                    <div className="flex flex-wrap gap-2">
                      {["Abuja", "Benin", "Eko", "Enugu", "Ibadan", "Ikeja", "Jos", "Kaduna", "Kano", "Port Harcourt", "Yola", "Bauchi"].map((city) => (
                        <span key={city} className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-extrabold text-xs px-3 py-1.5 rounded-full border border-slate-200/50 cursor-default transition-all">
                          {city}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* DYNAMIC INTERACTIVE RATES TABLE (High Fidelity Showcase) */}
          <div id="prices" className="bg-white rounded-[3rem] p-8 lg:p-12 border border-slate-200/60 shadow-lg relative overflow-hidden">
            
            <div className="absolute -top-12 -left-12 w-40 h-40 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />

            <div className="space-y-8 relative z-10">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div className="space-y-2">
                  <span className="text-xs font-black tracking-widest uppercase text-[#00c569]">Data at great prices</span>
                  <h3 className="text-3xl font-black tracking-tight text-slate-900 font-display">Competitive rates across every network</h3>
                  <p className="text-slate-500 text-sm md:text-base font-medium max-w-xl">
                    A taste of what you'll see inside the dashboard. Live plans and prices are fetched from our provider, so what you see is what you pay.
                  </p>
                </div>
                
                {/* Network Switching Tabs inside pricing */}
                <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl w-full md:w-auto">
                  {['mtn', 'glo', 'airtel', '9mobile'].map((nw) => (
                    <button
                      key={nw}
                      onClick={() => setActiveNetworkTab(nw as any)}
                      className={cn(
                        "flex-1 md:flex-none text-xs font-black px-4 py-3 rounded-xl capitalize transition-all",
                        activeNetworkTab === nw ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      {nw}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plans Table */}
              <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                <div className="grid grid-cols-4 bg-slate-50 p-4 border-b border-slate-100 text-xs font-black text-slate-400 uppercase tracking-wider">
                  <div>Data Size</div>
                  <div>Validity</div>
                  <div>Plan Type</div>
                  <div className="text-right">Price</div>
                </div>
                <div className="divide-y divide-slate-100 bg-white">
                  {planRates[activeNetworkTab].map((p, idx) => (
                    <div key={idx} className="grid grid-cols-4 p-4 text-xs font-bold text-slate-700 hover:bg-slate-50/50 transition-colors items-center">
                      <div className="font-extrabold text-sm text-slate-900">{p.size}</div>
                      <div>{p.duration}</div>
                      <div>
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-[10px] uppercase font-black tracking-wider">
                          {p.type}
                        </span>
                      </div>
                      <div className="text-right font-black text-sm text-blue-600">{p.price}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-center pt-2">
                <button 
                  onClick={onAuth}
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-extrabold text-sm transition-all"
                >
                  View all available plans in dashboard <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* BULK RECHARGE PINS PRINTING (Fabulous Interactive Widget) */}
          <div className="bg-slate-50 rounded-[3rem] p-8 lg:p-12 border border-slate-100">
            <div className="grid lg:grid-cols-12 gap-12 items-center">
              
              {/* Left text column */}
              <div className="lg:col-span-7 space-y-6">
                <span className="bg-blue-100 text-blue-700 font-black text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full inline-block">
                  Built for kiosks and resellers
                </span>
                <h3 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight font-display">
                  Print recharge pins in bulk, straight from your wallet.
                </h3>
                <p className="text-slate-500 text-sm md:text-base font-medium leading-relaxed">
                  Generate MTN, Glo, Airtel and 9mobile pins on demand. Pick a denomination, choose how many, and every pin is saved under your account for immediate bulk download.
                </p>

                {/* Bullets */}
                <div className="space-y-3.5">
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                    <svg className="w-5 h-5 text-[#00c569] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                    Up to 50 pins per batch — copy individually or in one click
                  </div>
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                    <svg className="w-5 h-5 text-[#00c569] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                    All four networks, no separate setup per provider
                  </div>
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                    <svg className="w-5 h-5 text-[#00c569] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                    Funded from your wallet — no extra payment per order
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={onAuth}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-base px-6 py-4 rounded-xl flex items-center gap-2 shadow-lg shadow-blue-500/10 transition-all transform hover:-translate-y-0.5"
                  >
                    Start generating pins <ArrowRight size={16} />
                  </button>
                </div>
              </div>

              {/* Right column: Interactive printing calculator widget */}
              <div className="lg:col-span-5 bg-white p-6 rounded-[2rem] border border-slate-200/40 shadow-xl shadow-slate-100/50 space-y-6">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Interactive Batch Calculator</span>
                
                {/* Network Selection Circles */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 block">1. Select Network</label>
                  <div className="flex justify-between items-center gap-2">
                    {['mtn', 'glo', 'airtel', '9mobile'].map((nw) => (
                      <button
                        key={nw}
                        onClick={() => setPinNetwork(nw as any)}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-xs font-extrabold capitalize border transition-all",
                          pinNetwork === nw 
                            ? "bg-slate-900 text-white border-slate-900" 
                            : "bg-slate-50 text-slate-600 border-slate-200/50 hover:bg-slate-100"
                        )}
                      >
                        {nw}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Denomination Picker Buttons */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 block">2. Denomination</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[100, 200, 400, 500].map((denom) => (
                      <button
                        key={denom}
                        onClick={() => setPinDenom(denom)}
                        className={cn(
                          "py-3 rounded-xl border text-xs font-black transition-all text-center",
                          pinDenom === denom 
                            ? "bg-blue-50 text-blue-600 border-blue-300" 
                            : "bg-slate-50 text-slate-600 border-slate-200/50 hover:bg-slate-100"
                        )}
                      >
                        ₦{denom} pin
                        <span className="text-[9px] font-bold text-slate-400 block mt-0.5">
                          {denom === 100 ? "up to 50 / batch" : denom === 200 ? "up to 25 / batch" : denom === 400 ? "up to 15 / batch" : "up to 10 / batch"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity adjustments */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-slate-500">3. Print Quantity</label>
                    <span className="text-xs font-bold text-slate-800">{pinQty} pins</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setPinQty(prev => Math.max(1, prev - 1))}
                      className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center justify-center font-bold"
                    >
                      <Minus size={16} />
                    </button>
                    
                    {/* Visual slider */}
                    <input 
                      type="range" 
                      min="1" 
                      max="50" 
                      value={pinQty} 
                      onChange={(e) => setPinQty(Number(e.target.value))}
                      className="flex-1 accent-blue-600 h-1.5 bg-slate-100 rounded-lg cursor-pointer"
                    />

                    <button 
                      onClick={() => setPinQty(prev => Math.min(50, prev + 1))}
                      className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center justify-center font-bold"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* Live total estimation */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150 flex justify-between items-center">
                  <span className="text-xs font-extrabold text-slate-500">Total Print Cost</span>
                  <span className="text-xl font-black text-slate-900 font-mono">₦{(pinDenom * pinQty).toLocaleString()}</span>
                </div>

              </div>

            </div>
          </div>

        </div>
      </section>

      {/* THREE STEPS METHODOLOGY: "HOW IT WORKS" */}
      <section className="py-24 px-4 bg-slate-50">
        <div className="max-w-7xl mx-auto space-y-16 text-left">
          
          <div className="space-y-4 max-w-2xl">
            <span className="text-xs font-black tracking-widest uppercase text-blue-600">How it works</span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 font-display">Three steps to your first payment.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            
            {/* Step 1 */}
            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm relative flex flex-col justify-between group overflow-hidden">
              <span className="text-7xl font-black text-slate-100 absolute top-4 right-6 group-hover:scale-110 transition-transform duration-500 select-none">01</span>
              <div className="space-y-6 relative z-10 pt-8">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-extrabold text-slate-800">Create an account</h4>
                  <p className="text-slate-400 text-sm font-semibold leading-relaxed">
                    Sign up with your email and phone number. Takes under a minute — no paperwork.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm relative flex flex-col justify-between group overflow-hidden">
              <span className="text-7xl font-black text-slate-100 absolute top-4 right-6 group-hover:scale-110 transition-transform duration-500 select-none">02</span>
              <div className="space-y-6 relative z-10 pt-8">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-extrabold text-slate-800">Fund your wallet</h4>
                  <p className="text-slate-400 text-sm font-semibold leading-relaxed">
                    Tap Deposit Funds, enter any amount from ₦100 and we generate a one-time bank account. Transfer the exact amount and your wallet credits instantly.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm relative flex flex-col justify-between group overflow-hidden">
              <span className="text-7xl font-black text-slate-100 absolute top-4 right-6 group-hover:scale-110 transition-transform duration-500 select-none">03</span>
              <div className="space-y-6 relative z-10 pt-8">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-extrabold text-slate-800">Pay for anything</h4>
                  <p className="text-slate-400 text-sm font-semibold leading-relaxed">
                    Buy airtime or data, renew cable, top up electricity or print recharge pins — straight from your balance.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* CORE HIGHLIGHTS GRID: "WHY NOROYASUB" */}
      <section id="features" className="py-24 px-4 bg-white">
        <div className="max-w-7xl mx-auto space-y-16">
          
          <div className="text-left space-y-4 max-w-2xl">
            <span className="text-xs font-black tracking-widest uppercase text-blue-600">Why Noroyasub</span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 font-display">Built for speed, honesty and reliability.</h2>
          </div>

          {/* Grid Layout of features */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            
            {/* One-time payment accounts */}
            <div className="bg-slate-50/70 p-8 rounded-[2rem] border border-slate-100 flex flex-col gap-5">
              <div className="w-11 h-11 bg-white border border-slate-150 rounded-xl flex items-center justify-center text-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="space-y-2">
                <h4 className="font-extrabold text-lg text-slate-900">One-time payment accounts</h4>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  Every deposit gets its own single-use bank account, powered by Monnify. Transfer the exact amount and your wallet credits — no card details, no shared account number.
                </p>
              </div>
            </div>

            {/* Instant delivery */}
            <div className="bg-slate-50/70 p-8 rounded-[2rem] border border-slate-100 flex flex-col gap-5">
              <div className="w-11 h-11 bg-white border border-slate-150 rounded-xl flex items-center justify-center text-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="space-y-2">
                <h4 className="font-extrabold text-lg text-slate-900">Instant delivery</h4>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  Airtime, data, cable and pins land in seconds. Electricity tokens appear on screen the moment the DISCO responds.
                </p>
              </div>
            </div>

            {/* Auto-refund on failure */}
            <div className="bg-slate-50/70 p-8 rounded-[2rem] border border-slate-100 flex flex-col gap-5">
              <div className="w-11 h-11 bg-white border border-slate-150 rounded-xl flex items-center justify-center text-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5" />
                </svg>
              </div>
              <div className="space-y-2">
                <h4 className="font-extrabold text-lg text-slate-900">Auto-refund on failure</h4>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  If a transaction fails at any point, your wallet is reversed automatically. No support ticket needed.
                </p>
              </div>
            </div>

            {/* Transparent fees */}
            <div className="bg-slate-50/70 p-8 rounded-[2rem] border border-slate-100 flex flex-col gap-5">
              <div className="w-11 h-11 bg-white border border-slate-150 rounded-xl flex items-center justify-center text-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 8h6m-5 0a3 3 0 110 6m0-6V4m0 10v4m-5-4h10" />
                </svg>
              </div>
              <div className="space-y-2">
                <h4 className="font-extrabold text-lg text-slate-900">Transparent fees</h4>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  We show the processing fee and the exact amount you'll receive before you pay. No hidden deductions or tricky fees.
                </p>
              </div>
            </div>

            {/* Every receipt saved */}
            <div className="bg-slate-50/70 p-8 rounded-[2rem] border border-slate-100 flex flex-col gap-5">
              <div className="w-11 h-11 bg-white border border-slate-150 rounded-xl flex items-center justify-center text-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="space-y-2">
                <h4 className="font-extrabold text-lg text-slate-900">Every receipt saved</h4>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  Transactions are timestamped and logged with their reference IDs. Open any one for a full printable receipt.
                </p>
              </div>
            </div>

            {/* Live provider pricing */}
            <div className="bg-slate-50/70 p-8 rounded-[2rem] border border-slate-100 flex flex-col gap-5">
              <div className="w-11 h-11 bg-white border border-slate-150 rounded-xl flex items-center justify-center text-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="space-y-2">
                <h4 className="font-extrabold text-lg text-slate-900">Live provider pricing</h4>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  Data and cable plans are fetched from our provider in real time. You always see what's actually available.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* FAQS SEGMENT: "ANSWERS, STRAIGHT FROM HOW NOROYASUB ACTUALLY WORKS." */}
      <section id="faq" className="py-24 px-4 bg-white relative">
        <div className="max-w-4xl mx-auto space-y-16">
          
          <div className="text-center space-y-4">
            <span className="text-xs font-black tracking-widest uppercase text-blue-600">Frequently Asked</span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 font-display">
              Clear answers about how our platform works.
            </h2>
          </div>

          {/* Accordion List */}
          <div className="space-y-4">
            {faqs.map((f, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "border border-slate-100 rounded-3xl overflow-hidden transition-all duration-300",
                  faqOpenIdx === idx ? "border-blue-200 bg-slate-50/50" : "bg-white hover:bg-slate-50/30"
                )}
              >
                <button
                  type="button"
                  onClick={() => setFaqOpenIdx(faqOpenIdx === idx ? null : idx)}
                  className="w-full px-6 py-5 text-left flex justify-between items-center text-slate-800 font-extrabold text-base transition-colors"
                >
                  <span className="pr-4">{f.q}</span>
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 transition-colors shrink-0">
                    {faqOpenIdx === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>
                
                <AnimatePresence initial={false}>
                  {faqOpenIdx === idx && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-6 pb-6 text-sm text-slate-500 font-medium leading-relaxed"
                    >
                      {f.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* CALL TO ACTION BOTOM SECTION */}
      <section className="py-24 px-4 bg-white border-t border-slate-100">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 font-display">
            Start paying bills instantly in under a minute.
          </h2>
          <p className="text-slate-500 text-base md:text-lg max-w-2xl mx-auto font-medium">
            Create your free account today and experience lightning-fast automated data dispatches, instant airtime, and seamless bill payments.
          </p>
          <div className="flex flex-col items-center gap-4">
            <button 
              onClick={onAuth}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg px-8 py-5 rounded-2xl shadow-xl shadow-blue-500/15 transition-all transform hover:-translate-y-0.5"
            >
              Create free account →
            </button>
            <button 
              onClick={onAuth}
              className="text-slate-500 hover:text-slate-800 text-sm font-bold transition-all mt-1"
            >
              Already have an account? <span className="text-blue-600 underline underline-offset-4 decoration-2 decoration-blue-500/20">Log in</span>
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-950 text-white pt-20 pb-12 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12">
            
            {/* Brand column */}
            <div className="col-span-2 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 20V4L20 20V4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="text-2xl font-black tracking-tight text-white font-display">Noroyasub</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-sm font-medium">
                Simplify how you recharge, subscribe, and pay utilities in Nigeria. Fast, automated, secure, and reliable.
              </p>
            </div>

            {/* Company Link list */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Company</h4>
              <ul className="space-y-2.5 text-sm text-slate-400 font-bold">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#services" className="hover:text-white transition-colors">Services</a></li>
                <li><span onClick={onAuth} className="hover:text-white transition-colors cursor-pointer">Login</span></li>
                <li><span onClick={onAuth} className="hover:text-white transition-colors cursor-pointer">Create account</span></li>
                <li><a href="#" className="hover:text-white transition-colors">API Docs</a></li>
              </ul>
            </div>

            {/* Services Link list */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Services</h4>
              <ul className="space-y-2.5 text-sm text-slate-400 font-bold">
                <li><span onClick={onAuth} className="hover:text-white transition-colors cursor-pointer">Airtime</span></li>
                <li><span onClick={onAuth} className="hover:text-white transition-colors cursor-pointer">Data</span></li>
                <li><span onClick={onAuth} className="hover:text-white transition-colors cursor-pointer">Cable TV</span></li>
                <li><span onClick={onAuth} className="hover:text-white transition-colors cursor-pointer">Electricity</span></li>
                <li><span onClick={onAuth} className="hover:text-white transition-colors cursor-pointer">Recharge pins</span></li>
              </ul>
            </div>

            {/* Developers Link list */}
            <div className="space-y-4 col-span-2 md:col-span-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Developers</h4>
              <ul className="space-y-2.5 text-sm text-slate-400 font-bold">
                <li><a href="#" className="hover:text-white transition-colors">API Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Connect Keys</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Getting Started</a></li>
              </ul>
            </div>

          </div>

          {/* Bottom Copyright segment */}
          <div className="pt-8 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="space-y-1 text-center md:text-left">
              <p className="text-slate-500 text-xs font-bold">© 2026 Noroyasub. All rights reserved.</p>
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Payments securely powered by Monnify</p>
            </div>
            <div className="flex gap-6 text-xs text-slate-500 font-semibold">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>

        </div>
      </footer>

      {/* REUSABLE HIGH-FIDELITY DEPOSIT MODAL (LIVENS UP THE LANDING PAGE EXPERIENCE!) */}
      <AnimatePresence>
        {depositModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Dark glass backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              onClick={() => setDepositModalOpen(false)}
            />

            {/* Modal Body */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-md relative z-10 border border-slate-100 shadow-2xl space-y-6 text-left"
            >
              
              {/* Header */}
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#00c569] bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md inline-block">Active Monnify Transfer Gateway</span>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Your Virtual Bank Account</h3>
                </div>
                <button 
                  onClick={() => setDepositModalOpen(false)}
                  className="p-1.5 hover:bg-slate-150 rounded-xl text-slate-400 hover:text-slate-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-slate-500 text-xs font-semibold leading-relaxed">
                Transfer any amount to your unique payment account below. Your wallet balance will be credited automatically in under 10 seconds.
              </p>

              {/* Account Box Card */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/50 space-y-4">
                
                {/* Bank Name */}
                <div className="flex justify-between items-center text-xs pb-3 border-b border-slate-200/40">
                  <span className="text-slate-400 font-bold">Bank Name</span>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-800">Sterling Bank</span>
                    <button 
                      onClick={() => handleCopy("Sterling Bank", "bank")}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      {copiedText === "bank" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Account Number */}
                <div className="flex justify-between items-center text-xs pb-3 border-b border-slate-200/40">
                  <span className="text-slate-400 font-bold">Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm text-slate-900 tracking-wider">8234850192</span>
                    <button 
                      onClick={() => handleCopy("8234850192", "account")}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      {copiedText === "account" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Account Name */}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold">Account Name</span>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-800">Noroyasub / Ibrahim Faruq</span>
                    <button 
                      onClick={() => handleCopy("Noroyasub / Ibrahim Faruq", "name")}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      {copiedText === "name" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

              </div>

              {/* Call out info */}
              <div className="flex gap-3 bg-blue-50/50 border border-blue-100 p-4 rounded-xl items-start">
                <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black text-blue-800 uppercase block">Instant Automation Enabled</span>
                  <p className="text-[10px] text-blue-600 font-semibold leading-relaxed">
                    This account is fully whitelisted. No debit card, OTP, or passwords required to fund your wallet.
                  </p>
                </div>
              </div>

              {/* Close / Action */}
              <button 
                onClick={() => setDepositModalOpen(false)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-4 rounded-xl w-full text-center block transition-all"
              >
                I understand, close
              </button>

            </motion.div>

          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
