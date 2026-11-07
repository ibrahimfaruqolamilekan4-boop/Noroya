import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Smartphone,
  Wifi,
  Tv,
  Lightbulb,
  PhoneCall,
  CreditCard,
  CheckCircle2,
  ShieldCheck,
  Headphones,
  RotateCcw,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Sparkles,
  ExternalLink,
  MessageCircle,
  Send,
  HelpCircle,
  TrendingDown,
  Layers,
  Check,
  Copy
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

// Support Contacts (Preserved real numbers from system configuration)
const SUPPORT_CONTACTS = [
  { label: 'Admin Desk 1', number: '2348143889102' },
  { label: 'Admin Desk 2', number: '2347034519634' },
];
const TELEGRAM_URL = 'https://t.me/NORODATA_data_group';

// Fallback pricing data in case API/database is unreachable
const FALLBACK_PLANS: Record<string, Array<{ name: string; validity: string; price: number; type: string }>> = {
  mtn: [
    { name: '1.0 GB SME Data', validity: '30 Days', price: 400, type: 'SME' },
    { name: '2.0 GB SME Data', validity: '30 Days', price: 800, type: 'SME' },
    { name: '3.0 GB SME Data', validity: '30 Days', price: 1200, type: 'SME' },
    { name: '5.0 GB SME Data', validity: '30 Days', price: 2000, type: 'SME' },
    { name: '10.0 GB SME Data', validity: '30 Days', price: 4000, type: 'SME' },
    { name: '1.0 GB Corporate Gifting', validity: '30 Days', price: 420, type: 'CG' },
  ],
  glo: [
    { name: '1.0 GB Corporate Gifting', validity: '30 Days', price: 380, type: 'CG' },
    { name: '2.0 GB Corporate Gifting', validity: '30 Days', price: 760, type: 'CG' },
    { name: '3.0 GB Corporate Gifting', validity: '30 Days', price: 1140, type: 'CG' },
    { name: '5.0 GB Corporate Gifting', validity: '30 Days', price: 1900, type: 'CG' },
    { name: '10.0 GB Corporate Gifting', validity: '30 Days', price: 3800, type: 'CG' },
  ],
  airtel: [
    { name: '1.0 GB Corporate Gifting', validity: '30 Days', price: 410, type: 'CG' },
    { name: '2.0 GB Corporate Gifting', validity: '30 Days', price: 820, type: 'CG' },
    { name: '3.0 GB Corporate Gifting', validity: '30 Days', price: 1230, type: 'CG' },
    { name: '5.0 GB Corporate Gifting', validity: '30 Days', price: 2050, type: 'CG' },
    { name: '10.0 GB Corporate Gifting', validity: '30 Days', price: 4100, type: 'CG' },
  ],
  '9mobile': [
    { name: '1.0 GB Corporate Gifting', validity: '30 Days', price: 390, type: 'CG' },
    { name: '2.0 GB Corporate Gifting', validity: '30 Days', price: 780, type: 'CG' },
    { name: '3.0 GB Corporate Gifting', validity: '30 Days', price: 1170, type: 'CG' },
    { name: '5.0 GB Corporate Gifting', validity: '30 Days', price: 1950, type: 'CG' },
  ],
};

interface LandingPageProps {
  onAuth: (initialMode?: 'login' | 'signup') => void;
}

export default function LandingPage({ onAuth }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNetworkTab, setActiveNetworkTab] = useState<'mtn' | 'glo' | 'airtel' | '9mobile'>('mtn');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [copiedAccount, setCopiedAccount] = useState(false);

  // Pricing State
  const [livePlans, setLivePlans] = useState<Record<string, Array<{ name: string; validity: string; price: number; type: string }>>>(FALLBACK_PLANS);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);

  // Fetch Live Public Plans (Strictly retail prices, NEVER provider cost prices)
  useEffect(() => {
    let isMounted = true;

    async function loadPublicPlans() {
      try {
        setPlansLoading(true);
        setPlansError(null);

        // 1. Try public view vtu_plans_public or vtu_plans via Supabase
        const { data: sbPlans, error: sbErr } = await supabase
          .from('vtu_plans_public')
          .select('network, plan_name, price_to_user, validity, service')
          .eq('is_active', true)
          .order('price_to_user', { ascending: true });

        if (!sbErr && sbPlans && sbPlans.length > 0) {
          const categorized: Record<string, Array<{ name: string; validity: string; price: number; type: string }>> = {
            mtn: [],
            glo: [],
            airtel: [],
            '9mobile': [],
          };

          for (const p of sbPlans) {
            const netKey = String(p.network || '').toLowerCase().trim();
            const targetKey = netKey.includes('mtn') ? 'mtn' : netKey.includes('glo') ? 'glo' : netKey.includes('airtel') ? 'airtel' : netKey.includes('9mobile') ? '9mobile' : null;
            if (targetKey && categorized[targetKey]) {
              categorized[targetKey].push({
                name: p.plan_name || 'Data Plan',
                validity: p.validity || '30 Days',
                price: Number(p.price_to_user || 0),
                type: p.service || 'Data',
              });
            }
          }

          if (isMounted && Object.values(categorized).some(arr => arr.length > 0)) {
            setLivePlans(categorized);
            setPlansLoading(false);
            return;
          }
        }

        // 2. Fallback to /api/services/data endpoint if view is not yet created
        const apiRes = await fetch('/api/services/data');
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (Array.isArray(apiData) && apiData.length > 0) {
            const categorized: Record<string, Array<{ name: string; validity: string; price: number; type: string }>> = {
              mtn: [],
              glo: [],
              airtel: [],
              '9mobile': [],
            };

            for (const p of apiData) {
              const netKey = String(p.provider_or_network || p.network || '').toLowerCase().trim();
              const targetKey = netKey.includes('mtn') ? 'mtn' : netKey.includes('glo') ? 'glo' : netKey.includes('airtel') ? 'airtel' : netKey.includes('9mobile') ? '9mobile' : null;
              if (targetKey && categorized[targetKey]) {
                categorized[targetKey].push({
                  name: p.item_name || p.name || 'Data Plan',
                  validity: p.validity_days || p.duration || '30 Days',
                  price: Number(p.selling_price || p.price_to_user || 0),
                  type: p.plan_category || 'Data',
                });
              }
            }

            if (isMounted && Object.values(categorized).some(arr => arr.length > 0)) {
              setLivePlans(categorized);
              setPlansLoading(false);
              return;
            }
          }
        }

        // 3. Fallback to default catalog if both network queries return empty
        if (isMounted) {
          setLivePlans(FALLBACK_PLANS);
          setPlansLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setLivePlans(FALLBACK_PLANS);
          setPlansError('Showing standard active catalog while live network synchronization refreshes.');
          setPlansLoading(false);
        }
      }
    }

    loadPublicPlans();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyAccount = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen text-slate-900 overflow-x-hidden font-sans antialiased selection:bg-[#3B7A3B] selection:text-white" style={{ backgroundColor: '#EDEDE9' }}>
      
      {/* ========================================================================= */}
      {/* SECTION 1: NAVIGATION BAR */}
      {/* ========================================================================= */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#EDEDE9]/90 backdrop-blur-md border-b border-[#E2E2DC] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            
            {/* Brand Logo */}
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="flex items-center gap-3 cursor-pointer group"
              aria-label="NORODATA Home"
            >
              <div 
                className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform" 
                style={{ backgroundColor: '#132613' }}
              >
                <span className="text-xl font-black text-[#B5D430]">N</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-black tracking-tight leading-none" style={{ color: '#132613' }}>
                  NORODATA
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B7A3B]">
                  VTU & Digital Utilities
                </span>
              </div>
            </a>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-8">
              <a 
                href="#services" 
                className="text-sm font-semibold text-slate-700 hover:text-[#3B7A3B] transition-colors"
              >
                Services
              </a>
              <a 
                href="#how-it-works" 
                className="text-sm font-semibold text-slate-700 hover:text-[#3B7A3B] transition-colors"
              >
                How It Works
              </a>
              <a 
                href="#pricing" 
                className="text-sm font-semibold text-slate-700 hover:text-[#3B7A3B] transition-colors"
              >
                Live Pricing
              </a>
              <a 
                href="#faq" 
                className="text-sm font-semibold text-slate-700 hover:text-[#3B7A3B] transition-colors"
              >
                FAQ
              </a>
            </div>

            {/* Desktop Auth Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => onAuth('login')}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#132613] hover:bg-slate-200/60 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => onAuth('signup')}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md hover:shadow-lg transition-all"
                style={{ backgroundColor: '#3B7A3B' }}
              >
                Get Started
              </button>
            </div>

            {/* Mobile Hamburger Toggle */}
            <div className="flex md:hidden items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2.5 rounded-xl bg-white/80 border border-[#E2E2DC] text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3B7A3B]"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white border-b border-[#E2E2DC] px-4 pt-3 pb-6 space-y-4 shadow-xl"
            >
              <div className="flex flex-col space-y-3 font-semibold text-slate-800">
                <a
                  href="#services"
                  onClick={closeMobileMenu}
                  className="px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Services
                </a>
                <a
                  href="#how-it-works"
                  onClick={closeMobileMenu}
                  className="px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  How It Works
                </a>
                <a
                  href="#pricing"
                  onClick={closeMobileMenu}
                  className="px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Live Pricing
                </a>
                <a
                  href="#faq"
                  onClick={closeMobileMenu}
                  className="px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  FAQ
                </a>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-col gap-2.5">
                <button
                  onClick={() => { closeMobileMenu(); onAuth('login'); }}
                  className="w-full py-3 rounded-xl text-center text-sm font-bold text-[#132613] bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { closeMobileMenu(); onAuth('signup'); }}
                  className="w-full py-3 rounded-xl text-center text-sm font-bold text-white shadow-md transition-all"
                  style={{ backgroundColor: '#3B7A3B' }}
                >
                  Get Started Free
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ========================================================================= */}
      {/* SECTION 2: HERO */}
      {/* ========================================================================= */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Hero Content */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            
            {/* Trust Pill */}
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white border border-[#E2E2DC] shadow-sm text-xs font-bold text-[#132613]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B5D430] animate-pulse" />
              <span>Instant VTU & Utility Payments Across Nigeria</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1]" style={{ color: '#132613' }}>
              The Fast, Dependable Way to Recharge & Pay Bills in Nigeria.
            </h1>

            {/* Sub-headline */}
            <p className="text-base sm:text-lg text-slate-700 max-w-2xl font-medium leading-relaxed">
              Fund your wallet once and buy discounted data, instant airtime, electricity tokens, cable TV, and eSIMs in seconds with zero delay.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <button
                onClick={() => onAuth('signup')}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl text-base font-black text-white shadow-lg hover:shadow-xl flex items-center justify-center gap-3 transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: '#3B7A3B' }}
              >
                <span>Get Started</span>
                <ArrowRight size={18} />
              </button>
              <a
                href="#services"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl text-base font-bold text-[#132613] bg-white border border-[#E2E2DC] hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
              >
                <span>View Services</span>
                <ChevronDown size={18} />
              </a>
            </div>

            {/* Real Trust Micro-signals */}
            <div className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-6 text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-[#3B7A3B]" /> 99.9% Automated API Uptime
              </span>
              <span className="flex items-center gap-1.5">
                <RotateCcw size={16} className="text-[#3B7A3B]" /> Automated Wallet Refund
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-[#3B7A3B]" /> Monnify Bank Reconciliation
              </span>
            </div>

          </div>

          {/* Right Hero Visual: Mock Wallet Card & Activity Feed */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full max-w-md relative space-y-4">
              
              {/* Virtual Wallet Card */}
              <div 
                className="rounded-3xl p-6 sm:p-7 text-white shadow-2xl relative overflow-hidden border border-emerald-900/40"
                style={{ backgroundColor: '#132613' }}
              >
                {/* Background decorative glow */}
                <div className="absolute top-0 right-0 w-44 h-44 bg-[#3B7A3B]/20 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#B5D430]/10 rounded-full blur-2xl pointer-events-none" />

                <div className="relative z-10 space-y-6">
                  
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                        Virtual Wallet
                      </span>
                      <h4 className="text-xl font-black tracking-tight text-white">NORODATA</h4>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                      <Zap size={18} className="text-[#B5D430]" />
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-300 font-medium block mb-1">Available Balance</span>
                    <div className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-baseline gap-1">
                      <span>₦48,500.00</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Dedicated Virtual Account</span>
                      <span className="font-bold text-white tracking-wide">Sterling Bank • 8234850192</span>
                    </div>
                    <button
                      onClick={() => handleCopyAccount('8234850192')}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5 transition-colors font-medium text-[11px]"
                      aria-label="Copy demo account number"
                    >
                      {copiedAccount ? <Check size={12} className="text-[#B5D430]" /> : <Copy size={12} />}
                      <span>{copiedAccount ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                </div>
              </div>

              {/* Floating Live Transaction Mock Items */}
              <div className="bg-white rounded-2xl p-4 border border-[#E2E2DC] shadow-lg space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">Live Transaction Feed</span>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#3B7A3B]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3B7A3B] animate-ping" /> Instant
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-[11px]">
                        MTN
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 leading-tight">1.0 GB SME Data</p>
                        <p className="text-[10px] text-slate-400">0803 •••• 912</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900">₦400.00</p>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Delivered</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-[11px]">
                        💡
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 leading-tight">Ikeja Electric Prepaid</p>
                        <p className="text-[10px] text-slate-400">Token: 4892 •••• 1042</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900">₦5,000.00</p>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Success</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: TRUST STRIP */}
      {/* ========================================================================= */}
      <section className="py-12 border-y border-[#E2E2DC] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            
            {/* Item 1 */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center flex-shrink-0 border border-emerald-100">
                <Zap size={24} />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-base">Instant Delivery</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Automated telecom API dispatch delivers data and airtime within 3 to 10 seconds.
                </p>
              </div>
            </div>

            {/* Item 2 */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center flex-shrink-0 border border-emerald-100">
                <RotateCcw size={24} />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-base">Wallet Refund on Failure</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  If any network provider drops a request, your funds are reversed to your wallet instantly.
                </p>
              </div>
            </div>

            {/* Item 3 */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center flex-shrink-0 border border-emerald-100">
                <Headphones size={24} />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-base">24/7 Human Support</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Reach real human support desks directly on WhatsApp and Telegram when you need assistance.
                </p>
              </div>
            </div>

            {/* Item 4 */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center flex-shrink-0 border border-emerald-100">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-base">Secure Login</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Protected with Supabase encrypted authentication, secure cookies, and session tokens.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: SERVICES GRID */}
      {/* ========================================================================= */}
      <section id="services" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <span className="text-xs font-black uppercase tracking-wider text-[#3B7A3B] bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-100 inline-block">
            Our Digital Catalog
          </span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight" style={{ color: '#132613' }}>
            Everything You Need, Recharged in Seconds
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Enjoy high discounts and automated delivery across all primary digital utility services in Nigeria.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Card 1: Airtime */}
          <div 
            onClick={() => onAuth('signup')}
            className="bg-white rounded-3xl p-7 border border-[#E2E2DC] shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group hover:-translate-y-1 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Smartphone size={28} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 group-hover:text-[#3B7A3B] transition-colors">
                  Airtime
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  Instant top-ups across MTN, Airtel, Glo, and 9mobile with up to 3% discount on every purchase.
                </p>
              </div>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3B7A3B]">
              <span>Buy Airtime</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 2: Data Bundles */}
          <div 
            onClick={() => onAuth('signup')}
            className="bg-white rounded-3xl p-7 border border-[#E2E2DC] shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group hover:-translate-y-1 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Wifi size={28} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 group-hover:text-[#3B7A3B] transition-colors">
                  Data Bundles
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  Cheap SME, Corporate Gifting & Direct data bundles with instant automated activation and 30-day validity.
                </p>
              </div>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3B7A3B]">
              <span>Purchase Data</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 3: Cable TV */}
          <div 
            onClick={() => onAuth('signup')}
            className="bg-white rounded-3xl p-7 border border-[#E2E2DC] shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group hover:-translate-y-1 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Tv size={28} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 group-hover:text-[#3B7A3B] transition-colors">
                  Cable TV Subscription
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  Renew DStv, GOtv, and StarTimes packages instantly with smartcard account name auto-verification.
                </p>
              </div>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3B7A3B]">
              <span>Renew Subscription</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 4: Electricity Bills */}
          <div 
            onClick={() => onAuth('signup')}
            className="bg-white rounded-3xl p-7 border border-[#E2E2DC] shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group hover:-translate-y-1 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Lightbulb size={28} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 group-hover:text-[#3B7A3B] transition-colors">
                  Electricity Bills
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  Pay prepaid and postpaid meters (IKEDC, EKEDC, AEDC, KEDCO, etc.) and generate tokens instantly.
                </p>
              </div>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3B7A3B]">
              <span>Pay Electric Bill</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 5: Foreign Phone Numbers */}
          <div 
            onClick={() => onAuth('signup')}
            className="bg-white rounded-3xl p-7 border border-[#E2E2DC] shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group hover:-translate-y-1 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center group-hover:scale-110 transition-transform">
                <PhoneCall size={28} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 group-hover:text-[#3B7A3B] transition-colors">
                  Foreign Phone Numbers
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  Acquire clean virtual US, UK, and global phone numbers for SMS OTP verification across top platforms.
                </p>
              </div>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3B7A3B]">
              <span>Get Virtual Number</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 6: eSIM */}
          <div 
            onClick={() => onAuth('signup')}
            className="bg-white rounded-3xl p-7 border border-[#E2E2DC] shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group hover:-translate-y-1 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#3B7A3B] flex items-center justify-center group-hover:scale-110 transition-transform">
                <CreditCard size={28} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 group-hover:text-[#3B7A3B] transition-colors">
                  eSIM
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  Instant digital eSIM profiles with affordable roaming data packages for travelers and dual-SIM smartphones.
                </p>
              </div>
            </div>
            <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3B7A3B]">
              <span>Activate eSIM</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 5: HOW IT WORKS */}
      {/* ========================================================================= */}
      <section id="how-it-works" className="py-24 bg-white border-y border-[#E2E2DC] scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-[#3B7A3B] bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-100 inline-block">
              Three Simple Steps
            </span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight" style={{ color: '#132613' }}>
              How NORODATA Works
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Get started in under one minute with no paperwork or complicated procedures.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            
            {/* Step 1 */}
            <div className="bg-[#EDEDE9]/50 rounded-3xl p-8 border border-[#E2E2DC] relative space-y-4">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg text-white shadow-md"
                style={{ backgroundColor: '#132613' }}
              >
                1
              </div>
              <h3 className="text-xl font-black text-slate-900">Fund Your Wallet</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Sign up in 30 seconds to get your personal automated virtual bank account. Transfer from any Nigerian bank app to credit your wallet in seconds.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-[#EDEDE9]/50 rounded-3xl p-8 border border-[#E2E2DC] relative space-y-4">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg text-white shadow-md"
                style={{ backgroundColor: '#3B7A3B' }}
              >
                2
              </div>
              <h3 className="text-xl font-black text-slate-900">Choose a Service</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Pick your telecom network, internet data bundle, electricity DisCo, cable TV package, or foreign number. Enter the recipient number or meter.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-[#EDEDE9]/50 rounded-3xl p-8 border border-[#E2E2DC] relative space-y-4">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg text-[#132613] shadow-md"
                style={{ backgroundColor: '#B5D430' }}
              >
                3
              </div>
              <h3 className="text-xl font-black text-slate-900">Get Instant Confirmation</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Our backend fulfills your purchase instantly. Your airtime, data, or meter token is delivered immediately and logged in your transaction history.
              </p>
            </div>

          </div>

          <div className="text-center mt-12">
            <button
              onClick={() => onAuth('signup')}
              className="px-8 py-3.5 rounded-2xl text-sm font-black text-white shadow-md hover:shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: '#3B7A3B' }}
            >
              Create Your Account Now
            </button>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 6: PRICING SECTION */}
      {/* ========================================================================= */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <span className="text-xs font-black uppercase tracking-wider text-[#3B7A3B] bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-100 inline-block">
            Transparent Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight" style={{ color: '#132613' }}>
            Live Wholesale Data Rates
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Below are our active retail rates. Prices are live and synchronized with telecom provider servers.
          </p>
          <p className="text-xs text-slate-500 font-semibold italic">
            * Note: Rates are live and may adjust based on network conditions. No hidden charges or extra debit fees.
          </p>
        </div>

        {/* Network Selection Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white p-1.5 rounded-2xl border border-[#E2E2DC] shadow-sm flex flex-wrap gap-1">
            {(['mtn', 'glo', 'airtel', '9mobile'] as const).map((net) => {
              const isActive = activeNetworkTab === net;
              const netNames: Record<string, string> = {
                mtn: 'MTN Data',
                glo: 'GLO Data',
                airtel: 'Airtel Data',
                '9mobile': '9mobile Data',
              };
              return (
                <button
                  key={net}
                  onClick={() => setActiveNetworkTab(net)}
                  className={cn(
                    "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                    isActive
                      ? "bg-[#132613] text-white shadow"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  )}
                >
                  {netNames[net]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error notification banner if any */}
        {plansError && (
          <div className="max-w-2xl mx-auto mb-6 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs text-center font-medium">
            {plansError}
          </div>
        )}

        {/* Plans Display */}
        <div className="max-w-5xl mx-auto">
          {plansLoading ? (
            /* Loading Skeleton */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-6 border border-[#E2E2DC] animate-pulse space-y-4">
                  <div className="h-5 bg-slate-200 rounded w-2/3" />
                  <div className="h-8 bg-slate-200 rounded w-1/2" />
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-10 bg-slate-200 rounded w-full pt-2" />
                </div>
              ))}
            </div>
          ) : (
            /* Live Plan Cards Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(livePlans[activeNetworkTab] || []).length > 0 ? (
                livePlans[activeNetworkTab].map((plan, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl p-6 border border-[#E2E2DC] shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-[#3B7A3B] rounded-md border border-emerald-100">
                          {plan.type || 'Data'}
                        </span>
                        <span className="text-xs text-slate-500 font-semibold">{plan.validity}</span>
                      </div>
                      <h4 className="text-lg font-black text-slate-900 mt-1">{plan.name}</h4>
                      <div className="mt-3 flex items-baseline gap-1">
                        <span className="text-2xl font-black text-[#132613]">
                          ₦{plan.price.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onAuth('signup')}
                      className="mt-6 w-full py-2.5 rounded-xl text-xs font-black text-white transition-opacity hover:opacity-95 shadow-sm"
                      style={{ backgroundColor: '#3B7A3B' }}
                    >
                      Buy This Plan
                    </button>
                  </div>
                ))
              ) : (
                <div className="col-span-full bg-white rounded-2xl p-10 text-center border border-[#E2E2DC]">
                  <HelpCircle size={32} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-bold text-slate-700">No active plans currently listed for this network.</p>
                  <p className="text-xs text-slate-500 mt-1">Please check back shortly or contact support.</p>
                </div>
              )}
            </div>
          )}
        </div>

      </section>

      {/* ========================================================================= */}
      {/* SECTION 7: TESTIMONIALS / SOCIAL PROOF (OWNER PLACEHOLDER) */}
      {/* ========================================================================= */}
      {/* 
        [OWNER INSTRUCTION]:
        This section is a designated placeholder for authentic customer reviews and testimonials.
        Once you collect real verified reviews from active subscribers or resellers, you can plug them
        into this section. Do NOT add fabricated reviews or fake user counts.
      */}
      <section className="py-20 bg-white border-y border-[#E2E2DC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 inline-block">
              Community & Feedback
            </span>
            <h2 className="text-3xl font-black tracking-tight" style={{ color: '#132613' }}>
              Built for Everyday Nigerians & Resellers
            </h2>
            <p className="text-sm text-slate-600">
              We empower students, business center operators, and individual users across the country.
            </p>
          </div>

          {/* Clean Placeholder Cards showing genuine use-cases without fake reviews */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            
            <div className="bg-[#EDEDE9]/40 rounded-2xl p-6 border border-[#E2E2DC] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#3B7A3B] flex items-center justify-center font-bold text-sm">
                🎓
              </div>
              <h4 className="font-bold text-slate-900 text-base">Campus Resellers</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Students and young entrepreneurs leverage NORODATA wholesale rates to resell data bundles to classmates with reliable profit margins.
              </p>
              <div className="pt-2 text-[11px] font-semibold text-[#3B7A3B]">
                • Fast automated dispatch
              </div>
            </div>

            <div className="bg-[#EDEDE9]/40 rounded-2xl p-6 border border-[#E2E2DC] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#3B7A3B] flex items-center justify-center font-bold text-sm">
                🏢
              </div>
              <h4 className="font-bold text-slate-900 text-base">Cyber Cafés & Business Centers</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Small business centers use our unified portal to process instant electricity meter tokens, exam pins, and TV subscriptions for walk-in clients.
              </p>
              <div className="pt-2 text-[11px] font-semibold text-[#3B7A3B]">
                • Instant token generation
              </div>
            </div>

            <div className="bg-[#EDEDE9]/40 rounded-2xl p-6 border border-[#E2E2DC] space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#3B7A3B] flex items-center justify-center font-bold text-sm">
                📱
              </div>
              <h4 className="font-bold text-slate-900 text-base">Individual Smart Users</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Subscribers who want to stop paying regular commercial rates for cellular data and get immediate refunds if a recharge ever fails.
              </p>
              <div className="pt-2 text-[11px] font-semibold text-[#3B7A3B]">
                • 100% automated refund failsafe
              </div>
            </div>

          </div>

          <div className="mt-8 text-center">
            <p className="text-xs text-slate-500 font-medium">
              Want to share your experience or partner with NORODATA? Reach out to our community desk.
            </p>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 8: FAQ ACCORDION */}
      {/* ========================================================================= */}
      <section id="faq" className="py-24 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto scroll-mt-24">
        
        <div className="text-center mb-16 space-y-3">
          <span className="text-xs font-black uppercase tracking-wider text-[#3B7A3B] bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-100 inline-block">
            Frequently Asked Questions
          </span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight" style={{ color: '#132613' }}>
            Got Questions? We’ve Got Answers.
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Clear, honest answers about how funding, fulfillment, and wallet safety work on NORODATA.
          </p>
        </div>

        <div className="space-y-4">
          {[
            {
              q: "How do I fund my wallet?",
              a: "Upon registration, NORODATA automatically provisions a dedicated Nigerian bank account (Sterling Bank / Monnify) linked directly to your wallet. Any bank transfer sent from your mobile banking app or USSD to this account credits your wallet balance automatically within 5 to 10 seconds, 24/7."
            },
            {
              q: "What happens if a purchase fails?",
              a: "Our smart server engine operates an automated failsafe. If a telecom network experiences downtime or rejects a transaction, 100% of your funds are reversed to your NORODATA wallet balance instantly. You never lose your money."
            },
            {
              q: "How long does delivery take?",
              a: "Airtime, data bundles, and electricity meter tokens are pushed directly through active provider APIs and deliver within 3 to 10 seconds of pressing confirm."
            },
            {
              q: "Is my money safe?",
              a: "Yes. All deposits are reconciled through licensed Nigerian financial partners (Monnify and partner banks). We use standard TLS encryption for all data transmissions, and Supabase security policies safeguard your profile."
            },
            {
              q: "How do I get help?",
              a: "You can reach our human support team directly via WhatsApp (+234 814 388 9102 or +234 703 451 9634) or through our official Telegram group. We answer inquiries promptly during active business hours."
            },
            {
              q: "Can I resell data and airtime to make a profit?",
              a: "Yes! NORODATA is built for both personal users and VTU vendors. Because our data and airtime rates are set to wholesale pricing, you can sell to your own clients, classmates, or business center customers at market rates and pocket the margin."
            }
          ].map((item, idx) => {
            const isOpen = openFaqIdx === idx;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-[#E2E2DC] overflow-hidden shadow-sm transition-all"
              >
                <button
                  onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                  className="w-full p-5 sm:p-6 text-left flex justify-between items-center gap-4 focus:outline-none"
                  aria-expanded={isOpen}
                >
                  <span className="font-bold text-slate-900 text-sm sm:text-base">
                    {item.q}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0">
                    <ChevronDown
                      size={18}
                      className={cn("transition-transform duration-200", isOpen && "rotate-180")}
                    />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="px-5 pb-6 sm:px-6 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3"
                    >
                      {item.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

      </section>

      {/* ========================================================================= */}
      {/* SECTION 9: FOOTER */}
      {/* ========================================================================= */}
      <footer className="pt-20 pb-16 text-white border-t border-emerald-950" style={{ backgroundColor: '#132613' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
            
            {/* Col 1 & 2: Brand Info */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#3B7A3B] flex items-center justify-center shadow">
                  <span className="text-lg font-black text-[#B5D430]">N</span>
                </div>
                <span className="text-2xl font-black tracking-tight text-white">NORODATA</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 max-w-sm leading-relaxed">
                Nigeria’s reliable digital recharge and utility payment platform. Instant data bundles, airtime top-ups, electric tokens, and eSIM connectivity.
              </p>
              <div className="pt-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Reconciliation Partner
                </span>
                <span className="text-xs font-semibold text-emerald-300">
                  Powered by Monnify / Sterling Bank
                </span>
              </div>
            </div>

            {/* Col 3: Services */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Services</h4>
              <ul className="space-y-2 text-xs text-slate-400 font-semibold">
                <li><button onClick={() => onAuth('login')} className="hover:text-white transition-colors">Airtime VTU</button></li>
                <li><button onClick={() => onAuth('login')} className="hover:text-white transition-colors">Data Bundles</button></li>
                <li><button onClick={() => onAuth('login')} className="hover:text-white transition-colors">Cable TV Renewals</button></li>
                <li><button onClick={() => onAuth('login')} className="hover:text-white transition-colors">Electricity Bills</button></li>
                <li><button onClick={() => onAuth('login')} className="hover:text-white transition-colors">Foreign Numbers</button></li>
                <li><button onClick={() => onAuth('login')} className="hover:text-white transition-colors">eSIM Profiles</button></li>
              </ul>
            </div>

            {/* Col 4: Quick Links */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Quick Links</h4>
              <ul className="space-y-2 text-xs text-slate-400 font-semibold">
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Live Pricing</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">Help & FAQ</a></li>
                <li><button onClick={() => onAuth('login')} className="hover:text-white transition-colors">Account Login</button></li>
                <li><button onClick={() => onAuth('signup')} className="hover:text-white transition-colors">Create Account</button></li>
              </ul>
            </div>

            {/* Col 5: Support & Contact */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Support Desk</h4>
              <div className="space-y-2 text-xs text-slate-400 font-semibold">
                {SUPPORT_CONTACTS.map((item) => (
                  <a
                    key={item.number}
                    href={`https://wa.me/${item.number}?text=Hello%20NORODATA%20Support,%20I%20need%20assistance%20with...`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 hover:text-[#B5D430] transition-colors"
                  >
                    <MessageCircle size={14} className="text-[#B5D430]" />
                    <span>WhatsApp: +{item.number}</span>
                  </a>
                ))}
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 hover:text-[#B5D430] transition-colors pt-1"
                >
                  <Send size={14} className="text-[#B5D430]" />
                  <span>Telegram Channel</span>
                </a>
              </div>
            </div>

          </div>

          <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-400 font-semibold">
            <p>© {currentYear} NORODATA. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Security</a>
            </div>
          </div>

        </div>
      </footer>

      {/* ========================================================================= */}
      {/* SECTION 10: STICKY MOBILE CTA */}
      {/* ========================================================================= */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-[#E2E2DC] z-40 flex items-center justify-between gap-3 shadow-lg">
        <div className="flex flex-col">
          <span className="text-xs font-black text-slate-900 leading-tight">Instant VTU Top-Up</span>
          <span className="text-[10px] text-slate-500">Fund once, recharge in seconds</span>
        </div>
        <button
          onClick={() => onAuth('signup')}
          className="px-5 py-2.5 rounded-xl text-xs font-black text-white shadow-md"
          style={{ backgroundColor: '#3B7A3B' }}
        >
          Get Started
        </button>
      </div>

    </div>
  );
}
