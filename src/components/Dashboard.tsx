import React from 'react';
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
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import type { UserProfile, Transaction, ServicePlan, NetworkType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToTransactions, subscribeToServicePlans } from '../lib/firestore';
import { collection, query, onSnapshot, orderBy, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { purchaseAirtime, purchaseDataBundle } from '../lib/recharge';

import ServicePurchase from './ServicePurchase';
import PayBillsSection from './PayBillsSection';
import AdminPanelSection from './AdminPanelSection';
import ElectricitySection from './ElectricitySection';
import BettingSection from './BettingSection';
import CableTvSection from './CableTvSection';
import ResellerPortal from './ResellerPortal';
import TransactionHistory from './TransactionHistory';

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
    <div className="min-h-screen" style={{ backgroundColor: '#EDEDE9', fontFamily: "'Inter', system-ui, sans-serif" }}>
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

              <div className="px-3 py-4 border-t border-gray-100">
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

        <div className="px-3 py-4 border-t border-gray-100">
          <button
            onClick={handleLoggedOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-all"
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all hover:brightness-95 active:scale-95 border"
              style={{ backgroundColor: '#F0F0EC', borderColor: '#D4D4CE', color: '#132613' }}
            >
              <Send size={14} />
              <span className="hidden sm:inline">Transfer</span>
            </button>

            {/* Deposit funds button */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-fund-modal'))}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:brightness-110 active:scale-95"
              style={{ backgroundColor: '#3B7A3B' }}
            >
              <span className="text-base leading-none">+</span>
              <span>Deposit funds</span>
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

      {/* ── Floating support chat button ─────────────────────────────── */}
      <div className="fixed right-5 bottom-6 z-40 print:hidden">
        <button
          onClick={() => setShowSupportHub(!showSupportHub)}
          className="w-13 h-13 w-[52px] h-[52px] text-white rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-105 active:scale-95"
          style={{ backgroundColor: '#3B7A3B' }}
          title="Live Support"
        >
          {showSupportHub ? <X size={22} /> : <MessageSquare size={22} />}
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
                <p className="text-xs text-gray-400 mt-0.5">24/7 support services</p>
              </div>
              <div className="space-y-2">
                {ADMIN_CONTACTS.map((admin) => (
                  <a
                    key={admin.number}
                    href={`https://wa.me/${admin.number}?text=Hello%20NORODATA%20Support,%20I%20need%20help%20with...`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-3 bg-green-50 hover:bg-green-100 text-green-800 rounded-xl transition-all text-xs font-semibold"
                  >
                    <MessageSquare size={14} /> WhatsApp — {admin.label}
                  </a>
                ))}
                <a
                  href="https://t.me/NORODATA_data_group"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl transition-all text-xs font-semibold"
                >
                  <Send size={14} /> Telegram channel
                </a>
                <a
                  href="tel:+2348123456789"
                  className="flex items-center gap-3 p-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl transition-all text-xs font-semibold"
                >
                  <PhoneCall size={14} /> Call support line
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
  const [fundingTab, setFundingTab] = React.useState<'automated' | 'gateway' | 'manual'>('automated');
  const [opayAmount, setOpayAmount] = React.useState('2000');
  const [manualAmount, setManualAmount] = React.useState('');
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

  // Check payment result in URL
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentResult = params.get('payment');
    const ref = params.get('ref');
    const amt = params.get('amount');
    if (paymentResult === 'success' && ref) {
      toast.success(`Successfully funded wallet with ${formatCurrency(Number(amt || 0))}!`, { duration: 5000, icon: '🎉' });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentResult === 'cancelled') {
      toast.error('Payment cancelled.', { duration: 4500 });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLookupRecipient = async () => {
    if (!transferUid.trim()) { toast.error('Please enter recipient details'); return; }
    setTransferLoading(true);
    try {
      const q = transferUid.trim();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`email.eq.${q},phone_number.eq.${q},username.eq.${q},referral_code.eq.${q.toUpperCase()}`)
        .maybeSingle();
      if (error) throw error;
      if (!data) { toast.error('User not found.'); setTransferLoading(false); return; }
      if (data.id === (user as any).uid || data.id === (user as any).id) { toast.error('Cannot transfer to yourself.'); setTransferLoading(false); return; }
      setTransferRecipient(data);
      setTransferStep('confirm');
    } catch (err: any) { toast.error(err.message || 'Failed to find recipient'); }
    finally { setTransferLoading(false); }
  };

  const handleConfirmTransfer = async () => {
    const amt = Number(transferAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setTransferLoading(true);
    const reference = `NOR-TXF-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    try {
      const { data, error } = await supabase.rpc('transfer_funds', {
        recipient_uid: transferRecipient.id, p_amount: amt, p_reference: reference, p_note: transferNote
      });
      if (error) throw error;
      if (data.status === 'success') {
        toast.success(`₦${amt.toLocaleString()} sent!`);
        setShowTransferModal(false);
        setTransferStep('input');
        setTransferUid(''); setTransferAmount(''); setTransferNote(''); setTransferRecipient(null);
        refreshBalance();
      } else if (data.status === 'insufficient_funds') {
        toast.error(`Insufficient balance.`);
      } else { toast.error(data.message || 'Transfer failed'); }
    } catch (err: any) { toast.error(err.message || 'Transfer failed'); }
    finally { setTransferLoading(false); }
  };

  const handleFlutterwaveFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(opayAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    setFwLoading(true);
    const reference = `NOR-FW-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const loadScript = (): Promise<boolean> => new Promise((resolve) => {
      if ((window as any).FlutterwaveCheckout) { resolve(true); return; }
      const script = document.createElement('script');
      script.src = 'https://checkout.flutterwave.com/v3.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
    const scriptLoaded = await loadScript();
    if (!scriptLoaded) { toast.error('Flutterwave failed to load.', { duration: 8000 }); setFwLoading(false); return; }
    try {
      const pKeyResp = await fetch('/api/v1/payment/config').catch(() => null);
      let flutterwavePublicKey = '';
      if (pKeyResp && pKeyResp.ok) {
        const configData = await pKeyResp.json();
        flutterwavePublicKey = configData.flutterwavePublicKey || '';
      }
      if (!flutterwavePublicKey) flutterwavePublicKey = (import.meta as any).env?.VITE_FLUTTERWAVE_PUBLIC_KEY || '';
      flutterwavePublicKey = flutterwavePublicKey.replace(/^["']|["']$/g, '').trim();
      if (!flutterwavePublicKey || flutterwavePublicKey.includes('xxxx')) {
        setFwLoading(false); toast.error('Flutterwave not configured.', { duration: 8000 }); return;
      }
      const verifyOnServer = async (transactionId: string) => {
        setFwLoading(false);
        fetch('/api/payments/verify-flutterwave', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionId, reference, amount: amt, email: user.email, userId: user.uid })
        }).catch(() => {});
        toast.success(`Topped up ₦${amt.toLocaleString()} via Flutterwave!`, { duration: 7500, icon: '🚀' });
        setShowFundModal(false); setOpayAmount('2000');
        setTimeout(refreshBalance, 1500);
      };
      (window as any).FlutterwaveCheckout({
        public_key: flutterwavePublicKey, tx_ref: reference, amount: amt, currency: 'NGN', country: 'NG',
        payment_options: 'card, banktransfer',
        customer: { email: user.email, phone_number: (user as any).phone_number || '08000000000', name: user.fullName || 'Customer' },
        customizations: { title: 'NORODATA Wallet Funding', description: 'Wallet top-up via Flutterwave', logo: '' },
        callback: (response: any) => {
          if (response.status === 'successful' || response.status === 'success') {
            verifyOnServer(String(response.transaction_id || 'simulated'));
          } else { setFwLoading(false); toast.error('Payment not completed.'); }
        },
        onclose: () => { setFwLoading(false); toast('Payment cancelled.', { icon: 'ℹ️' }); }
      });
    } catch (err: any) { toast.error(`Flutterwave error: ${err.message}`); setFwLoading(false); }
  };

  // Quick service grid
  const quickServices = [
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

  return (
    <div className="space-y-5 max-w-2xl mx-auto md:max-w-none">

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
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
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
              className="px-5 py-2.5 rounded-2xl text-sm font-bold transition-all hover:brightness-110 active:scale-95"
              style={{ backgroundColor: '#B5D430', color: '#132613' }}
            >
              Deposit money →
            </button>
          </div>
        </div>
      </div>

      {/* ── Spend + Month summary row ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Spend card */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">SPEND THIS MONTH</p>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-black text-gray-900">{formatCurrency(spendThisMonth)}</span>
            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Live</span>
          </div>
          {/* Mini bar chart */}
          <div className="flex items-end gap-1.5 h-10">
            {[35, 55, 80, 45, 70, 100, 75].map((h, i) => (
              <div
                key={i}
                style={{ height: `${h}%`, backgroundColor: i === 5 ? '#3B7A3B' : '#D4E8D4' }}
                className="flex-1 rounded-t"
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
            className="mt-3 text-xs font-bold self-end"
            style={{ color: '#3B7A3B' }}
          >
            See your activity →
          </button>
        </div>
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

              {/* Tabs */}
              <div className="flex p-2 mx-4 mt-4 bg-gray-100 rounded-xl gap-1">
                {(['automated', 'gateway', 'manual'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFundingTab(t)}
                    className={cn('flex-1 py-2 px-2 text-xs font-bold rounded-lg capitalize transition-all',
                      fundingTab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700')}
                  >
                    {t === 'automated' ? 'Bank Transfer' : t === 'gateway' ? 'Card/Gateway' : 'Manual'}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {fundingTab === 'automated' && (
                  <div className="space-y-4">
                    {/* Coming soon state */}
                    <div className="rounded-2xl p-6 text-center space-y-4" style={{ backgroundColor: '#F5F7F5', border: '1.5px dashed #C8D8C8' }}>
                      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: '#E8F0E8' }}>
                        <span className="text-2xl">🏦</span>
                      </div>
                      <div>
                        <p className="font-black text-gray-900 text-base">Bank Transfer — Coming Soon</p>
                        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                          We're setting up a dedicated virtual bank account for your wallet. Once ready, transfers will credit your balance automatically.
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-4 border border-gray-100 text-left">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">In the meantime, you can:</p>
                        <ul className="space-y-2 text-sm text-gray-600">
                          <li className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs shrink-0" style={{ backgroundColor: '#3B7A3B' }}>1</span>
                            Fund via Card/Gateway (Flutterwave)
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs shrink-0" style={{ backgroundColor: '#3B7A3B' }}>2</span>
                            Submit a Manual transfer request
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs shrink-0" style={{ backgroundColor: '#3B7A3B' }}>3</span>
                            Contact support on WhatsApp
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {fundingTab === 'gateway' && (
                  <form onSubmit={handleFlutterwaveFundSubmit} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Amount (₦)</label>
                      <input
                        type="number" required value={opayAmount}
                        onChange={(e) => setOpayAmount(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 2000"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-green-500 text-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={fwLoading || !opayAmount || Number(opayAmount) <= 0}
                      className="w-full text-white font-bold rounded-xl py-3.5 transition-all disabled:opacity-50"
                      style={{ backgroundColor: '#3B7A3B' }}
                    >
                      {fwLoading ? 'Initializing…' : 'Pay via Flutterwave'}
                    </button>
                  </form>
                )}

                {fundingTab === 'manual' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Amount Transferred (₦)</label>
                      <input
                        type="number" value={manualAmount}
                        onChange={(e) => setManualAmount(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 5000"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:border-green-500 text-lg"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (!manualAmount) return toast.error('Enter amount');
                        toast.success('Request submitted. Awaiting admin approval.');
                        setShowFundModal(false);
                      }}
                      className="w-full text-white font-bold rounded-xl py-3.5 transition-all"
                      style={{ backgroundColor: '#3B7A3B' }}
                    >
                      Confirm transfer made
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Transfer Modal ────────────────────────────────────────── */}
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
                  <p className="text-xs text-gray-400 mt-0.5">Wallet-to-wallet transfer via Transfer ID</p>
                </div>
                <button onClick={() => { setShowTransferModal(false); setTransferStep('input'); }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <X size={16} />
                </button>
              </div>

              {transferStep === 'input' && (
                <div className="space-y-5">
                  {/* Transfer ID field — primary / most prominent */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-black text-gray-900 uppercase tracking-wider">Recipient Transfer ID</label>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#E8F0E8', color: '#3B7A3B' }}>
                        same as referral code
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={transferUid}
                        onChange={(e) => setTransferUid(e.target.value)}
                        placeholder="e.g. NORODATA-AB12C"
                        className="w-full bg-gray-50 border-2 rounded-xl px-4 py-4 font-mono font-black text-gray-900 text-lg focus:outline-none transition-all uppercase tracking-wider placeholder:normal-case placeholder:font-normal placeholder:text-sm placeholder:tracking-normal"
                        style={{ borderColor: transferUid ? '#3B7A3B' : '#E5E7EB' }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                      Ask the recipient to share their Transfer ID. They can find it on their dashboard under <strong>Refer & earn</strong> — it looks like <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-xs">NORODATA-XXXXX</span>.
                    </p>
                  </div>

                  {/* Your own Transfer ID for easy sharing */}
                  {user.referralCode && (
                    <div className="rounded-xl p-4 flex items-center justify-between" style={{ backgroundColor: '#F0F5F0', border: '1px solid #D0E4D0' }}>
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Your Transfer ID</p>
                        <p className="font-mono font-black text-gray-900 mt-0.5">{user.referralCode}</p>
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(user.referralCode); toast.success('Your Transfer ID copied!'); }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all"
                        style={{ backgroundColor: '#3B7A3B', color: '#fff' }}
                      >
                        <Copy size={12} /> Copy mine
                      </button>
                    </div>
                  )}

                  {/* Amount */}
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Amount (₦)</label>
                    <input
                      type="number"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 text-lg focus:outline-none focus:border-green-500 transition-all"
                    />
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
                    disabled={transferLoading || !transferUid || !transferAmount}
                    className="w-full text-white font-bold rounded-xl py-3.5 disabled:opacity-50 transition-all"
                    style={{ backgroundColor: '#3B7A3B' }}
                  >
                    {transferLoading ? 'Looking up recipient…' : 'Find recipient & continue →'}
                  </button>
                </div>
              )}

              {transferStep === 'confirm' && transferRecipient && (
                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 space-y-3">
                    <p className="text-xs text-gray-400 font-bold uppercase">Sending to</p>
                    <p className="font-black text-gray-900">{transferRecipient.full_name || transferRecipient.username || transferRecipient.email}</p>
                    <p className="text-sm text-gray-500">{transferRecipient.phone_number || transferRecipient.email}</p>
                    {transferNote && <p className="text-sm text-gray-600 italic">"{transferNote}"</p>}
                    <div className="pt-3 border-t border-gray-200 flex justify-between items-center">
                      <span className="text-xs text-gray-400 font-bold uppercase">Amount</span>
                      <span className="text-xl font-black" style={{ color: '#3B7A3B' }}>₦{Number(transferAmount).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setTransferStep('input')} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl py-3.5 transition-all">
                      Back
                    </button>
                    <button onClick={handleConfirmTransfer} disabled={transferLoading} className="text-white font-bold rounded-xl py-3.5 disabled:opacity-50 transition-all" style={{ backgroundColor: '#3B7A3B' }}>
                      {transferLoading ? 'Sending…' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )}
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

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: '#8FB88F' }}>Share via:</span>
            <a href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white text-xs hover:scale-110 transition-all">W</a>
            <a href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-white text-xs hover:scale-110 transition-all">T</a>
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs hover:scale-110 transition-all border border-white/10">X</a>
          </div>
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
