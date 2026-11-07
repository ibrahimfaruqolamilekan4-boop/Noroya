import React from 'react';
import QRCode from 'react-qr-code';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Smartphone,
  CreditCard,
  History,
  Users,
  Settings,
  Wallet,
  LogOut,
  Bell,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  TrendingUp,
  Zap,
  Phone,
  CheckCircle2,
  AlertCircle,
  Database,
  X,
  Share2,
  Copy,
  Gift,
  Menu,
  ShieldCheck,
  Sun,
  Moon,
  MessageSquare,
  PhoneCall,
  Send,
  Trophy,
  Tv,
  Briefcase,
  Wifi,
  Sparkles,
  Monitor,
  Lightbulb,
  GraduationCap,
  Dices,
  RefreshCw,
  Download,
  Search,
  Filter,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  ShoppingBag,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Scan } from "lucide-react";
import { cn, formatCurrency } from '../lib/utils';
import type { UserProfile, Transaction, ServicePlan, NetworkType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToTransactions, subscribeToServicePlans } from '../lib/firestore';
import { collection, query, onSnapshot, orderBy, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { purchaseAirtime, purchaseDataBundle } from '../lib/recharge';

import { calculateFundingFee } from '../lib/fundingFee';
import { lookupTransferRecipient, executeWalletTransfer } from '../lib/walletApi';
import { normalizeNigerianPhone, isValidNigerianPhone } from '../lib/validation';
import ServicePurchase from './ServicePurchase';
import PayBillsSection from './PayBillsSection';
import AdminPanelSection from './AdminPanelSection';
import ElectricitySection from './ElectricitySection';
import BettingSection from './BettingSection';
import CableTvSection from './CableTvSection';
import ResellerPortal from './ResellerPortal';
import TransactionHistory from './TransactionHistory';
import { MarketplaceHome } from './Marketplace/MarketplaceHome';

// Admin WhatsApp contacts — edit labels/numbers here any time.
const ADMIN_CONTACTS = [
  { label: 'Admin 1', number: '2348143889102' },
  { label: 'Admin 2', number: '2347034519634' },
  { label: 'Admin 3', number: '2349059530817' },
];

// ─── Design tokens (NOROYA redesign) ───────────────────────────────────────
// Background: warm off-white #EDEDE9
// Wallet card: deep forest green #132613
// Brand green: #3B7A3B (buttons, accents)
// CTA yellow-green: #B5D430
// Text: #111111 (near-black)
// Card: white #FFFFFF, shadow-sm
// Border: #E5E5E0
// ───────────────────────────────────────────────────────────────────────────

export default function Dashboard({ user, onLogout }: { user: UserProfile; onLogout: () => void }) {
  const { signOut, setSimulatedUser } = useAuth();
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [showGlobalQR, setShowGlobalQR] = React.useState(false);
  const [defaultBillService, setDefaultBillService] = React.useState<'cable' | 'electricity' | 'exam' | 'betting' | null>(null);

  const setTabAndService = (tab: string, serviceId?: any) => {
    setActiveTab(tab);
    if (tab === 'bills' && serviceId) {
      setDefaultBillService(serviceId);
    } else if (tab !== 'bills') {
      setDefaultBillService(null);
    }
  };

  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [selectedReceiptTx, setSelectedReceiptTx] = React.useState<Transaction | null>(null);
  const [showSupportHub, setShowSupportHub] = React.useState(false);
  const [broadcastAlert, setBroadcastAlert] = React.useState<string | null>(null);


  const downloadQR = (id, filename) => {
    const svg = document.getElementById(id);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width + 40; // padding
      canvas.height = img.height + 40;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 20, 20);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = filename;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  React.useEffect(() => {
    const storedAnn = localStorage.getItem('vtu_latest_announcement');
    if (storedAnn) setBroadcastAlert(storedAnn);
  }, [activeTab]);

  // Auto-logout after 15 minutes
  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const INACTIVITY_TIME = 15 * 60 * 1000;
    const handleAutoLogout = () => {
      toast.error('Logged out automatically due to 15 minutes of inactivity.', { duration: 5000 });
      handleLoggedOut();
    };
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleAutoLogout, INACTIVITY_TIME);
    };
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, []);

  React.useEffect(() => {
    const unsub = subscribeToTransactions(user.uid, (data) => {
      setTransactions(data as Transaction[]);
    });
    return () => unsub();
  }, [user.uid]);

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'marketplace', label: 'Marketplace', icon: <ShoppingBag size={18} /> },
    { id: 'buy-data', label: 'Buy Data', icon: <Smartphone size={18} /> },
    { id: 'buy-airtime', label: 'Buy Airtime', icon: <Zap size={18} /> },
    { id: 'electricity', label: 'Electricity', icon: <Zap size={18} /> },
    { id: 'cable', label: 'Cable TV', icon: <Tv size={18} /> },
    { id: 'betting', label: 'Fund Betting', icon: <Trophy size={18} /> },
    { id: 'bills', label: 'Pay Bills', icon: <CreditCard size={18} /> },
    { id: 'history', label: 'Transactions', icon: <History size={18} /> },
    { id: 'reseller', label: 'Reseller Portal', icon: <Briefcase size={18} /> },
    { id: 'referrals', label: 'Referrals', icon: <Users size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  if (user.role === 'admin') {
    sidebarItems.push({ id: 'admin', label: 'Admin Control', icon: <ShieldCheck size={18} /> });
  }

  const handleLoggedOut = () => {
    signOut();
    onLogout();
  };

  // Page title per tab
  const pageTitles: Record<string, { title: string; sub: string }> = {
    dashboard: { title: `Good morning, ${user.fullName?.split(' ')[0] || 'there'} ✦`, sub: 'Everything you need, in one calm place.' },
    marketplace: { title: 'Digital Marketplace 🛍️', sub: 'Buy & sell foreign numbers (US, UK, Canada) & social media accounts.' },
    'buy-data': { title: 'Buy data', sub: 'Simple, secure and ready when you are.' },
    'buy-airtime': { title: 'Buy airtime', sub: 'Top up instantly across all networks.' },
    electricity: { title: 'Pay electricity', sub: 'Prepaid and postpaid tokens.' },
    cable: { title: 'Renew cable TV', sub: 'DStv, GOtv, StarTimes and more.' },
    betting: { title: 'Fund betting', sub: 'Quick wallet top-up for all platforms.' },
    bills: { title: 'Pay a bill', sub: 'More services in one place.' },
    history: { title: 'View history', sub: 'Receipts & status.' },
    reseller: { title: 'Reseller portal', sub: 'Wholesale pricing for resellers.' },
    referrals: { title: 'Refer & earn', sub: 'Get your referral link.' },
    settings: { title: 'Account settings', sub: 'Manage your profile and security.' },
    admin: { title: 'Admin control', sub: 'Platform management.' },
  };

  const currentPage = pageTitles[activeTab] || pageTitles['dashboard'];

  return (
    <>
    <div className="min-h-screen print:hidden" style={{ backgroundColor: '#EDEDE9', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── Mobile Drawer ────────────────────────────────────────────── */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="absolute top-0 bottom-0 left-0 w-72 flex flex-col bg-white shadow-2xl"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#3B7A3B' }}>
                    <span className="text-white font-black text-sm">N</span>
                  </div>
                  <span className="font-black text-gray-900 tracking-tight">NORODATA</span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500"
                >
                  <X size={16} />
                </button>
              </div>

              <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
                {sidebarItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setTabAndService(item.id); setIsMobileMenuOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all',
                      activeTab === item.id
                        ? 'text-white'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    )}
                    style={activeTab === item.id ? { backgroundColor: '#3B7A3B' } : {}}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="px-3 py-4 border-t border-gray-100 space-y-1">
                {typeof window !== 'undefined' && !(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone) && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      window.dispatchEvent(new CustomEvent('open-pwa-install'));
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all cursor-pointer"
                  >
                    <Download size={18} />
                    Install App
                  </button>
                )}
                <button
                  onClick={handleLoggedOut}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-all"
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ── Desktop Sidebar ──────────────────────────────────────────── */}
      <aside className="hidden md:flex fixed top-0 left-0 bottom-0 w-60 flex-col bg-white border-r border-gray-100 z-40">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#3B7A3B' }}>
            <span className="text-white font-black text-sm">N</span>
          </div>
          <span className="font-black text-gray-900 tracking-tight text-base">NORODATA</span>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTabAndService(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
                activeTab === item.id
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              )}
              style={activeTab === item.id ? { backgroundColor: '#3B7A3B' } : {}}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100 space-y-1">
          {typeof window !== 'undefined' && !(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone) && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-pwa-install'))}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all cursor-pointer"
            >
              <Download size={18} />
              Install App
            </button>
          )}
          <button
            onClick={handleLoggedOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-all cursor-pointer"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="md:ml-60 flex flex-col min-h-screen">

        {/* ── Top header bar ─────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 md:px-8 h-16 flex items-center justify-between">
          {/* Left: hamburger (mobile) + page title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600"
            >
              <Menu size={18} />
            </button>
            {/* Mobile logo */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3B7A3B' }}>
                <span className="text-white font-black text-xs">N</span>
              </div>
              <span className="font-black text-gray-900 text-sm tracking-tight">NORODATA</span>
            </div>
          </div>

          {/* Right: transfer + deposit buttons + profile */}
          <div className="flex items-center gap-2">
            {/* Transfer button */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-transfer-modal'))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:brightness-95 active:scale-95 border"
              style={{ backgroundColor: '#F0F0EC', borderColor: '#D4D4CE', color: '#132613' }}
            >
              <Send size={14} />
              <span>Transfer</span>
            </button>

            <button
              onClick={() => setShowGlobalQR(true)}
              className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all border border-gray-200"
              title="Show my QR Code"
            >
              <Scan size={18} />
            </button>
            {/* Deposit funds button */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-fund-modal'))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:brightness-110 active:scale-95"
              style={{ backgroundColor: '#3B7A3B' }}
            >
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:inline">Deposit funds</span>
              <span className="sm:hidden">Deposit</span>
            </button>
            <button
              onClick={() => setShowGlobalQR(true)}
              className="sm:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 text-gray-700 active:scale-95 border border-gray-200"
            >
              <Scan size={16} />
            </button>

            <div className="hidden sm:flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: '#3B7A3B' }}
              >
                {(user.fullName?.[0] || 'U').toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Broadcast alert */}
        {broadcastAlert && (
          <div className="px-6 py-3 text-white flex justify-between items-center text-sm" style={{ backgroundColor: '#3B7A3B' }}>
            <div className="flex items-center gap-2 font-medium">
              <span>📢</span>
              <span>{broadcastAlert}</span>
            </div>
            <button
              onClick={() => { setBroadcastAlert(null); localStorage.removeItem('vtu_latest_announcement'); }}
              className="p-1 rounded-full bg-white/20 hover:bg-white/30 transition-all"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* ── Page heading ────────────────────────────────────────────── */}
        <div className="px-4 md:px-8 pt-6 pb-2">
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{currentPage.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5 font-medium">{currentPage.sub}</p>
        </div>

        {/* ── Page content ────────────────────────────────────────────── */}
        <main className="flex-1 px-4 md:px-8 py-4 pb-24">
          {activeTab === 'dashboard' && (
            <DashboardOverview
              user={user}
              setTab={setTabAndService}
              transactions={transactions}
              onSelectTx={setSelectedReceiptTx}
            />
          )}
          {activeTab === 'marketplace' && <MarketplaceHome user={user} />}
          {activeTab === 'buy-data' && <ServicePurchase type="data" />}
          {activeTab === 'buy-airtime' && <ServicePurchase type="airtime" />}
          {activeTab === 'electricity' && <ElectricitySection />}
          {activeTab === 'cable' && <CableTvSection />}
          {activeTab === 'betting' && <BettingSection />}
          {activeTab === 'reseller' && <ResellerPortal />}
          {activeTab === 'bills' && <PayBillsSection defaultServiceId={defaultBillService} />}
          {activeTab === 'history' && <TransactionHistory user={user} onSelectTx={setSelectedReceiptTx} />}
          {activeTab === 'referrals' && <ReferralSection user={user} transactions={transactions} />}
          {activeTab === 'settings' && <SettingsSection user={user} />}
          {activeTab === 'admin' && <AdminPanelSection />}
        </main>
      </div>

      {/* ── Floating WhatsApp support button ─────────────────────────── */}
      <div className="fixed right-4 bottom-20 md:bottom-6 z-40 print:hidden">
        <button
          onClick={() => setShowSupportHub(!showSupportHub)}
          className="flex items-center gap-2 px-4 py-3 rounded-2xl text-white font-bold text-sm shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
          style={{ backgroundColor: '#25D366' }}
          title="WhatsApp Support"
        >
          {/* WhatsApp SVG icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.182 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.97C16.528 2.016 14.1 1.01 11.999 1.01c-5.443 0-9.866 4.372-9.87 9.802 0 1.706.469 3.374 1.357 4.886l-.991 3.62 3.76-.98zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
          </svg>
          <span>Support</span>
          {showSupportHub ? <X size={14} /> : null}
        </button>

        <AnimatePresence>
          {showSupportHub && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              className="absolute bottom-16 right-0 w-72 bg-white rounded-2xl border border-gray-100 shadow-2xl p-5 space-y-3"
            >
              <div>
                <h5 className="font-bold text-gray-900 text-sm">NORODATA Help Hub</h5>
                <p className="text-xs text-gray-400 mt-0.5">24/7 support — we reply fast</p>
              </div>
              <div className="space-y-2">
                {ADMIN_CONTACTS.map((admin) => (
                  <a
                    key={admin.number}
                    href={`https://wa.me/${admin.number}?text=Hello%20NORODATA%20Support,%20I%20need%20help%20with...`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl transition-all text-sm font-semibold text-white"
                    style={{ backgroundColor: '#25D366' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.182 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.97C16.528 2.016 14.1 1.01 11.999 1.01c-5.443 0-9.866 4.372-9.87 9.802 0 1.706.469 3.374 1.357 4.886l-.991 3.62 3.76-.98zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                    </svg>
                    WhatsApp — {admin.label}
                  </a>
                ))}
                <a
                  href="https://t.me/NORODATA_data_group"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl transition-all text-sm font-semibold"
                >
                  <Send size={15} /> Telegram channel
                </a>
                <a
                  href="tel:+2348143889102"
                  className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl transition-all text-sm font-semibold"
                >
                  <PhoneCall size={15} /> Call support line
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mobile App Bottom Navigation Dock ───────────────────────── */}
      <nav className="md:hidden fixed bottom-3 left-3 right-3 z-40 bg-[#132613]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl px-2 py-1.5 flex items-center justify-around print:hidden">
        {[
          { id: 'dashboard', label: 'Home', icon: <LayoutDashboard size={19} /> },
          { id: 'buy-data', label: 'Data', icon: <Wifi size={19} /> },
          { id: 'buy-airtime', label: 'Airtime', icon: <Zap size={19} /> },
          { id: 'marketplace', label: 'Market', icon: <ShoppingBag size={19} />, badge: 'HOT' },
          { id: 'history', label: 'History', icon: <History size={19} /> },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={cn(
                'relative flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer',
                isActive ? 'text-[#B5D430]' : 'text-white/70 hover:text-white'
              )}
            >
              <div className="relative">
                {tab.icon}
                {tab.badge && (
                  <span className="absolute -top-1.5 -right-3 text-[9px] font-black bg-rose-500 text-white px-1 py-0.2 rounded-full leading-tight shadow-sm animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={cn('text-[10px] mt-0.5 tracking-tight font-bold', isActive ? 'text-[#B5D430]' : 'text-white/70')}>
                {tab.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="mobile-dock-active"
                  className="absolute -bottom-0.5 w-4 h-0.5 rounded-full bg-[#B5D430]"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── E-Receipt Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedReceiptTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReceiptTx(null)}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5 z-10"
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={24} />
                </div>
                <h4 className="font-black text-gray-900 text-xl">Transaction Receipt</h4>
                <p className="text-xs text-green-600 font-bold uppercase tracking-widest">Approved</p>
              </div>

              <div className="bg-gray-50 rounded-2xl p-5 text-center">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Amount Charged</p>
                <p className="text-3xl font-black text-gray-900 mt-1 tracking-tight">
                  {formatCurrency(selectedReceiptTx.amount)}
                </p>
              </div>

              <div className="space-y-3 text-sm text-gray-700">
                {[
                  { label: 'Transaction ID', val: selectedReceiptTx.reference, mono: true },
                  { label: 'Type', val: selectedReceiptTx.type?.toUpperCase() },
                  { label: 'Description', val: selectedReceiptTx.description },
                  { label: 'Date', val: new Date(selectedReceiptTx.createdAt).toLocaleString() },
                ].map(({ label, val, mono }) => (
                  <div key={label} className="flex justify-between items-start gap-4">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">{label}</span>
                    <span className={cn('font-semibold text-right text-xs', mono && 'font-mono')}>{val}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status</span>
                  <span className="px-2.5 py-1 bg-green-500 text-white rounded-lg text-xs font-bold uppercase">
                    {selectedReceiptTx.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`Receipt ID: ${selectedReceiptTx.reference}\nAmount: ₦${selectedReceiptTx.amount}\nDate: ${new Date(selectedReceiptTx.createdAt).toLocaleString()}\nStatus: SUCCESS`);
                    toast.success('Copied!');
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl py-3 text-sm transition-all"
                >
                  Copy Details
                </button>
                <button
                  onClick={() => window.print()}
                  className="text-white font-bold rounded-xl py-3 text-sm transition-all"
                  style={{ backgroundColor: '#3B7A3B' }}
                >
                  Print Receipt
                </button>
              </div>

              <button
                onClick={() => setSelectedReceiptTx(null)}
                className="w-full text-center text-gray-400 text-xs font-semibold hover:text-gray-600"
              >
                Dismiss
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>

      {/* Global QR Modal */}
      <AnimatePresence>
        {showGlobalQR && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowGlobalQR(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm print:hidden"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-3xl p-6 shadow-2xl z-10 max-w-sm w-full text-center print:hidden"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-gray-900 font-black text-lg">My Profile QR</h3>
                <button onClick={() => setShowGlobalQR(false)} className="p-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                  <X size={16} />
                </button>
              </div>
              
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3 shadow-sm" style={{ backgroundColor: '#3B7A3B' }}>
                {(user.fullName?.[0] || 'U').toUpperCase()}
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">{user.fullName}</h2>
              <p className="text-sm text-gray-500 mb-5 font-medium">Scan to send money or refer</p>

              <div className="bg-white p-4 rounded-2xl inline-block border-2 border-gray-100 shadow-sm mx-auto mb-5">
                <QRCode
                  id="global-qr-code"
                  value={`${window.location.origin}/signup?ref=${user.referralCode}`}
                  size={220}
                  bgColor={"#ffffff"}
                  fgColor={"#132613"}
                  level={"H"}
                />
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/signup?ref=${user.referralCode}`);
                    toast.success('Link copied!');
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-white shadow-md active:scale-95 transition-all text-sm"
                  style={{ backgroundColor: '#3B7A3B' }}
                >
                  Copy Link
                </button>
                <button 
                  onClick={() => downloadQR("global-qr-code", "NORODATA-QR.png")}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200 text-sm"
                >
                  Download PNG
                </button>
              </div>
              <div className="mt-2">
                <button 
                  onClick={() => window.print()}
                  className="w-full py-3 rounded-xl font-bold text-gray-900 bg-white border-2 border-gray-100 hover:border-gray-300 active:scale-95 transition-all flex justify-center items-center gap-2 text-sm"
                >
                  🖨️ Print A4 Flyer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* A4 Printable Flyer (Only visible when printing) */}
      <div className="hidden print:flex fixed inset-0 z-[999999] bg-white w-full h-full flex-col items-center justify-center text-center p-8">
        <div className="w-32 h-32 rounded-[2rem] flex items-center justify-center bg-[#3B7A3B] mb-6 shadow-lg border-4 border-gray-100">
          <span className="text-white font-black text-7xl">N</span>
        </div>
        <h1 className="text-6xl font-black text-gray-900 mb-4 tracking-tighter">NORODATA</h1>
        <h2 className="text-4xl font-bold text-[#3B7A3B] mb-16 tracking-tight">Buy Cheap Data Instantly!</h2>
        
        <div className="p-6 bg-white border-4 border-gray-100 rounded-[2rem] shadow-sm inline-block mb-16">
          <QRCode
            value={`${window.location.origin}/signup?ref=${user.referralCode}`}
            size={400}
            bgColor={"#ffffff"}
            fgColor={"#132613"}
            level={"H"}
          />
        </div>
        
        <p className="text-3xl font-bold text-gray-800 leading-snug">Scan to join & send money to<br/>{user.fullName}</p>
        <p className="text-2xl font-black mt-6 tracking-wide text-[#3B7A3B]">{window.location.origin}</p>
      </div>

    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Dashboard Overview
// ─────────────────────────────────────────────────────────────────
interface ReferralUser {
  uid: string;
  fullName: string;
  email: string;
  createdAt: any;
}

function DashboardOverview({
  user,
  setTab,
  transactions,
  onSelectTx,
}: {
  user: UserProfile;
  setTab: (tab: string, serviceId?: any) => void;
  transactions: Transaction[];
  onSelectTx?: (tx: Transaction) => void;
}) {
  const { setSimulatedUser } = useAuth();
  const [currentBalance, setCurrentBalance] = React.useState(0);
  const [hideBalance, setHideBalance] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);

  // Fund modal state
  const [showFundModal, setShowFundModal] = React.useState(false);
  const [fundingTab, setFundingTab] = React.useState<'gateway' | 'manual'>('gateway');
  const [opayAmount, setOpayAmount] = React.useState('2000');
  const [manualAmount, setManualAmount] = React.useState('');
  const [copiedAccount, setCopiedAccount] = React.useState(false);
  const [fwLoading, setFwLoading] = React.useState(false);

  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = React.useState(false);
  const [transferUid, setTransferUid] = React.useState('');
  const [transferAmount, setTransferAmount] = React.useState('');
  const [transferNote, setTransferNote] = React.useState('');
  const [transferRecipient, setTransferRecipient] = React.useState<any>(null);
  const [transferStep, setTransferStep] = React.useState<'input' | 'confirm'>('input');
  const [transferLoading, setTransferLoading] = React.useState(false);

  React.useEffect(() => {
    setCurrentBalance(user?.wallet_balance || user?.balance || 0);
  }, [user?.wallet_balance, user?.balance]);

  // Listen for fund modal event from header button
  React.useEffect(() => {
    const handler = () => setShowFundModal(true);
    window.addEventListener('open-fund-modal', handler);
    return () => window.removeEventListener('open-fund-modal', handler);
  }, []);

  // Listen for transfer modal event from header button
  React.useEffect(() => {
    const handler = () => setShowTransferModal(true);
    window.addEventListener('open-transfer-modal', handler);
    return () => window.removeEventListener('open-transfer-modal', handler);
  }, []);

  const refreshBalance = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', authUser.id)
      .single();
    if (profile) setCurrentBalance(profile.wallet_balance || 0);
  };

  React.useEffect(() => {
    const userId = (user as any)?.id || user?.uid;
    refreshBalance();
    if (!userId) return;
    const channel = supabase
      .channel('profile-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload: any) => {
          if (payload.new?.wallet_balance !== undefined) setCurrentBalance(payload.new.wallet_balance);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.uid, (user as any)?.id]);

  // Missing Phone Modal state
  const [showAddPhoneModal, setShowAddPhoneModal] = React.useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = React.useState('');
  const [savingPhone, setSavingPhone] = React.useState(false);

  const userPhone = (user as any)?.phone_number || (user as any)?.phoneNumber || '';

  const handleSavePhoneNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeNigerianPhone(newPhoneNumber);
    if (!isValidNigerianPhone(normalized)) {
      toast.error('Please enter a valid 11-digit Nigerian phone number.');
      return;
    }
    setSavingPhone(true);
    try {
      const currentUserId = (user as any)?.id || user?.uid;
      const { data: existing, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone_number', normalized)
        .neq('id', currentUserId)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existing) {
        toast.error('This phone number is already registered to another account.');
        setSavingPhone(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ phone_number: normalized })
        .eq('id', currentUserId);

      if (updateError) throw updateError;

      (user as any).phone_number = normalized;
      toast.success('Phone number added successfully!');
      setShowAddPhoneModal(false);
      setNewPhoneNumber('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save phone number');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleLookupRecipient = async () => {
    if (!userPhone) {
      toast.error('Please add your phone number first before sending a transfer.');
      setShowAddPhoneModal(true);
      return;
    }
    const rawInput = transferUid.trim();
    if (!rawInput) {
      toast.error('Please enter recipient phone number');
      return;
    }
    const normalized = normalizeNigerianPhone(rawInput);
    if (!isValidNigerianPhone(normalized)) {
      toast.error('Please enter a valid Nigerian phone number (11 digits or +234)');
      return;
    }
    setTransferLoading(true);
    try {
      const res = await lookupTransferRecipient(normalized);
      if (!res?.recipient) {
        toast.error('No NORODATA account uses this number.');
        return;
      }
      setTransferRecipient(res.recipient);
      setTransferStep('confirm');
    } catch (err: any) {
      toast.error(err.message || 'No NORODATA account uses this number.');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleConfirmTransfer = async () => {
    const amt = Number(transferAmount);
    if (!amt || amt < 100) {
      toast.error('Minimum transfer amount is ₦100');
      return;
    }
    if (!transferRecipient?.id) {
      toast.error('Please verify recipient first');
      return;
    }
    setTransferLoading(true);
    const transferKey = `txf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    try {
      const res = await executeWalletTransfer({
        recipientId: transferRecipient.id,
        amount: amt,
        transferKey,
        note: transferNote
      });
      if (res.status === 'success') {
        toast.success(`₦${amt.toLocaleString()} sent to ${transferRecipient.display_name}!`);
        setShowTransferModal(false);
        setTransferStep('input');
        setTransferUid('');
        setTransferAmount('');
        setTransferNote('');
        setTransferRecipient(null);
        refreshBalance();
      } else if (res.status === 'insufficient_funds') {
        toast.error('Insufficient wallet balance to cover amount and ₦10 fee.');
      } else {
        toast.error(res.error || 'Transfer failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Transfer failed');
    } finally {
      setTransferLoading(false);
    }
  };

  // Bachs.io Gateway & Virtual Account state
  const [bachsVirtualAccount, setBachsVirtualAccount] = React.useState<{
    id?: string;
    account_number: string;
    account_name?: string | null;
    bank_name: string;
    bank_code?: string | null;
    currency: string;
    status: string;
  } | null>(null);
  const [loadingVirtualAccount, setLoadingVirtualAccount] = React.useState(false);
  const [bachsConfigStatus, setBachsConfigStatus] = React.useState<{
    configured: boolean;
    webhookConfigured: boolean;
    mode?: string;
  } | null>(null);

  const loadBachsVirtualAccount = React.useCallback(async () => {
    setLoadingVirtualAccount(true);
    try {
      const [cfgRes, vaRes] = await Promise.all([
        fetch('/api/payments/bachs/config').catch(() => null),
        fetch('/api/payments/bachs/virtual-account').catch(() => null),
      ]);
      if (cfgRes && cfgRes.ok) {
        const cfgData = await cfgRes.json();
        setBachsConfigStatus({
          configured: Boolean(cfgData.configured),
          webhookConfigured: Boolean(cfgData.webhookConfigured),
          mode: cfgData.mode,
        });
      }
      if (vaRes && vaRes.ok) {
        const vaData = await vaRes.json();
        if (vaData?.available && vaData?.virtualAccount?.account_number) {
          setBachsVirtualAccount(vaData.virtualAccount);
        }
      }
    } catch (_) {
      // Silent fallback if not configured yet
    } finally {
      setLoadingVirtualAccount(false);
    }
  }, []);

  React.useEffect(() => {
    loadBachsVirtualAccount();
  }, [loadBachsVirtualAccount]);

  React.useEffect(() => {
    if (showFundModal) {
      loadBachsVirtualAccount();
    }
  }, [showFundModal, loadBachsVirtualAccount]);

  // Automatically verify Bachs.io Checkout redirect return (`?bachs_verify=1&reference=...&checkout_id=...`)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isVerify = params.get('bachs_verify');
    const isCancelled = params.get('bachs_cancelled');
    const reference = params.get('reference') || '';
    const checkoutId = params.get('checkout_id') || params.get('session_id') || localStorage.getItem('noroya_pending_bachs_checkout_id') || '';
    const chargeId = params.get('charge_id') || params.get('payment_id') || '';

    if (isCancelled) {
      toast('Bachs.io checkout was cancelled.', { icon: 'ℹ️' });
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      return;
    }

    if (isVerify && (checkoutId || chargeId || reference)) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      (async () => {
        const toastId = toast.loading('Verifying your Bachs.io payment…');
        try {
          const resp = await fetch('/api/payments/bachs/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              checkout_id: checkoutId || undefined,
              charge_id: chargeId || undefined,
              reference: reference || undefined,
            }),
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok && data.verified) {
            localStorage.removeItem('noroya_pending_bachs_checkout_id');
            toast.success(data.message || `Wallet credited via Bachs.io!`, { id: toastId, duration: 7000 });
            refreshBalance();
          } else {
            toast(data.message || data.error || 'Payment is being confirmed via Bachs.io webhook.', {
              id: toastId,
              icon: '⏳',
              duration: 6000,
            });
            setTimeout(refreshBalance, 2500);
          }
        } catch (err: any) {
          toast.error(err.message || 'Could not verify payment status.', { id: toastId });
        }
      })();
    }
  }, []);

  const handleBachsFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(opayAmount);
    if (!amt || isNaN(amt) || amt < 100) {
      toast.error('Minimum deposit amount on Bachs.io is ₦100');
      return;
    }
    setFwLoading(true);
    try {
      const resp = await fetch('/api/payments/bachs/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          email: user.email,
          name: user.full_name || (user as any).fullName || user.name || 'Customer',
          phone: (user as any).phone_number || (user as any).phoneNumber || '',
          userId: (user as any).id || user.uid,
          redirectUrl: window.location.origin,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.checkout_url) {
        throw new Error(data?.error || 'Could not initialize Bachs.io checkout session.');
      }
      if (data.checkout_id) {
        localStorage.setItem('noroya_pending_bachs_checkout_id', String(data.checkout_id));
      }
      toast.success('Redirecting to Bachs.io secure checkout…');
      window.location.href = data.checkout_url;
    } catch (err: any) {
      toast.error(err.message || 'Bachs.io checkout failed to initialize.');
      setFwLoading(false);
    }
  };

  // Quick service grid
  const quickServices = [
    { id: 'marketplace', icon: '🛍️', label: 'Marketplace', sub: 'Numbers & accounts', color: '#EAF8ED' },
    { id: 'buy-data', icon: '📶', label: 'Buy data', sub: 'From ₦50', color: '#E8F0E8' },
    { id: 'buy-airtime', icon: '⚡', label: 'Buy airtime', sub: 'All networks', color: '#E8ECFF' },
    { id: 'electricity', icon: '🔆', label: 'Pay electricity', sub: 'Instant delivery', color: '#FFF4E0' },
    { id: 'cable', icon: '📺', label: 'Renew cable TV', sub: 'Keep watching', color: '#F0E8FF' },
    { id: 'betting', icon: '🎯', label: 'Fund betting', sub: 'Quick top-up', color: '#FFF0E8' },
    { id: 'bills', icon: '📋', label: 'Pay a bill', sub: 'More services', color: '#E8F4FF' },
    { id: 'history', icon: '↗', label: 'View history', sub: 'Receipts & status', color: '#F4F4F4' },
    { id: 'referrals', icon: '🌿', label: 'Refer & earn', sub: 'Get your link', color: '#E8F5E8' },
  ];

  // Compute spend this month from transactions
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const spendThisMonth = transactions
    .filter((tx) => tx.type !== 'funding' && new Date(tx.createdAt) >= monthStart)
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);

  // Dynamic spend over the last 7 days from transactions
  const last7DaysSpend = React.useMemo(() => {
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });
    const totals = days.map((dayDate) => {
      const nextDay = new Date(dayDate);
      nextDay.setDate(nextDay.getDate() + 1);
      return transactions
        .filter((tx) => {
          if (tx.type === 'funding') return false;
          const txDate = new Date(tx.createdAt);
          return txDate >= dayDate && txDate < nextDay;
        })
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    });
    const maxSpend = Math.max(...totals, 1);
    return totals.map((val) => Math.max(15, Math.round((val / maxSpend) * 100)));
  }, [transactions]);

  return (
    <div className="space-y-5 max-w-2xl mx-auto md:max-w-none">

      {/* ── Dashboard Greeting & Verification Status ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#132613] text-[#B5D430] border border-[#B5D430]/30 inline-flex items-center gap-1.5 shadow-sm">
              <Sparkles size={11} className="text-[#B5D430]" />
              {user.role === 'admin' ? 'Super Admin' : user.role === 'reseller' ? 'Wholesale Reseller' : 'Verified Subscriber'}
            </span>
            <span className="text-xs text-gray-500 font-semibold">Tier 1 Account</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
            Welcome back, {user.full_name?.split(' ')[0] || (user as any)?.name?.split(' ')[0] || 'Subscriber'} 👋
          </h2>
        </div>
      </div>

      {/* ── Live Telco Network Health Indicator Ticker ── */}
      <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-sm flex items-center gap-3 overflow-x-auto text-xs no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0 font-bold text-gray-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Telco Health:</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-950 font-black border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            MTN: 99.9% ⚡
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-50 text-rose-950 font-black border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Airtel: Fast ⚡
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-950 font-black border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Glo: Active ⚡
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-lime-50 text-lime-950 font-black border border-lime-300">
            <span className="w-2 h-2 rounded-full bg-lime-600" />
            9mobile: Active ⚡
          </span>
        </div>
        <span className="ml-auto text-[11px] text-gray-400 font-medium shrink-0 hidden sm:inline">
          Live Status
        </span>
      </div>

      {/* ── Missing Phone Banner (ITEM 3) ── */}
      {(!user?.phone_number && !(user as any)?.phoneNumber) && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <Phone size={20} />
            </div>
            <div>
              <p className="text-sm font-black text-amber-900">Add your phone number to enable wallet transfers</p>
              <p className="text-xs text-amber-700">A Nigerian phone number is required on your profile before sending wallet funds to other users.</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddPhoneModal(true)}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-sm shrink-0 active:scale-95 cursor-pointer"
          >
            Add Phone Number
          </button>
        </div>
      )}

      {/* ── Wallet card ───────────────────────────────────────────── */}
      <div
        className="relative rounded-3xl p-6 overflow-hidden"
        style={{ backgroundColor: '#132613' }}
      >
        {/* Decorative circle */}
        <div
          className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-20 pointer-events-none"
          style={{ backgroundColor: '#3B7A3B' }}
        />
        <div
          className="absolute -bottom-8 -right-4 w-32 h-32 rounded-full opacity-10 pointer-events-none"
          style={{ backgroundColor: '#6AAF6A' }}
        />

        <div className="relative z-10">
          {/* Label row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#8FB88F' }}>
                AVAILABLE WALLET BALANCE
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </div>
            <button
              onClick={() => setHideBalance(!hideBalance)}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            >
              {hideBalance ? <EyeOff size={14} className="text-white" /> : <Eye size={14} className="text-white" />}
            </button>
          </div>

          {/* Balance */}
          <div className="mb-1">
            <span className="text-4xl md:text-5xl font-black text-white tracking-tight font-mono">
              {hideBalance ? '••••••' : formatCurrency(currentBalance)}
            </span>
            {isUpdating && <span className="text-xs text-green-400 ml-2 animate-pulse">Syncing…</span>}
          </div>
          <p className="text-xs mb-5" style={{ color: '#8FB88F' }}>
            Wallet is active · Updated just now
          </p>

          {/* Bottom row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs mb-0.5" style={{ color: '#8FB88F' }}>This month</p>
              <p className="text-sm font-bold" style={{ color: '#B5D430' }}>
                +{formatCurrency(spendThisMonth > 0 ? spendThisMonth : 0)} funded
              </p>
            </div>
            <button
              onClick={() => setShowFundModal(true)}
              className="px-5 py-2.5 rounded-2xl text-sm font-bold transition-all hover:brightness-110 active:scale-95 cursor-pointer"
              style={{ backgroundColor: '#B5D430', color: '#132613' }}
            >
              Deposit money →
            </button>
          </div>
        </div>
      </div>

      {/* ── 1-Tap Dedicated Virtual Account Card ── */}
      {bachsVirtualAccount ? (
        <div
          className="rounded-3xl p-5 border shadow-lg relative overflow-hidden transition-all hover:shadow-xl"
          style={{ backgroundColor: '#132613', borderColor: 'rgba(181, 212, 48, 0.25)' }}
        >
          <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-[#B5D430]/10 blur-2xl pointer-events-none" />

          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-black uppercase tracking-wider text-[#B5D430]">
                  1-Tap Dedicated Virtual Account
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-white/10 text-white/90">
                {bachsVirtualAccount.status || 'Active'}
              </span>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-0.5">
                  {bachsVirtualAccount.bank_name || 'Bank Transfer'}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl md:text-3xl font-black font-mono tracking-wider text-white">
                    {bachsVirtualAccount.account_number}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(bachsVirtualAccount.account_number);
                      setCopiedAccount(true);
                      toast.success('Virtual account copied!');
                      setTimeout(() => setCopiedAccount(false), 2000);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    style={{
                      backgroundColor: copiedAccount ? '#B5D430' : 'rgba(255,255,255,0.15)',
                      color: copiedAccount ? '#132613' : '#FFFFFF',
                    }}
                  >
                    {copiedAccount ? (
                      <>
                        <CheckCircle2 size={13} />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                {bachsVirtualAccount.account_name && (
                  <p className="text-xs text-white/80 font-medium mt-1">
                    {bachsVirtualAccount.account_name}
                  </p>
                )}
              </div>

              <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-white/10">
                <p className="text-[11px] text-[#8FB88F]">Auto-credited in &lt; 60s</p>
                <button
                  type="button"
                  onClick={() => setShowFundModal(true)}
                  className="mt-1 text-xs font-bold text-[#B5D430] hover:underline flex items-center gap-1 sm:justify-end cursor-pointer"
                >
                  <span>More deposit options</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-white/60">
              Transfer to this dedicated account from Kuda, OPay, Palmpay, GTBank, Zenith or any banking app. Your wallet balance updates automatically with zero delay.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800 shrink-0 font-bold">
              ⚡
            </div>
            <div>
              <p className="text-sm font-black text-emerald-950">Automated Instant Top-up</p>
              <p className="text-xs text-emerald-700">Fund your wallet automatically via Card or Bank Transfer on Bachs.io.</p>
            </div>
          </div>
          <button
            onClick={() => setShowFundModal(true)}
            className="px-4 py-2 bg-[#132613] hover:bg-[#1a381a] text-[#B5D430] text-xs font-black rounded-xl transition shadow-sm shrink-0 active:scale-95 cursor-pointer"
          >
            Deposit Funds Now →
          </button>
        </div>
      )}

      {/* ── Spend + Month summary row ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Spend card */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">SPEND THIS MONTH</p>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-black text-gray-900">{formatCurrency(spendThisMonth)}</span>
            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Live</span>
          </div>
          {/* Dynamic 7-day mini bar chart */}
          <div className="flex items-end gap-1.5 h-10">
            {last7DaysSpend.map((h, i) => (
              <div
                key={i}
                style={{ height: `${h}%`, backgroundColor: i === 6 ? '#3B7A3B' : '#D4E8D4' }}
                className="flex-1 rounded-t transition-all duration-300"
                title={`Day ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Month in NORODATA */}
        <div className="bg-green-50 rounded-2xl p-5 border border-green-100 flex flex-col justify-between">
          <div>
            <p className="text-xs font-black text-gray-900 uppercase tracking-widest mb-1">YOUR MONTH IN NORODATA</p>
            <p className="text-sm text-gray-600 font-medium mt-1">
              {transactions.length} successful transactions. Every action updates your wallet and ledger.
            </p>
          </div>
          <button
            onClick={() => setTab('history')}
            className="mt-3 text-xs font-bold self-end cursor-pointer"
            style={{ color: '#3B7A3B' }}
          >
            See your activity →
          </button>
        </div>
      </div>

      {/* ── Trending in Marketplace Hot Deals Banner ── */}
      <div className="relative rounded-2xl p-4 bg-gradient-to-r from-[#132613] via-[#1a381a] to-[#132613] text-white border border-[#B5D430]/20 shadow-md overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#B5D430] text-[#132613]">
              Trending Now 🔥
            </span>
            <span className="text-xs text-emerald-200 font-semibold">Foreign Numbers & eSIM Desk</span>
          </div>
          <p className="text-sm font-bold text-white">
            USA (+1), UK (+44) & Canada Numbers for WhatsApp & Telegram verification
          </p>
          <p className="text-xs text-white/70">
            Instant automated OTP delivery · 100% verified non-VoIP routes
          </p>
        </div>
        <button
          onClick={() => setTab('marketplace')}
          className="relative z-10 px-4 py-2.5 rounded-xl text-xs font-black transition-all hover:scale-105 active:scale-95 shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
          style={{ backgroundColor: '#B5D430', color: '#132613' }}
        >
          <span>Explore Marketplace</span>
          <ArrowUpRight size={14} />
        </button>
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-[#B5D430]/10 blur-xl pointer-events-none" />
      </div>

      {/* ── Quick actions grid ────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-black text-gray-900 mb-3">Start something</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickServices.map((svc) => (
            <button
              key={svc.id}
              onClick={() => setTab(svc.id)}
              className="bg-white hover:bg-gray-50 rounded-2xl p-4 border border-gray-100 shadow-sm text-left transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-98 group"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-lg"
                style={{ backgroundColor: svc.color }}
              >
                {svc.icon}
              </div>
              <p className="font-bold text-gray-900 text-sm">{svc.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{svc.sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Recent activity ───────────────────────────────────────── */}
      <SupabaseTransactionHistoryWidget user={user} onSelectTx={onSelectTx} setTab={setTab} />

      {/* ── Fund Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFundModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowFundModal(false)}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden z-10"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E8F5E8' }}>
                    <Wallet size={18} style={{ color: '#3B7A3B' }} />
                  </div>
                  <h4 className="font-black text-gray-900 text-lg">Deposit Funds</h4>
                </div>
                <button onClick={() => setShowFundModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <X size={16} />
                </button>
              </div>

              {/* Tabs: Bachs Payment & Manual Payment */}
              <div className="flex p-1.5 mx-4 mt-4 bg-gray-100 rounded-2xl gap-1">
                {(['gateway', 'manual'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFundingTab(t)}
                    className={cn(
                      'flex-1 py-2.5 px-3 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                      fundingTab === t
                        ? 'bg-white shadow-sm text-gray-900 border border-gray-200/60'
                        : 'text-gray-500 hover:text-gray-800'
                    )}
                  >
                    {t === 'gateway' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span>Bachs Payment</span>
                      </>
                    ) : (
                      <>
                        <Wallet size={13} className="shrink-0 text-amber-600" />
                        <span>Manual Payment</span>
                      </>
                    )}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {fundingTab === 'gateway' && (
                  <form onSubmit={handleBachsFundSubmit} className="space-y-4">
                    <div className="rounded-2xl p-4 bg-emerald-50/70 border border-emerald-200 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-950 uppercase tracking-wider">Bachs.io Payment Gateway</span>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                          bachsConfigStatus?.configured ? "bg-emerald-200 text-emerald-900" : "bg-amber-200 text-amber-900"
                        )}>
                          {!bachsConfigStatus ? "Connecting..." : !bachsConfigStatus.configured ? "Key Pending" : bachsConfigStatus.mode === 'sandbox' ? 'Sandbox' : 'Live NGN'}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800">
                        Pay securely via Card or Instant Bank Transfer on Bachs.io. Your wallet is credited automatically once payment succeeds.
                      </p>
                      {bachsConfigStatus && !bachsConfigStatus.configured && (
                        <p className="text-[11px] text-amber-800 bg-amber-100/80 rounded-lg p-2 font-medium">
                          ⚠️ Bachs.io secret key is not set yet. Please paste your <code>sk_live_...</code> or <code>sk_sandbox_...</code> in the Admin Panel (Bachs.io Gateway tab) or your Vercel Environment Variables.
                        </p>
                      )}
                    </div>

                    {/* Live Bachs.io Virtual Account (if active on merchant account) */}
                    {bachsVirtualAccount && (
                      <div className="bg-emerald-900 text-white rounded-xl p-4 space-y-2 border border-emerald-700">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                            ⚡ Instant Automated Virtual Account (Bachs.io)
                          </span>
                          <span className="text-[10px] bg-emerald-700 text-emerald-100 px-2 py-0.5 rounded-full font-bold uppercase">
                            {bachsVirtualAccount.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <div>
                            <p className="text-xs text-emerald-200">{bachsVirtualAccount.bank_name}</p>
                            <p className="font-mono text-lg font-black tracking-wider">{bachsVirtualAccount.account_number}</p>
                            {bachsVirtualAccount.account_name && (
                              <p className="text-xs text-emerald-100 font-semibold">{bachsVirtualAccount.account_name}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(bachsVirtualAccount.account_number);
                              toast.success('Bachs Virtual Account copied!');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-bold transition cursor-pointer"
                          >
                            Copy
                          </button>
                        </div>
                        <p className="text-[11px] text-emerald-200/90">
                          Include your email ({user.email}) in the transfer narration for automatic instant wallet credit.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Amount (₦)</label>
                      <input
                        type="number" required min={100} value={opayAmount}
                        onChange={(e) => setOpayAmount(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 2000"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-green-500 text-lg"
                      />
                      <div className="flex gap-2 mt-2">
                        {['500', '1000', '2000', '5000', '10000'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setOpayAmount(preset)}
                            className="flex-1 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 transition cursor-pointer"
                          >
                            ₦{Number(preset).toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ITEM 1: FEE BREAKDOWN */}
                    {(() => {
                      const num = Number(opayAmount) || 0;
                      if (num < 100) return null;
                      try {
                        const feeBreakdown = calculateFundingFee(num);
                        const noroMargin = Number(feeBreakdown.norodataFee ?? feeBreakdown.margin ?? (num >= 5000 ? 50 : 30));
                        const gwFee = Number(feeBreakdown.gatewayFee ?? 0);
                        const tot = Number(feeBreakdown.totalCharged ?? (num + noroMargin + gwFee));
                        return (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2 text-xs">
                            <div className="flex justify-between text-gray-600">
                              <span>Amount</span>
                              <span className="font-semibold">₦{Number(feeBreakdown.amount || num).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                              <span>NORODATA fee</span>
                              <span className="font-semibold">₦{noroMargin.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                              <span>Gateway fee</span>
                              <span className="font-semibold">₦{gwFee.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm font-black text-gray-900 border-t pt-2 border-gray-200">
                              <span>Total</span>
                              <span style={{ color: '#3B7A3B' }}>₦{tot.toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      } catch (_) {
                        return null;
                      }
                    })()}

                    <button
                      type="submit"
                      disabled={fwLoading || !opayAmount || Number(opayAmount) < 100}
                      className="w-full text-white font-bold rounded-xl py-3.5 transition-all disabled:opacity-50 cursor-pointer"
                      style={{ backgroundColor: '#3B7A3B' }}
                    >
                      {fwLoading
                        ? 'Initializing Bachs.io Checkout…'
                        : `Pay ₦${(Number(opayAmount) >= 100 ? (calculateFundingFee(Number(opayAmount)).totalCharged || Number(opayAmount)) : Number(opayAmount || 0)).toLocaleString()} via Bachs.io`}
                    </button>
                  </form>
                )}

                {fundingTab === 'manual' && (
                  <div className="space-y-4">
                    {/* Manual Bank Details Card */}
                    <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold text-sm">
                          🏦
                        </div>
                        <div>
                          <p className="text-xs font-black text-amber-950 uppercase tracking-wider">Manual Deposit Account</p>
                          <p className="text-[11px] text-amber-800">Transfer directly to our verified OPay business account</p>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl p-3 space-y-2.5 border border-amber-100 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-bold uppercase text-[10px]">Bank</span>
                          <span className="font-extrabold text-gray-900">OPay</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-gray-50 pt-2">
                          <span className="text-gray-400 font-bold uppercase text-[10px]">Account No.</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-gray-900 text-sm">8143889102</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText('8143889102');
                                setCopiedAccount(true);
                                toast.success('Account number copied!');
                                setTimeout(() => setCopiedAccount(false), 2000);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded font-bold transition-all bg-amber-100 text-amber-900 hover:bg-amber-200 cursor-pointer"
                            >
                              {copiedAccount ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between border-t border-gray-50 pt-2">
                          <span className="text-gray-400 font-bold uppercase text-[10px]">Account Name</span>
                          <span className="font-bold text-gray-800 text-[11px]">Ibrahim Faruq OLAMILEKAN</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-amber-900/80 bg-white/60 rounded-xl p-2.5 space-y-1">
                        <p className="font-bold">Instructions:</p>
                        <ol className="list-decimal list-inside space-y-0.5">
                          <li>Transfer to the OPay account above</li>
                          <li>Take a screenshot of payment receipt</li>
                          <li>Click below to notify admin on WhatsApp</li>
                        </ol>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Amount Transferred (₦)</label>
                      <input
                        type="number" value={manualAmount}
                        onChange={(e) => setManualAmount(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 5000"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-green-500 text-lg"
                      />
                    </div>

                    {/* WhatsApp Admin Confirmation Button */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Send Proof to Admin</p>
                      {ADMIN_CONTACTS.map((admin) => (
                        <a
                          key={admin.number}
                          href={`https://wa.me/${admin.number}?text=Hello%20NORODATA%20Admin,%20I%20have%20sent%20a%20manual%20transfer%20of%20₦${manualAmount || '0'}%20to%20OPay%208143889102.%20My%20email%20is%20${encodeURIComponent(user.email || '')}.%20Please%20find%20attached%20payment%20proof.`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white text-xs font-bold transition-all hover:brightness-110 active:scale-95"
                          style={{ backgroundColor: '#25D366' }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.182 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.97C16.528 2.016 14.1 1.01 11.999 1.01c-5.443 0-9.866 4.372-9.87 9.802 0 1.706.469 3.374 1.357 4.886l-.991 3.62 3.76-.98zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                          </svg>
                          WhatsApp — {admin.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Transfer Modal (ITEM 3) ────────────────────────────────── */}
      <AnimatePresence>
        {showTransferModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setShowTransferModal(false); setTransferStep('input'); }}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5 z-10"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-black text-gray-900 text-xl">Send Money</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Wallet-to-wallet transfer by phone number</p>
                </div>
                <button onClick={() => { setShowTransferModal(false); setTransferStep('input'); }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <X size={16} />
                </button>
              </div>

              {transferStep === 'input' && (
                <div className="space-y-5">
                  <div>
                    <label className="text-xs font-black text-gray-900 uppercase tracking-wider block mb-1.5">Recipient Phone Number</label>
                    <input
                      type="tel"
                      value={transferUid}
                      onChange={(e) => setTransferUid(e.target.value)}
                      placeholder="e.g. 08012345678 or +234..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:border-green-500 transition-all placeholder:font-normal placeholder:text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1.5">
                      Enter the recipient's registered Nigerian phone number.
                    </p>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Amount (₦)</label>
                    <input
                      type="number"
                      min={100}
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="Min ₦100"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 text-lg focus:outline-none focus:border-green-500 transition-all"
                    />
                    <div className="flex justify-between items-center mt-1.5 text-xs text-gray-500">
                      <span>Minimum transfer: ₦100</span>
                      <span className="font-semibold text-gray-700">Fee: ₦10</span>
                    </div>
                  </div>

                  {/* Note */}
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Note (optional)</label>
                    <input
                      type="text"
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                      placeholder="What's this for?"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-semibold text-gray-900 focus:outline-none focus:border-green-500 transition-all"
                    />
                  </div>

                  <button
                    onClick={handleLookupRecipient}
                    disabled={transferLoading || !transferUid || !transferAmount || Number(transferAmount) < 100}
                    className="w-full text-white font-bold rounded-xl py-3.5 disabled:opacity-50 transition-all cursor-pointer"
                    style={{ backgroundColor: '#3B7A3B' }}
                  >
                    {transferLoading ? 'Verifying recipient…' : 'Verify'}
                  </button>
                </div>
              )}

              {transferStep === 'confirm' && transferRecipient && (
                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 space-y-3">
                    <p className="text-xs text-gray-400 font-bold uppercase">Send to:</p>
                    <p className="font-black text-gray-900 text-xl">{transferRecipient.display_name}</p>
                    {transferNote && <p className="text-sm text-gray-600 italic">"{transferNote}"</p>}
                    <div className="pt-3 border-t border-gray-200 space-y-2 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>Transfer Amount</span>
                        <span className="font-semibold">₦{Number(transferAmount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Transfer Fee</span>
                        <span className="font-semibold">₦10</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-gray-200 text-base font-black">
                        <span className="text-gray-900">Total Debit</span>
                        <span style={{ color: '#3B7A3B' }}>₦{(Number(transferAmount) + 10).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setTransferStep('input')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl py-3.5 transition-all">
                      Back
                    </button>
                    <button onClick={handleConfirmTransfer} disabled={transferLoading} className="text-white font-bold rounded-xl py-3.5 disabled:opacity-50 transition-all cursor-pointer" style={{ backgroundColor: '#3B7A3B' }}>
                      {transferLoading ? 'Sending…' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Add Phone Number Modal (ITEM 3) ── */}
      <AnimatePresence>
        {showAddPhoneModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddPhoneModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4 z-10"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-black text-gray-900 text-lg">Add Phone Number</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Required for peer-to-peer wallet transfers</p>
                </div>
                <button onClick={() => setShowAddPhoneModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSavePhoneNumber} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Nigerian Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={newPhoneNumber}
                    onChange={(e) => setNewPhoneNumber(e.target.value)}
                    placeholder="e.g. 08012345678 or +234..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-green-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Accepts 11 digits starting with 0 or +234</p>
                </div>
                <button
                  type="submit"
                  disabled={savingPhone || !newPhoneNumber}
                  className="w-full text-white font-bold rounded-xl py-3.5 disabled:opacity-50 transition-all cursor-pointer"
                  style={{ backgroundColor: '#3B7A3B' }}
                >
                  {savingPhone ? 'Saving...' : 'Save Phone Number'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Supabase Transaction Widget (Recent Activity)
// ─────────────────────────────────────────────────────────────────
function SupabaseTransactionHistoryWidget({
  user,
  onSelectTx,
  setTab,
}: {
  user: UserProfile;
  onSelectTx?: (tx: Transaction) => void;
  setTab: (tab: string) => void;
}) {
  const [txs, setTxs] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const userId = user?.uid || (user as any)?.id;
    if (!userId) { setLoading(false); return; }
    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (!error && data) {
          setTxs(data.map((row: any) => ({
            ...row,
            userId: row.user_id || row.userId,
            createdAt: row.created_at || row.createdAt,
          })));
        }
        setLoading(false);
      });
  }, [user]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-black text-gray-900">Recent activity</h2>
        <button
          onClick={() => setTab('history')}
          className="text-sm font-semibold transition-all"
          style={{ color: '#3B7A3B' }}
        >
          View all →
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2" style={{ borderColor: '#3B7A3B', borderTopColor: 'transparent' }} />
          <p className="text-xs text-gray-400 font-medium">Loading transactions…</p>
        </div>
      ) : txs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-400 font-medium">No transactions yet. Make your first purchase!</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {txs.map((tx, idx) => {
            const isFunding = tx.type === 'funding';
            const status = (tx.status || 'success').toLowerCase();
            const isSuccess = status === 'success' || status === 'completed' || status === 'successful';
            const isPending = status === 'pending';

            return (
              <div
                key={tx.id || idx}
                onClick={() => onSelectTx?.(tx)}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-50 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm shrink-0"
                    style={{ backgroundColor: isSuccess ? '#3B7A3B' : isPending ? '#D4973B' : '#C0392B' }}
                  >
                    {isSuccess ? <CheckCircle2 size={16} /> : isPending ? <Clock size={16} /> : <AlertCircle size={16} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                      {tx.description || tx.type || 'Transaction'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'Recent'}
                      {tx.reference && ` · ${tx.reference.slice(0, 12)}…`}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('text-sm font-bold font-mono', isFunding ? 'text-green-600' : 'text-gray-900')}>
                    {isFunding ? '+' : '-'}{formatCurrency(tx.amount || 0)}
                  </p>
                  <p
                    className="text-xs font-semibold capitalize"
                    style={{ color: isSuccess ? '#3B7A3B' : isPending ? '#D4973B' : '#C0392B' }}
                  >
                    {tx.status || 'completed'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Referral Section
// ─────────────────────────────────────────────────────────────────
function ReferralSection({ user, transactions }: { user: UserProfile; transactions: Transaction[] }) {
  const [referredUsers, setReferredUsers] = React.useState<ReferralUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [showQR, setShowQR] = React.useState(false);

  React.useEffect(() => {
    const q = query(collection(db, 'users', user.uid, 'referrals'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: ReferralUser[] = [];
      snapshot.forEach((d) => { list.push({ id: d.id, ...d.data() } as any); });
      setReferredUsers(list);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user.uid]);

  const commissionTx = transactions.filter(
    (tx) => tx.type === 'funding' && (tx.description?.toLowerCase().includes('referral commission') || tx.description?.toLowerCase().includes('2% referral'))
  );
  const totalEarnedCommission = commissionTx.reduce((sum, tx) => sum + tx.amount, 0);
  const getCommissionFromUser = (fullName: string) =>
    commissionTx.filter((tx) => tx.description?.toLowerCase().includes(fullName.toLowerCase())).reduce((sum, tx) => sum + tx.amount, 0);

  const referralLink = `${window.location.origin}?ref=${user.referralCode}`;
  const downloadQR = (id: string, filename: string) => {
    const svg = document.getElementById(id);
    if (svg && svg.tagName.toLowerCase() === 'svg') {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = filename;
        downloadLink.href = pngFile;
        downloadLink.click();
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    }
  };
  const handleCopyCode = () => { navigator.clipboard.writeText(user.referralCode); setCopiedCode(true); toast.success('Code copied!'); setTimeout(() => setCopiedCode(false), 2000); };
  const handleCopyLink = () => { navigator.clipboard.writeText(referralLink); setCopiedLink(true); toast.success('Link copied!'); setTimeout(() => setCopiedLink(false), 2000); };

  const shareText = `Join me on NORODATA for cheap data bundles: ${referralLink}`;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Hero */}
      <div className="rounded-3xl p-7 text-white relative overflow-hidden" style={{ backgroundColor: '#132613' }}>
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20" style={{ backgroundColor: '#3B7A3B' }} />
        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full mb-4" style={{ backgroundColor: 'rgba(181,212,48,0.2)', color: '#B5D430' }}>
            <Gift size={12} /> Referral Program
          </span>
          <h3 className="text-2xl font-black mb-2">Refer & earn 2% commissions</h3>
          <p className="text-sm mb-6" style={{ color: '#8FB88F' }}>
            Invite friends and earn a 2% cash commission on every purchase they make — forever.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
              <p className="text-xs mb-1" style={{ color: '#8FB88F' }}>Your code</p>
              <div className="flex items-center justify-between">
                <span className="font-mono font-black text-white">{user.referralCode}</span>
                <button onClick={handleCopyCode} className="text-xs px-2 py-1 rounded-lg font-bold transition-all" style={{ backgroundColor: copiedCode ? '#B5D430' : 'rgba(255,255,255,0.15)', color: copiedCode ? '#132613' : '#fff' }}>
                  {copiedCode ? '✓' : <Copy size={12} />}
                </button>
              </div>
            </div>
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
              <p className="text-xs mb-1" style={{ color: '#8FB88F' }}>Your link</p>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs opacity-80 truncate max-w-[100px]">{referralLink}</span>
                <button onClick={handleCopyLink} className="text-xs px-2 py-1 rounded-lg font-bold transition-all" style={{ backgroundColor: copiedLink ? '#B5D430' : '#fff', color: copiedLink ? '#132613' : '#3B7A3B' }}>
                  {copiedLink ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: '#8FB88F' }}>Share via:</span>
              <a href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white text-xs hover:scale-110 transition-all">W</a>
              <a href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-white text-xs hover:scale-110 transition-all">T</a>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs hover:scale-110 transition-all border border-white/10">X</a>
            </div>
            <button onClick={() => setShowQR(true)} className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all hover:bg-white hover:text-black" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}>
              <Scan size={12} /> Show QR
            </button>
          </div>

          <AnimatePresence>
            {showQR && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setShowQR(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="relative bg-white rounded-3xl p-6 shadow-2xl z-10 max-w-sm w-full text-center"
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-gray-900 font-black text-lg">Scan to join</h3>
                    <button onClick={() => setShowQR(false)} className="p-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="bg-white p-4 rounded-2xl inline-block border border-gray-100 shadow-sm mx-auto mb-4">
                    <QRCode
                      id="referral-qr-code"
                      value={referralLink}
                      size={200}
                      bgColor={"#ffffff"}
                      fgColor={"#132613"}
                      level={"H"}
                    />
                  </div>
                  <div className="flex gap-2 w-full mt-2">
                    <button 
                      onClick={() => downloadQR("referral-qr-code", "NORODATA-Referral-QR.png")}
                      className="w-full py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200 text-sm"
                    >
                      Download PNG
                    </button>
                  </div>
                  <div className="w-full mt-2">
                    <button 
                      onClick={() => window.print()}
                      className="w-full py-2.5 rounded-xl font-bold text-gray-900 bg-white hover:border-gray-300 active:scale-95 transition-all border-2 border-gray-100 text-sm flex justify-center items-center gap-2"
                    >
                      🖨️ Print A4 Flyer
                    </button>
                  </div>
                  <p className="text-gray-500 text-xs font-medium mt-3">Have your friends scan this QR code with their camera to join NORODATA directly.</p>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total referrals', val: referredUsers.length, icon: <Users size={20} />, iconBg: '#E8F0E8', iconColor: '#3B7A3B' },
          { label: 'Active partners', val: referredUsers.length, icon: <CheckCircle2 size={20} />, iconBg: '#E8F5E8', iconColor: '#3B7A3B' },
          { label: 'Commission earned', val: formatCurrency(totalEarnedCommission), icon: <Gift size={20} />, iconBg: '#FFF4E0', iconColor: '#D4973B' },
        ].map(({ label, val, icon, iconBg, iconColor }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: iconBg }}>
              <span style={{ color: iconColor }}>{icon}</span>
            </div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-xl font-black text-gray-900">{val}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-gray-900">Your referred network</h4>
            <p className="text-xs text-gray-400 mt-0.5">Users who signed up with your link or code.</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E8F0E8', color: '#3B7A3B' }}>{referredUsers.length} total</span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
        ) : referredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 font-bold uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Name / Email</th>
                  <th className="px-5 py-3 text-left">Joined</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-right">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {referredUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-gray-900">{u.fullName}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {u.createdAt ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#E8F5E8', color: '#3B7A3B' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-sm" style={{ color: '#3B7A3B' }}>
                      {formatCurrency(getCommissionFromUser(u.fullName))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-14 text-center space-y-3">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: '#E8F0E8' }}>
              <Gift size={24} style={{ color: '#3B7A3B' }} />
            </div>
            <p className="font-bold text-gray-900">No referrals yet</p>
            <p className="text-xs text-gray-400 max-w-xs mx-auto">Share your link above to start earning commissions.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Settings Section
// ─────────────────────────────────────────────────────────────────
function SettingsSection({ user }: { user: UserProfile }) {
  const [phoneNumber, setPhoneNumber] = React.useState(user.phoneNumber || '');
  const [transactionPin, setTransactionPin] = React.useState(user.transactionPin || '');
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isForceFetching, setIsForceFetching] = React.useState(false);
  const [isDeletingAllPlans, setIsDeletingAllPlans] = React.useState(false);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);

  const isAdmin = user.role === 'admin' || [
    'ibrahimfaruqolamilekan4@gmail.com',
    'adewaleogunkeye200@gmail.com',
    'jeffholland299@gmail.com'
  ].includes((user.email || '').toLowerCase().trim());

  const handleAdminForceFetch = async (autoPublish = false) => {
    setIsForceFetching(true);
    const toastId = toast.loading(autoPublish ? 'Force-fetching & publishing plans live...' : 'Force-fetching plans from providers...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch('/api/admin/fetch-all-providers-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'x-admin-email': user.email || 'ibrahimfaruqolamilekan4@gmail.com'
        },
        body: JSON.stringify({ autoPublish, defaultMarkup: 10 })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to force fetch plans');
      
      toast.dismiss(toastId);
      if (autoPublish) {
        toast.success(`🎉 Force-fetched & published ${data.publishedCount || data.total || 0} plans live!`);
      } else {
        toast.success(`🚀 Force-fetched ${data.total || 0} plans across all providers!`);
      }
      window.dispatchEvent(new CustomEvent('plans-updated'));
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err.message || 'Error force fetching plans');
    } finally {
      setIsForceFetching(false);
    }
  };

  const handleExecuteDeleteAll = async () => {
    setIsDeletingAllPlans(true);
    const toastId = toast.loading('Deleting all plans from database...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch('/api/admin/delete-all-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'x-admin-email': user.email || 'ibrahimfaruqolamilekan4@gmail.com'
        },
        body: JSON.stringify({ serviceType: 'data' })
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to purge plans from server');
      }

      // Direct Supabase fallback
      try { await supabase.from('services_config').delete().eq('service_type', 'data'); } catch (_) {}
      try { await supabase.from('services_config').delete().ilike('service_type', 'data'); } catch (_) {}
      try { await supabase.from('services_config').delete().or('provider.eq.mozosubz,provider.eq.nifex'); } catch (_) {}
      try { await supabase.from('data_plans').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch (_) {}

      toast.dismiss(toastId);
      toast.success('🗑️ All data plans deleted successfully! Database clean.');
      setShowDeleteModal(false);
      window.dispatchEvent(new CustomEvent('plans-updated'));
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err.message || 'Failed to delete all plans');
    } finally {
      setIsDeletingAllPlans(false);
    }
  };

  const handleUpdateSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transactionPin && (transactionPin.length !== 4 || !/^\d+$/.test(transactionPin))) {
      toast.error('Transaction PIN must be exactly 4 digits!'); return;
    }
    if (phoneNumber && (phoneNumber.length < 10 || phoneNumber.length > 11)) {
      toast.error('Enter a valid Nigerian phone number!'); return;
    }
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ phone_number: phoneNumber, transaction_pin: transactionPin })
        .eq('id', (user as any).uid || (user as any).id);
      if (error) throw error;
      toast.success('Profile updated! 🔐');
    } catch (error: any) {
      toast.error('Failed to update: ' + error.message);
    } finally { setIsUpdating(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
        {/* Profile info */}
        <div className="p-6">
          <h3 className="font-black text-gray-900 text-lg mb-5">Profile information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Full name', val: user.fullName },
              { label: 'Email address', val: user.email },
            ].map(({ label, val }) => (
              <div key={label}>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">{label}</label>
                <input
                  readOnly value={val}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Security */}
        <form onSubmit={handleUpdateSecurity} className="p-6 space-y-5">
          <div>
            <h3 className="font-black text-gray-900 text-lg mb-1">Security credentials</h3>
            <p className="text-xs text-gray-400">Keep your phone and PIN up to date.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Phone number</label>
              <input
                type="tel" maxLength={11} value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="08123456789"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Transaction PIN (4 digits)</label>
              <input
                type="password" maxLength={4} value={transactionPin}
                onChange={(e) => setTransactionPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold tracking-widest text-gray-900 focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit" disabled={isUpdating}
              className="px-6 py-3 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 hover:brightness-110"
              style={{ backgroundColor: '#3B7A3B' }}
            >
              {isUpdating ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>

        {/* Reseller upgrade */}
        {user.role === 'user' && (
          <div className="p-6">
            <h3 className="font-black text-lg mb-1" style={{ color: '#3B7A3B' }}>Upgrade to reseller</h3>
            <p className="text-xs text-gray-400 mb-5">Get wholesale data prices and earn more.</p>
            <div className="bg-green-50 border border-green-100 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-gray-900">Premium Reseller Account</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5">ONE-TIME FEE: ₦2,500.00</p>
              </div>
              <button className="px-5 py-2.5 text-white text-sm font-bold rounded-xl hover:brightness-110 transition-all" style={{ backgroundColor: '#3B7A3B' }}>
                Upgrade now
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Admin Multi-Provider Plan Maintenance Controls in Settings */}
      {isAdmin && (
        <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-6 space-y-4 shadow-xl text-left">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Admin Maintenance Console
                </span>
                <h3 className="font-black text-white text-base sm:text-lg">Data Plans & Provider Synchronization</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Force fetch live data bundles across providers (Mozosubz + Nifex) or wipe all data plans from database cleanly.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleAdminForceFetch(false)}
              disabled={isForceFetching}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-md flex items-center gap-2 transition cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isForceFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>{isForceFetching ? "Force Fetching..." : "Force Fetch All Providers"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleAdminForceFetch(true)}
              disabled={isForceFetching}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-md flex items-center gap-2 transition cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isForceFetching ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              <span>Force Sync & Publish Live</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={isDeletingAllPlans}
              className="px-4 py-2.5 rounded-xl bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-xs font-extrabold shadow-md flex items-center gap-2 transition cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isDeletingAllPlans ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              <span>{isDeletingAllPlans ? "Deleting All Plans..." : "Delete All Plans"}</span>
            </button>
          </div>

          {/* Delete All Plans In-App Modal */}
          {showDeleteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 text-left">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center text-xl shrink-0">
                    <Trash2 size={24} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-white">
                      Delete ALL Data Plans?
                    </h3>
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">
                      This will wipe all active data plans from your database so you can start completely fresh. You can then immediately click "Force Sync & Publish Live" or add custom plans.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 font-semibold">
                  ⚠️ Action is permanent. All current data bundle entries will be wiped.
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={isDeletingAllPlans}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteDeleteAll}
                    disabled={isDeletingAllPlans}
                    className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg flex items-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
                  >
                    {isDeletingAllPlans ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    <span>{isDeletingAllPlans ? 'Deleting All...' : 'Yes, Delete All Now'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Danger zone */}
      <div className="bg-white rounded-2xl border border-red-100 p-6 space-y-4 shadow-sm">
        <h3 className="font-black text-red-600 text-lg">Danger zone</h3>
        <p className="text-sm text-gray-400">Once you delete your account, there is no recovering it.</p>
        <button className="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold rounded-xl border border-red-200 transition-all">
          Delete account
        </button>
      </div>
    </div>
  );
}
