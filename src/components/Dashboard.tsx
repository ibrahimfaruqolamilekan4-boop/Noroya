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
  Filter
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import type { UserProfile, Transaction, ServicePlan, NetworkType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToTransactions, subscribeToServicePlans } from '../lib/firestore';
import { collection, query, onSnapshot, orderBy, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { purchaseAirtime } from '../lib/recharge';

import ServicePurchase from './ServicePurchase';
import PayBillsSection from './PayBillsSection';
import AdminPanelSection from './AdminPanelSection';
import ElectricitySection from './ElectricitySection';
import BettingSection from './BettingSection';
import CableTvSection from './CableTvSection';
import ResellerPortal from './ResellerPortal';
import TransactionHistory from './TransactionHistory';

export default function Dashboard({ user, onLogout }: { user: UserProfile, onLogout: () => void }) {
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
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  const [showSupportHub, setShowSupportHub] = React.useState(false);
  const [broadcastAlert, setBroadcastAlert] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Check local announcements
    const storedAnn = localStorage.getItem('vtu_latest_announcement');
    if (storedAnn) {
      setBroadcastAlert(storedAnn);
    }
  }, [activeTab]);

  // Auto-logout after 15 minutes of inactivity for security
  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const INACTIVITY_TIME = 15 * 60 * 1000; // 15 minutes

    const handleAutoLogout = () => {
      toast.error("Logged out automatically due to 15 minutes of inactivity.", {
        duration: 5000,
      });
      handleLoggedOut();
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleAutoLogout, INACTIVITY_TIME);
    };

    // Event listeners to detect activity
    const activityEvents = [
      'mousedown', 'mousemove', 'keypress',
      'scroll', 'touchstart', 'click'
    ];

    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Start initial timer
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, []);

  React.useEffect(() => {
    const unsub = subscribeToTransactions(user.uid, (data) => {
      setTransactions(data as Transaction[]);
    });
    return () => unsub();
  }, [user.uid]);

  // Automated Monnify account-generation completely dropped

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'buy-data', label: 'Buy Data', icon: <Smartphone size={20} /> },
    { id: 'buy-airtime', label: 'Buy Airtime', icon: <Zap size={20} /> },
    { id: 'electricity', label: 'Electricity Bills', icon: <Zap size={20} /> },
    { id: 'cable', label: 'Cable TV', icon: <Tv size={20} /> },
    { id: 'betting', label: 'Fund Betting', icon: <Trophy size={20} /> },
    { id: 'bills', label: 'Pay Bills', icon: <CreditCard size={20} /> },
    { id: 'history', label: 'Transactions', icon: <History size={20} /> },
    { id: 'reseller', label: 'Reseller Portal', icon: <Briefcase size={20} /> },
    { id: 'referrals', label: 'Referrals', icon: <Users size={20} /> },
    { id: 'settings', label: 'Account Settings', icon: <Settings size={20} /> },
  ];

  if (user.role === 'admin') {
    sidebarItems.push({ id: 'admin', label: 'Admin Control', icon: <ShieldCheck size={20} /> });
  }

  const handleLoggedOut = () => {
    signOut();
    onLogout();
  };

  return (
    <div className={cn(
      "flex h-screen overflow-hidden transition-colors duration-200 font-sans",
      isDarkMode ? "bg-slate-950 text-slate-100" : "bg-[#DBE2EF] text-slate-900"
    )}>
      {/* Sidebar - Desktop */}
      <aside className={cn(
        "hidden md:flex flex-col w-64 transition-colors duration-200 shrink-0",
        isDarkMode ? "bg-slate-900 border-r border-slate-800 text-slate-100" : "bg-white border-r-2 border-black text-slate-900"
      )}>
        <div className="p-6 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="text-white" size={18} />
          </div>
          <span className="text-xl font-bold tracking-tight">
            NOROYA<span className="text-blue-600 underline underline-offset-2">DATA</span>
          </span>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTabAndService(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold",
                activeTab === item.id 
                  ? "bg-blue-650 text-white bg-blue-600" 
                  : isDarkMode 
                    ? "text-slate-400 hover:bg-slate-805 hover:text-white hover:bg-slate-800" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className={cn("p-4 border-t", isDarkMode ? "border-slate-800" : "border-slate-100")}>
          <button 
            onClick={handleLoggedOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 hover:text-red-600 transition-all text-sm font-extrabold"
          >
            <LogOut size={20} />
            Logout Account
          </button>
        </div>
      </aside>

      {/* Sliding Mobile Sidebar Navigation Sheet Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[60] md:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm"
            />
            
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={cn(
                "absolute top-0 bottom-0 left-0 w-72 p-6 flex flex-col shadow-2xl",
                isDarkMode ? "bg-slate-900 text-slate-150" : "bg-white text-slate-900"
              )}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <TrendingUp className="text-white" size={18} />
                  </div>
                  <span className="text-lg font-bold tracking-tight">NOROYA DATA</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 px-1.5 bg-slate-50 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <nav className="flex-1 space-y-1">
                {sidebarItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setTabAndService(item.id); setIsMobileMenuOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold",
                      activeTab === item.id 
                        ? "bg-blue-600 text-white" 
                        : isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="pt-4 border-t border-slate-100">
                <button 
                  onClick={handleLoggedOut}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 font-bold transition-all text-sm"
                >
                  <LogOut size={20} />
                  Logout Account
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden font-sans">
        {/* Header toolbar */}
        <header className={cn(
          "h-16 px-6 flex items-center justify-between transition-colors duration-200 shrink-0",
          isDarkMode ? "bg-slate-900 border-b border-slate-800 text-slate-100" : "bg-white border-b-2 border-black text-slate-950"
        )}>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 text-slate-500">
              <Menu size={22} className={isDarkMode ? "text-slate-300" : "text-slate-600"} />
            </button>
            <h2 className="text-lg font-extrabold capitalize select-none">{activeTab.replace('-', ' ')}</h2>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Aesthetics Dark Mode Toggle button */}
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={cn(
                "p-2.5 rounded-xl transition-all border",
                isDarkMode ? "bg-slate-800 hover:bg-slate-750 border-slate-700 text-yellow-300" : "bg-slate-50 hover:bg-slate-100 border-slate-150 text-slate-600"
              )}
              title="Toggle Contrast Mode"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button className="p-2.5 text-slate-500 hover:bg-slate-50 rounded-xl relative border border-transparent">
              <Bell size={18} className={isDarkMode ? "text-slate-300" : "text-slate-600"} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-blue-600 rounded-full border-2 border-white" />
            </button>
            
            <div className={cn("hidden sm:flex items-center gap-3 pl-4 border-l", isDarkMode ? "border-slate-800" : "border-slate-100")}>
              <div className="text-right select-none">
                <p className="text-sm font-extrabold">{user.fullName}</p>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">{user.role}</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                {user.fullName[0].toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Alert Broadcast System Banner */}
        {broadcastAlert && (
          <div className="px-6 p-4 bg-indigo-600 text-white flex justify-between items-center transition-all">
            <div className="flex items-center gap-2.5 text-xs font-semibold">
              <span className="animate-bounce font-sans">📢</span>
              <span><strong>News Broadcast:</strong> {broadcastAlert}</span>
            </div>
            <button 
              onClick={() => { setBroadcastAlert(null); localStorage.removeItem('vtu_latest_announcement'); }} 
              className="p-1.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all ml-4 shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Scrollable Panel Area with Light/Dark Theme contrast backgrounds hooks */}
        <div className={cn(
          "flex-1 overflow-y-auto p-6 md:p-8 transition-colors duration-250",
          isDarkMode ? "bg-slate-950 text-slate-100" : "bg-[#DBE2EF] text-[#1A1A1A]"
        )}>
          <div className="max-w-5xl mx-auto space-y-8">
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
          </div>
        </div>
      </main>

      {/* Floating 24/7 client live chat support assistant hub button */}
      <div className="fixed right-6 bottom-6 z-40 print:hidden font-sans">
        <button 
          onClick={() => setShowSupportHub(!showSupportHub)}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all outline-none"
          title="Consult Live Hub Support Chat"
        >
          {showSupportHub ? <X size={24} /> : <MessageSquare size={24} />}
        </button>

      {/* Premium Digital E-Receipt Modal */}
      <AnimatePresence>
        {selectedReceiptTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReceiptTx(null)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden relative border border-slate-100 shadow-2xl z-10 p-6 flex flex-col space-y-6 print:p-0 print:shadow-none print:border-none"
            >
              <div className="text-center space-y-2 mt-4">
                <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h4 className="font-sans font-black text-slate-900 tracking-tight text-xl">Transaction Receipt</h4>
                  <p className="text-[10px] text-green-600 font-extrabold uppercase tracking-widest mt-0.5">Approved & Clear</p>
                </div>
              </div>

              {/* Amount visual area */}
              <div className="bg-slate-50 border border-slate-100/80 rounded-3xl p-6 text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount Charged</p>
                <p className="text-3xl font-black text-slate-900 tracking-tight mt-1">
                  {formatCurrency(selectedReceiptTx.amount)}
                </p>
                {selectedReceiptTx.cashbackEarned && selectedReceiptTx.cashbackEarned > 0 ? (
                  <div className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 rounded-full border border-amber-100 mt-3 text-[10px] text-amber-800 font-bold tracking-tight animate-pulse mx-auto">
                    ⚡ ₦{Number(selectedReceiptTx.cashbackEarned).toFixed(2)} Cashback Credited
                  </div>
                ) : null}
              </div>

              {/* Detailed specs */}
              <div className="space-y-3.5 px-1 text-sm font-sans text-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Transaction ID</span>
                  <span className="font-mono font-extrabold text-slate-800">{selectedReceiptTx.reference}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Type</span>
                  <span className="font-extrabold text-slate-800 uppercase">{selectedReceiptTx.type}</span>
                </div>
                <div className="flex justify-between items-start text-xs text-right">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-left shrink-0">Description</span>
                  <span className="font-extrabold text-slate-800 max-w-[220px] leading-relaxed break-words">{selectedReceiptTx.description}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Date</span>
                  <span className="font-extrabold text-slate-800">
                    {new Date(selectedReceiptTx.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Status Code</span>
                  <span className="px-2 py-0.5 bg-green-500 text-white rounded font-extrabold uppercase tracking-wide text-[9px]">
                    {selectedReceiptTx.status}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 print:hidden">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`Receipt ID: ${selectedReceiptTx.reference}\nAmount: ₦${selectedReceiptTx.amount}\nDate: ${new Date(selectedReceiptTx.createdAt).toLocaleString()}\nStatus: SUCCESS`);
                    toast.success("Receipt details copied to clipboard!");
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl py-3.5 transition-all text-xs tracking-tight"
                >
                  Copy Details
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl py-3.5 transition-all shadow-lg shadow-blue-100 text-xs tracking-tight"
                >
                  Print E-Receipt
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedReceiptTx(null)}
                className="text-center font-bold text-slate-400 text-xs hover:text-slate-600 pt-1 print:hidden select-none outline-none"
              >
                Dismiss
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* Help Hub Options */}
        <AnimatePresence>
          {showSupportHub && (
            <motion.div 
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              className={cn(
                "absolute bottom-20 right-0 w-72 rounded-[2.5rem] p-6 border shadow-2xl space-y-4",
                isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-100 text-slate-900"
              )}
            >
              <div>
                <h5 className="font-extrabold text-sm text-slate-900 leading-none">Noroya Help Hub</h5>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase mt-1">24/7 Client Support services</p>
              </div>

              <div className="space-y-2 text-xs">
                {/* WHATSAPP LINK */}
                <a 
                  href="https://wa.me/2348143889102?text=Hello%20Nooraya%20Support,%20I%20need%20help%20with..." 
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 p-3 bg-green-55 hover:bg-green-105 text-green-800 rounded-2xl transition-all font-bold"
                >
                  <MessageSquare size={16} /> WhatsApp Live Channel
                </a>

                {/* TELEGRAM LINK */}
                <a 
                  href="https://t.me/noroya_data_group" 
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 p-3 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-2xl transition-all font-bold"
                >
                  <Send size={16} /> Telegram Support channel
                </a>

                {/* CALL LINE */}
                <a 
                  href="tel:+2348123456789"
                  className="flex items-center gap-3 p-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl transition-all font-bold"
                >
                  <PhoneCall size={16} /> Telephone Support Line
                </a>
              </div>

              <p className="text-[10px] text-slate-400 leading-normal text-center bg-slate-50 p-2.5 rounded-xl">Our automated dispatch clear monitors and solves claims inside minutes.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}


// TransactionHistory has been migrated to its own modular component file: /src/components/TransactionHistory.tsx


interface ReferralUser {
  uid: string;
  fullName: string;
  email: string;
  createdAt: any;
}

function ReferralSection({ user, transactions }: { user: UserProfile, transactions: Transaction[] }) {
  const [referredUsers, setReferredUsers] = React.useState<ReferralUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);

  React.useEffect(() => {
    const q = query(
      collection(db, 'users', user.uid, 'referrals'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: ReferralUser[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as any);
      });
      setReferredUsers(list);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Referrals Sync Error: ", error);
      setLoading(false);
    });

    return () => unsub();
  }, [user.uid]);

  // Compute commissions
  const commissionTx = transactions.filter(tx => 
    tx.type === 'funding' && 
    (tx.description?.toLowerCase().includes('referral commission') || tx.description?.toLowerCase().includes('2% referral'))
  );
  
  const totalEarnedCommission = commissionTx.reduce((sum, tx) => sum + tx.amount, 0);

  // Calculate commission earned per referred user
  const getCommissionFromUser = (fullName: string) => {
    return commissionTx
      .filter(tx => tx.description?.toLowerCase().includes(fullName.toLowerCase()))
      .reduce((sum, tx) => sum + tx.amount, 0);
  };

  const referralLink = `${window.location.origin}?ref=${user.referralCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    toast.success("Referral signup link copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(user.referralCode);
    setCopiedCode(true);
    toast.success("Referral code copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const shareText = `Hey! Join me on Noroya Data to get unbeatable discounts on data bundles and airtime top-ups. Sign up using my referral link: ${referralLink}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Join me on Noroya Data for VTU discounts!")}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="space-y-8 font-sans">
      {/* Hero Card */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 rounded-[32px] p-8 md:p-10 text-white shadow-2xl shadow-blue-100 relative overflow-hidden">
        <div className="relative z-10 max-w-xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 px-3.5 py-1.5 rounded-full text-xs font-black tracking-wide uppercase">
            <Gift size={14} className="text-yellow-300 animate-pulse" /> Noroya Partner Program
          </div>
          <h3 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">Refer & Earn 2% Commissions</h3>
          <p className="text-blue-100 text-sm md:text-base leading-relaxed font-medium">
            Invite your friends to Noroya Data and earn a <span className="text-white font-bold underline decoration-yellow-400 decoration-2">2% cash commission</span> on every single data and airtime purchase they make — for life!
          </p>
          
          {/* Actions panel */}
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex flex-col justify-center border border-white/15 relative group">
              <span className="text-[10px] uppercase font-bold tracking-widest text-blue-200 mb-1">Your Unique Code</span>
              <div className="flex items-center justify-between">
                <span className="text-lg font-mono font-black tracking-wider text-white">{user.referralCode}</span>
                <button 
                  onClick={handleCopyCode}
                  className={cn(
                    "p-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                    copiedCode 
                      ? "bg-green-500 text-white shadow-lg shadow-green-500/20 scale-105" 
                      : "bg-white/10 hover:bg-white/20 text-white"
                  )}
                >
                  {copiedCode ? <CheckCircle2 size={13} className="text-white" /> : <Copy size={13} />} {copiedCode ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex flex-col justify-center border border-white/15 relative group">
              <span className="text-[10px] uppercase font-bold tracking-widest text-blue-200 mb-1">Your Referral Link</span>
              <div className="flex items-center justify-between">
                <span className="text-xs truncate max-w-[120px] md:max-w-[140px] font-mono opacity-85">{referralLink}</span>
                <button 
                  onClick={handleCopyLink}
                  className={cn(
                    "p-1.5 px-3 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer",
                    copiedLink 
                      ? "bg-green-500 text-white shadow-lg shadow-green-500/20 scale-105" 
                      : "bg-white text-blue-600 hover:bg-blue-50"
                  )}
                >
                  {copiedLink ? <CheckCircle2 size={13} className="text-white" /> : <Copy size={13} />} {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-white/10">
            <span className="text-xs text-blue-200 font-bold uppercase tracking-wider">Direct Sharing:</span>
            <div className="flex gap-2">
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white transition-all hover:scale-110 shadow" title="Share via WhatsApp">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.182 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.97C16.528 2.016 14.1 1.01 11.999 1.01c-5.443 0-9.866 4.372-9.87 9.802 0 1.706.469 3.374 1.357 4.886l-.991 3.62 3.76-.98-.208.118zM17.65 14.9c-.312-.158-1.848-.911-2.134-1.015-.285-.104-.493-.158-.7.158-.207.314-.805 1.015-.987 1.222-.18.207-.363.233-.675.076-1.111-.556-1.921-.979-2.613-2.164-.176-.301-.176-.563-.021-.718.14-.139.312-.363.468-.545.155-.182.207-.312.311-.52.104-.208.052-.39-.026-.547-.078-.156-.7-1.688-.959-2.311-.252-.607-.508-.525-.7-.525-.18 0-.389-.011-.597-.011-.207 0-.547.078-.832.39-.285.312-1.09 1.066-1.09 2.6s1.117 3.016 1.272 3.223c.156.208 2.2 3.36 5.33 4.717.745.322 1.325.515 1.777.659.749.238 1.428.205 1.967.125.6-.09 1.847-.753 2.107-1.444.26-.692.26-1.287.182-1.411-.078-.125-.286-.203-.597-.362z"/></svg>
              </a>
              <a href={telegramUrl} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-sky-500 hover:bg-sky-600 flex items-center justify-center text-white transition-all hover:scale-110 shadow" title="Share via Telegram">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M22.05 1.577c-.57-.27-9.524 3.98-17.765 7.42-1.12.467-1.11 1.1-.19 1.385l4.56 1.42 1.4 4.305c.13.4.45.68.85.68h.04c.4 0 .75-.24.95-.59l1.66-2.52 3.86 2.85c.67.5 1.47.12 1.72-.69L23.95 2.87c.21-.71-.31-1.3-.9-1.293zM18.8 6.42l-8.4 7.6-.2 3.1-.9-3.2-1.9-.6L18.8 6.42z"/></svg>
              </a>
              <a href={twitterUrl} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-slate-900 hover:bg-black border border-white/5 flex items-center justify-center text-white transition-all hover:scale-110 shadow" title="Share via Twitter">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
            </div>
          </div>
        </div>
        <Users className="absolute -bottom-10 -right-10 w-72 h-72 text-white/5 pointer-events-none" />
      </div>

      {/* Statistics board */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100/80 shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider mb-0.5">Total Referrals</p>
            <p className="text-2xl font-black text-slate-800 tracking-tight leading-none">{referredUsers.length}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100/80 shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider mb-0.5">Active Partners</p>
            <p className="text-2xl font-black text-slate-800 tracking-tight leading-none">
              {referredUsers.length} Users
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100/80 shadow-sm flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Gift size={24} />
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider mb-0.5">Earned Commission</p>
            <p className="text-2xl font-black text-slate-800 tracking-tight leading-none">{formatCurrency(totalEarnedCommission)}</p>
          </div>
        </div>
      </div>

      {/* Referrals table / list */}
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
          <div>
            <h4 className="font-extrabold text-slate-900">Your Referred Network</h4>
            <p className="text-xs text-slate-500 font-medium">Referred users who registered with your invitation link or code.</p>
          </div>
          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{referredUsers.length} Total</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 font-medium text-sm">Synchronizing referred friends list...</div>
        ) : referredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  <th className="p-4 pl-6">Client Name / Email</th>
                  <th className="p-4">Registration Date</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 pr-6 text-right">Commission Earned (2%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {referredUsers.map((refUser) => {
                  const comm = getCommissionFromUser(refUser.fullName);
                  return (
                    <tr key={refUser.uid} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="font-bold text-slate-800">{refUser.fullName}</div>
                        <div className="text-xs text-slate-400 font-medium">{refUser.email}</div>
                      </td>
                      <td className="p-4 text-slate-500 font-medium whitespace-nowrap text-xs">
                        {refUser.createdAt 
                          ? new Date(refUser.createdAt.seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                          : "Processing..."}
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-right font-extrabold text-blue-600 font-mono">
                        {formatCurrency(comm)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center space-y-4 max-w-sm mx-auto">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <Gift size={28} />
            </div>
            <div>
              <h5 className="font-extrabold text-slate-900">No Referrals Registered Yet</h5>
              <p className="text-xs text-slate-500 leading-relaxed font-semibold mt-1">
                Your partnership yields are empty. Copy your invitation link above and share it with friends to start earning recurring bonuses!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsSection({ user }: { user: UserProfile }) {
  const [phoneNumber, setPhoneNumber] = React.useState(user.phoneNumber || '');
  const [transactionPin, setTransactionPin] = React.useState(user.transactionPin || '');
  const [isUpdating, setIsUpdating] = React.useState(false);

  const handleUpdateSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transactionPin && (transactionPin.length !== 4 || !/^\d+$/.test(transactionPin))) {
      toast.error("Transaction PIN must be exactly 4 numeric digits!");
      return;
    }
    if (phoneNumber && (phoneNumber.length < 10 || phoneNumber.length > 11)) {
      toast.error("Please enter a valid Nigerian Phone Number (10 or 11 digits)!");
      return;
    }

    setIsUpdating(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        phoneNumber,
        transactionPin
      }, { merge: true });
      toast.success("Security profile updated successfully! 🔐");
    } catch (error: any) {
      toast.error("Failed to update security credentials: " + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl font-sans">
      <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-50 shadow-sm">
        {/* Profile Information Block */}
        <div className="p-8">
          <h3 className="font-extrabold text-xl mb-6 text-slate-900 uppercase tracking-tight">Profile Information</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-400 ml-1">Full Identity Name</label>
                <input readOnly value={user.fullName} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 select-all focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-400 ml-1">Secure Email Address</label>
                <input readOnly value={user.email} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 select-all focus:outline-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Security & Credentials Update Form */}
        <form onSubmit={handleUpdateSecurity} className="p-8 space-y-6">
          <div>
            <h3 className="font-extrabold text-xl mb-1 text-slate-900 uppercase tracking-tight">Security Credentials</h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Keep your communication and payment codes synchronized.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-slate-500 ml-1 flex justify-between">
                <span>Phone Number</span>
                {phoneNumber && <span className="text-[9px] font-mono text-slate-400">{phoneNumber.length}/11 Digits</span>}
              </label>
              <input 
                type="tel"
                maxLength={11}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 08123456789" 
                className="w-full bg-slate-50 border-2 border-slate-100 hover:border-slate-200 focus:border-black rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-black/10 transition-all text-black"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-slate-500 ml-1 flex justify-between">
                <span>Transaction PIN (4-Digits) 🔑</span>
                {transactionPin && <span className="text-[9px] font-mono text-emerald-600 font-bold">Configured</span>}
              </label>
              <input 
                type="password"
                maxLength={4}
                value={transactionPin}
                onChange={(e) => setTransactionPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4-digit security PIN" 
                className="w-full bg-slate-50 border-2 border-slate-100 hover:border-slate-200 focus:border-black rounded-xl px-4 py-3 text-xs font-black tracking-widest focus:outline-none focus:ring-1 focus:ring-black/10 transition-all text-black"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isUpdating}
              className="bg-black hover:bg-slate-900 text-white font-black text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl shadow-[3px_3px_0px_0px_rgba(30,41,59,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(30,41,59,1)] transition-all cursor-pointer disabled:opacity-50 select-none text-center"
            >
              {isUpdating ? "Saving Changes..." : "Secure Update Profile"}
            </button>
          </div>
        </form>
        
        {user.role === 'user' && (
          <div className="p-8">
            <h3 className="font-extrabold text-xl mb-1 text-indigo-600 uppercase tracking-tight">Upgrade to Reseller</h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-6">Get data bundles at discounted wholesale prices and earn more profits.</p>
            <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-slate-900">Premium Reseller Account</p>
                <p className="text-xs text-slate-600 font-bold font-mono">ONE-TIME UPGRADE FEE: ₦2,500.00</p>
              </div>
              <button className="bg-indigo-600 hover:bg-indigo-505 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-100 cursor-pointer">
                Upgrade Now
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 p-8 space-y-4 shadow-sm">
        <h3 className="font-extrabold text-xl text-rose-600 uppercase tracking-tight">Danger Zone</h3>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wide leading-relaxed">Once you terminate or wipe your account portfolio data inside our system, there is no recovering it. Please exercise caution.</p>
        <button className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider border border-rose-200 transition-all cursor-pointer">
          Wipe Client Portfolio Account
        </button>
      </div>
    </div>
  );
}

function DashboardOverview({ 
  user, 
  setTab, 
  transactions, 
  onSelectTx
}: { 
  user: UserProfile, 
  setTab: (tab: string, serviceId?: any) => void, 
  transactions: Transaction[], 
  onSelectTx?: (tx: Transaction) => void
}) {
  const { setSimulatedUser } = useAuth();
  const [plans, setPlans] = React.useState<ServicePlan[]>([]);
  const [selectedNetwork, setSelectedNetwork] = React.useState<'All' | NetworkType>('All');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('ALL');
  const [selectedPlan, setSelectedPlan] = React.useState<ServicePlan | null>(null);
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // New Airtime State hooks
  const [serviceType, setServiceType] = React.useState<'data' | 'airtime'>('data');
  const [airtimeNetwork, setAirtimeNetwork] = React.useState<NetworkType | null>(null);
  const [airtimePhone, setAirtimePhone] = React.useState('');
  const [airtimeAmount, setAirtimeAmount] = React.useState('');
  const [isBuyingAirtime, setIsBuyingAirtime] = React.useState(false);
  const [showAirtimeConfirmModal, setShowAirtimeConfirmModal] = React.useState(false);

  const [currentBalance, setCurrentBalance] = React.useState(user?.wallet_balance || user?.balance || 0);
  const [isUpdating, setIsUpdating] = React.useState(false);

  React.useEffect(() => {
    setCurrentBalance(user?.wallet_balance || user?.balance || 0);
  }, [user?.wallet_balance, user?.balance]);

  // Refresh balance from server
  const refreshBalance = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', authUser.id)
      .single();

    if (profile) {
      setCurrentBalance(profile.wallet_balance || 0);
    }
  };

  // Optimistic purchase
  const handleBuyData = async (phone: string, amount: number, network: string | number) => {
    setIsUpdating(true);
    const oldBalance = currentBalance;

    // Optimistic update
    setCurrentBalance(prev => Math.max(0, prev - amount));

    try {
      const result = await purchaseAirtime(user.uid, phone, amount, network);
      toast.success("Recharge successful!");
      return result;
    } catch (error: any) {
      setCurrentBalance(oldBalance); // rollback
      toast.error(error.message || "Transaction failed");
      throw error;
    } finally {
      setIsUpdating(false);
      setTimeout(refreshBalance, 1200); // final sync
    }
  };

  // Secure Flutterwave State declarations
  const [showFundModal, setShowFundModal] = React.useState(false);
  const [fundingTab, setFundingTab] = React.useState<'paystack' | 'flutterwave'>('flutterwave');
  const [opayAmount, setOpayAmount] = React.useState('2000');
  const [opayLoading, setOpayLoading] = React.useState(false);
  const [fwLoading, setFwLoading] = React.useState(false);

  const handleFlutterwaveFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(opayAmount);
    if (!amt || amt <= 0) {
      toast.error("Please enter a valid funding amount");
      return;
    }
    setFwLoading(true);

    const reference = `NOR-FW-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Dynamically load Flutterwave custom checkout Production script (Explicitly targeted)
    const loadScript = (): Promise<boolean> => {
      return new Promise((resolve) => {
        if ((window as any).FlutterwaveCheckout) {
          resolve(true);
          return;
        }
        const script = document.createElement("script");
        script.src = "https://checkout.flutterwave.com/v3.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
      });
    };

    const scriptLoaded = await loadScript();
    if (!scriptLoaded) {
      toast.error(
        "Flutterwave failed to load! If you are using Brave Browser, an adblocker (like uBlock), AdGuard DNS, or a VPN, please temporarily disable them, refresh the page, and try again.",
        { duration: 10000 }
      );
      setFwLoading(false);
      return;
    }

    try {
      // 1. Fetch live public key from server configuration helper
      const pKeyResp = await fetch('/api/v1/payment/config').catch(() => null);
      let flutterwavePublicKey = '';
      if (pKeyResp && pKeyResp.ok) {
        const configData = await pKeyResp.json();
        flutterwavePublicKey = configData.flutterwavePublicKey || '';
      }

      // Fallback fallback fallback to client-side env variable if server key not configured
      if (!flutterwavePublicKey) {
        flutterwavePublicKey = (import.meta as any).env?.VITE_FLUTTERWAVE_PUBLIC_KEY || 'FLWPUBK_TEST-xxxxxxxxxxxxxxxxxxxxxxxx-X';
      }

      // Strip accidental quotes and whitespace
      flutterwavePublicKey = flutterwavePublicKey.replace(/^["']|["']$/g, "").trim();

      // Format validation for Flutterwave key to prevent misconfigurations
      if (flutterwavePublicKey.startsWith("FLWSECK")) {
        setFwLoading(false);
        toast.error("SECURITY WARNING: You have configured a Flutterwave SECRET key (FLWSECK-) instead of a PUBLIC key! Flutterwave Checkout only accepts the PUBLIC key in the frontend. Please verify your Railway dashboard environment variables.", {
          duration: 10000
        });
        return;
      }

      if (flutterwavePublicKey.startsWith("pk_") || flutterwavePublicKey.startsWith("sk_")) {
        setFwLoading(false);
        toast.error("CONFIGURATION ERROR: You configured a Paystack key under your Flutterwave setting! Please replace 'FLUTTERWAVE_PUBLIC_KEY' in your secrets dashboard with a real Flutterwave PUBLIC key (starts with 'FLWPUBK-').", {
          duration: 10000
        });
        return;
      }

      if (!flutterwavePublicKey.startsWith("FLWPUBK") && flutterwavePublicKey !== 'FLWPUBK_TEST-xxxxxxxxxxxxxxxxxxxxxxxx-X') {
        setFwLoading(false);
        toast.error(`INVALID KEY FORMAT: Your Flutterwave Public Key starts with '${flutterwavePublicKey.substring(0, 10)}...'. A valid public key must start with 'FLWPUBK-'. Please correct this in your Railway environment settings.`, {
          duration: 10000
        });
        return;
      }

      if (!flutterwavePublicKey || flutterwavePublicKey.includes("PASTE_YOUR") || flutterwavePublicKey.includes("xxxxxxxxxxxx") || flutterwavePublicKey.includes("FLWPUBK_TEST-xxxx")) {
        setFwLoading(false);
        toast.error("Flutterwave Public Key is not configured. Please add a valid 'FLUTTERWAVE_PUBLIC_KEY' in your Secrets settings under the App Settings.", {
          duration: 8000
        });
        return;
      }

      const verifyFlutterwavePaymentOnServer = async (transactionId: string) => {
        setFwLoading(false);
        toast.loading("Processing wallet credit on client side...", { id: "fw-verify-loader" });
        try {
          const currentUserId = user.uid;
          const topUpAmount = amt;
          const updatedBalance = user.balance + topUpAmount;

          console.log(`[Frontend Wallet Credit] Direct credit of ₦${topUpAmount} requested for user ${currentUserId}. New balance: ${updatedBalance}`);

          // 1. Hardcode a Direct Supabase Update for Testing / Live
          const { data: updateData, error: updateError } = await supabase
            .from('profiles')
            .update({ 
              wallet_balance: updatedBalance,
            })
            .eq('id', currentUserId);

          if (updateError) {
            console.error("Database failed to update profiles table:", updateError.message);
          } else {
            console.log("Wallet successfully updated in Supabase profiles!");
          }

          // 2. Direct Supabase Update for users table as backup
          try {
            await supabase
              .from('users')
              .update({ 
                balance: updatedBalance,
                wallet_balance: updatedBalance,
                available_balance: updatedBalance
              })
              .eq('id', currentUserId);
          } catch (err) {
            console.warn("Failed to update users table:", err);
          }

          // 3. Direct Supabase Update for accounts table as backup
          try {
            await supabase
              .from('accounts')
              .update({ 
                balance: updatedBalance,
                wallet_balance: updatedBalance,
                available_balance: updatedBalance
              })
              .eq('id', currentUserId);
          } catch (err) {
            console.warn("Failed to update accounts table:", err);
          }

          // 4. Force Firestore user document synchronization
          try {
            const { doc: fsDoc, updateDoc: fsUpdateDoc } = await import('firebase/firestore');
            const { db: fsDb } = await import('../lib/firebase');
            await fsUpdateDoc(fsDoc(fsDb, 'users', currentUserId), {
              balance: updatedBalance,
              wallet_balance: updatedBalance,
              available_balance: updatedBalance
            });
            console.log("Firestore user database updated direct from client callback!");
          } catch (fsErr) {
            console.warn("Firestore update skipped/failed:", fsErr);
          }

          // 5. Force State Refresh directly to sync visually
          const updatedProfile = {
            ...user,
            balance: updatedBalance,
            wallet_balance: updatedBalance,
            available_balance: updatedBalance
          };
          setSimulatedUser(updatedProfile);

          toast.dismiss("fw-verify-loader");
          toast.success(`Successfully topped-up ₦${topUpAmount.toLocaleString()} via Flutterwave!`, {
            duration: 7500,
            icon: '🚀'
          });

          setShowFundModal(false);
          setOpayAmount('2000');

          // Send verification in background for transaction logging, ignore return status
          fetch('/api/payments/verify-flutterwave', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              transactionId,
              reference,
              amount: topUpAmount,
              email: user.email,
              userId: user.uid
            })
          }).catch((err) => console.log("Background server billing process skipped:", err));

        } catch (err: any) {
          toast.dismiss("fw-verify-loader");
          console.error("Failed client-side balance update flow:", err);
          toast.error("Internal failure processing client-side transaction credit flow.");
        }
      };

      // 2. Invoke standard Flutterwave checkout popup modal inline client implementation
      try {
        (window as any).FlutterwaveCheckout({
          public_key: flutterwavePublicKey,
          tx_ref: reference,
          amount: amt,
          currency: "NGN",
          country: "NG",
          payment_options: "card, banktransfer",
          customer: {
            email: user.email,
            phone_number: (user as any).phone_number || (user as any).phone || user.phoneNumber || "08000000000",
            name: (user as any).name || (user as any).full_name || user.fullName || "Nooraya Customer"
          },
          customizations: {
            title: "Nooraya Digital VTU Wallet Funding",
            description: "Wallet balance top-up via Flutterwave Standard Gateway",
            logo: "https://checkout.flutterwave.com/assets/img/flutterwave-badge.svg",
          },
          callback: function (response: any) {
            console.log("[Flutterwave Inline Callback Response]:", response);
            if (response.status === "successful" || response.status === "success" || response.tx_ref) {
              const tranId = response.transaction_id || response.txid || "simulated";
              verifyFlutterwavePaymentOnServer(String(tranId));
            } else {
              setFwLoading(false);
              toast.error("Flutterwave payment process was not marked as successful.");
            }
          },
          onclose: function () {
            setFwLoading(false);
            toast("Flutterwave secure payment cancelled.", { icon: 'ℹ️' });
          }
        });
      } catch (checkoutErr: any) {
        console.error("Flutterwave checkout modal invocation failed:", String(checkoutErr));
        toast.error(`Flutterwave Checkout Error: ${checkoutErr.message || checkoutErr}`);
        setFwLoading(false);
      }

    } catch (err: any) {
      console.error("Flutterwave initialization/parameters error:", String(err));
      toast.error(`Flutterwave Initialization error: ${err.message}`);
      setFwLoading(false);
    }
  };

  const handlePaystackFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(opayAmount);
    if (!amt || amt <= 0) {
      toast.error("Please enter a valid funding amount");
      return;
    }
    setOpayLoading(true);

    const amountInKobo = amt * 100;
    const reference = `PSTK-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const paystackPop = (window as any).PaystackPop;
    if (!paystackPop) {
      toast.error("Paystack inline popup SDK script failed to load. Please verify your connection.");
      setOpayLoading(false);
      return;
    }

    try {
      // Dynamically load live Paystack public key from secure backend config endpoint
      const pKeyResp = await fetch('/api/v1/payment/config').catch(() => null);
      let paystackPublicKey = 'pk_live_your_actual_key_here'; // Default live seat if API has issue
      if (pKeyResp && pKeyResp.ok) {
        const configData = await pKeyResp.json();
        paystackPublicKey = configData.publicKey || configData.paystackPublicKey || paystackPublicKey;
      } else {
        // Look for client-side injected environment variables as robust fallback
        paystackPublicKey = ((import.meta as any).env?.VITE_PAYSTACK_LIVE_PUBLIC_KEY || (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY || paystackPublicKey);
      }

      // Strip accidental quotes and whitespace
      paystackPublicKey = paystackPublicKey.replace(/^["']|["']$/g, "").trim();

      // Format validation for Paystack key to prevent misconfigurations
      if (paystackPublicKey.startsWith("sk_")) {
        setOpayLoading(false);
        toast.error("SECURITY WARNING: You have configured a Paystack SECRET key (sk_-) instead of a PUBLIC key! Paystack Checkout only accepts the PUBLIC key in the frontend. Please verify your Railway dashboard environment variables.", {
          duration: 10000
        });
        return;
      }

      if (paystackPublicKey.startsWith("FLW")) {
        setOpayLoading(false);
        toast.error("CONFIGURATION ERROR: You configured a Flutterwave key under your Paystack setting! Please replace 'PAYSTACK_PUBLIC_KEY' in your secrets dashboard with a real Paystack PUBLIC key (starts with 'pk_').", {
          duration: 10000
        });
        return;
      }

      if (!paystackPublicKey.startsWith("pk_") && paystackPublicKey !== 'pk_live_your_actual_key_here') {
        setOpayLoading(false);
        toast.error(`INVALID KEY FORMAT: Your Paystack Public Key starts with '${paystackPublicKey.substring(0, 10)}...'. A valid public key must start with 'pk_live_'. Please correct this in your Railway environment settings.`, {
          duration: 10000
        });
        return;
      }

      if (!paystackPublicKey || paystackPublicKey.includes("actual_key") || paystackPublicKey.includes("xxxxxx") || paystackPublicKey.includes("PASTE_YOUR")) {
        setOpayLoading(false);
        toast.error("Paystack Public Key is not configured. Please add a valid 'PAYSTACK_PUBLIC_KEY' in your Secrets settings under the App Settings.", {
          duration: 8000
        });
        return;
      }

      const verifyPayment = async (referenceCode: string) => {
        setOpayLoading(false);
        toast.loading("Verifying transaction securely...", { id: "paystack-loader" });
        try {
          const res = await fetch('/api/v1/payment-webhook', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-paystack-signature': 'local-bypass'
            },
            body: JSON.stringify({
              event: 'charge.success',
              data: {
                reference: referenceCode,
                amount: amountInKobo,
                customer: {
                  email: user.email
                },
                status: 'success',
                metadata: {
                  userId: user.uid
                }
              },
              userId: user.uid
            })
          });

          const data = await res.json().catch(() => ({}));
          toast.dismiss("paystack-loader");

          if (res.ok) {
            toast.success(`Successfully topped-up ₦${amt.toLocaleString()} via Paystack!`, {
              duration: 6500,
              icon: '🎉'
            });

            // Trigger instant dashboard UI refresh for simulated users
            if (localStorage.getItem('vtu_simulated_user')) {
              const updatedProfile = {
                ...user,
                balance: user.balance + amt,
                wallet_balance: (user.wallet_balance || 0) + amt,
                available_balance: (user.available_balance || 0) + amt
              };
              setSimulatedUser(updatedProfile);
            }

            setShowFundModal(false);
            setOpayAmount('2000');
          } else {
            toast.error(data.error || "Verification response from backend returned an error.");
          }
        } catch (err) {
          toast.dismiss("paystack-loader");
          toast.error("Error communicating with servers for transaction validation.");
        }
      };

      function handleWalletCredit(ref: any) {
        if (!ref) {
          toast.error("No transaction reference received from Paystack secure tunnel.");
          return;
        }
        const txRef = ref.reference || ref.trxref || (typeof ref === 'string' ? ref : "");
        if (txRef) {
          verifyPayment(txRef);
        } else {
          verifyPayment(ref);
        }
      }

      const handler = paystackPop.setup({
        key: paystackPublicKey,
        email: user.email,
        amount: amountInKobo,
        currency: 'NGN',
        ref: reference,
        callback: function(ref: any) { handleWalletCredit(ref); },
        onSuccess: function(ref: any) { handleWalletCredit(ref); },
        onClose: function() {
          setOpayLoading(false);
          toast.error("Paystack checkout cancelled by user.");
        }
      });

      handler.openIframe();
    } catch (err: any) {
      toast.error(`Paystack initialization issue: ${err.message}`);
      setOpayLoading(false);
    }
  };

  // Monnify simulator transfer completely dropped

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentResult = params.get('payment');
    const ref = params.get('ref');
    const amt = params.get('amount');

    if (paymentResult === 'success' && ref) {
      toast.success(`Successfully funded wallet with ${formatCurrency(Number(amt || 0))}!`, {
        duration: 5000,
        icon: '🎉'
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentResult === 'cancelled') {
      toast.error("OPay checkout cancelled by user.", { duration: 4500 });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleOpenFundModal = (forceRef: boolean = false) => {
    setShowFundModal(true);
  };

  const handleDeductWallet = async () => {
    const isSimulated = localStorage.getItem('vtu_simulated_user') !== null;
    toast.loading("Adjusting balance to ₦0...", { id: 'deduct-wallet-loader' });
    
    try {
      if (isSimulated) {
        const stored = localStorage.getItem('vtu_simulated_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.balance = 0;
          setSimulatedUser(parsed);
        }
        toast.dismiss('deduct-wallet-loader');
        toast.success("Simulated balance successfully set to ₦0!", { icon: '💸' });
      } else {
        const response = await fetch('/api/wallet/reset-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            targetBalance: 0
          })
        });
        
        const res = await response.json();
        toast.dismiss('deduct-wallet-loader');
        if (response.ok && res.success) {
          toast.success("Deduction successful! Wallet balance is now ₦0.", { icon: '💸' });
        } else {
          toast.error("Failed to adjust wallet balance: " + (res.error || "Internal Error"));
        }
      }
    } catch (err: any) {
      toast.dismiss('deduct-wallet-loader');
      toast.error("Network Error: " + err.message);
    }
  };



  // Daily Lucky Spin system hooks & logic
  const [spinning, setSpinning] = React.useState(false);
  const [lastSpinTime, setLastSpinTime] = React.useState<number | null>(null);
  const [spinResult, setSpinResult] = React.useState<string | null>(null);
  const [timeLeftToSpin, setTimeLeftToSpin] = React.useState<string>('');

  React.useEffect(() => {
    const key = `noroya_last_spin_${user.uid}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      setLastSpinTime(Number(stored));
    }
  }, [user.uid]);

  React.useEffect(() => {
    if (!lastSpinTime) {
      setTimeLeftToSpin('');
      return;
    }
    const updateTimer = () => {
      const now = Date.now();
      const nextAllowed = lastSpinTime + 24 * 60 * 60 * 1000;
      const diff = nextAllowed - now;
      if (diff <= 0) {
        setLastSpinTime(null);
        localStorage.removeItem(`noroya_last_spin_${user.uid}`);
        setTimeLeftToSpin('');
      } else {
        const hrs = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (100 * 60)) / 1000); // fix typo, modulo 60
        const correctedSecs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeftToSpin(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${correctedSecs.toString().padStart(2, '0')}`);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lastSpinTime, user.uid]);

  const handleSpinWheel = async () => {
    if (lastSpinTime && (Date.now() - lastSpinTime < 24 * 60 * 60 * 1000)) {
      toast.error("Daily spin already claimed. See you tomorrow!");
      return;
    }

    setSpinning(true);
    setSpinResult(null);

    // Dynamic, weighted payouts (₦10 - ₦250)
    const rewards = [
      { amount: 10, label: "₦10.00 Cash", weight: 0.50 },
      { amount: 20, label: "₦20.00 Cashback", weight: 0.25 },
      { amount: 55, label: "₦55.00 Lucky Cash", weight: 0.15 },
      { amount: 100, label: "₦100.00 Super Jackpot", weight: 0.08 },
      { amount: 250, label: "₦250.00 Mega Cash", weight: 0.02 }
    ];

    const r = Math.random();
    let sum = 0;
    let selectedReward = rewards[0];
    for (const reward of rewards) {
      sum += reward.weight;
      if (r <= sum) {
        selectedReward = reward;
        break;
      }
    }

    // Interactive rotation feeling delay (1.8s)
    await new Promise(resolve => setTimeout(resolve, 1800));

    try {
      const response = await fetch('/api/vtu/daily-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          wonAmount: selectedReward.amount
        })
      });

      if (response.ok) {
        setSpinResult(selectedReward.label);
        const now = Date.now();
        setLastSpinTime(now);
        localStorage.setItem(`noroya_last_spin_${user.uid}`, String(now));
        toast.success(`You won ${selectedReward.label}! Added instantly to balance.`);
      } else {
        const errData = await response.json();
        toast.error(errData.error || "Rewards network busy, please trigger spin again!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to register bonus payout.");
    } finally {
      setSpinning(false);
    }
  };

  // Subscribe to service plans from Firestore
  React.useEffect(() => {
    console.log("Attempting to connect to Firestore collection: 'data_plans'...");
    const q = query(collection(db, "data_plans"));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log(`Firestore metadata: metadata.fromCache = ${querySnapshot.metadata.fromCache}`);
      const plansList: ServicePlan[] = [];
      const now = new Date();
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        let expiresAtDate: Date | null = null;
        if (data.expiresAt) {
          if (typeof data.expiresAt.toDate === 'function') {
            expiresAtDate = data.expiresAt.toDate();
          } else {
            expiresAtDate = new Date(data.expiresAt);
          }
        }
        
        if (!expiresAtDate || expiresAtDate > now) {
          const name = data.plan_name || data.name || data.planName || `${data.network_type || data.network || ''} Plan`;
          const price = Number(data.retail_price || data.price || data.amount || 0);
          const network = String(data.network_type || data.network || 'MTN').toUpperCase();
          const type = data.type || 'data';

          const pt = String(data.planType || data.plan_category || '').toUpperCase();
          const pNameUpper = String(name).toUpperCase();
          let planCategory = "GIFTING";
          if (pt.includes("SME") || pNameUpper.includes("SME")) {
            planCategory = "SME";
          } else if (pt.includes("CG") || pt.includes("CORPORATE") || pNameUpper.includes("CG") || pNameUpper.includes("CORPORATE")) {
            planCategory = "CG";
          }

          plansList.push({
            id: doc.id,
            ...data,
            name,
            plan_name: name,
            price,
            retail_price: price,
            amount: price,
            network_type: network,
            network: network,
            plan_category: planCategory,
            planType: planCategory,
            type
          } as any);
        }
      });

      console.log(`Successfully loaded ${plansList.length} un-expired plans in Dashboard from Firestore:`, plansList);
      setPlans(plansList);
    }, (error) => {
      console.error("CRITICAL FIRESTORE ERROR UNABLE TO READ DATA:", error.code, error.message);
    });

    return () => unsubscribe();
  }, []);

  // Filter plans to display in client buy data screen with robust case-insensitive matching & 7-day lifespans
  const filteredPlans = plans.filter(plan => {
    const isNetworkMatch = selectedNetwork === 'All' || !selectedNetwork || plan.network_type?.toUpperCase() === selectedNetwork?.toUpperCase();
    const isCategoryMatch = selectedCategory?.toUpperCase() === 'ALL' || plan.plan_category?.toUpperCase() === selectedCategory?.toUpperCase();
    
    // Expired plan filtering
    let isExpired = false;
    if (plan.expiresAt) {
      let expiryTime: number;
      if (plan.expiresAt && plan.expiresAt.seconds) {
        expiryTime = plan.expiresAt.seconds * 1000;
      } else {
        expiryTime = new Date(plan.expiresAt).getTime();
      }
      if (!isNaN(expiryTime) && expiryTime < Date.now()) {
        isExpired = true;
      }
    }

    return isNetworkMatch && isCategoryMatch && !isExpired;
  });

  const handleInstantPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    
    if (phoneNumber.trim().length < 10) {
      toast.error("Please enter a valid phone number (at least 10 digits)");
      return;
    }

    if (user.balance < selectedPlan.price) {
      toast.error("Insufficient wallet balance. Please fund your wallet first.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/vtu/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.uid,
          type: 'data',
          network: selectedPlan.network,
          phoneNumber: phoneNumber.trim(),
          plan: selectedPlan.name,
          amount: selectedPlan.price
        })
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(`Purchase successful! ${selectedPlan.name} sent to ${phoneNumber}`);
        setSelectedPlan(null);
        setPhoneNumber('');
      } else {
        toast.error(data.error || "Purchase failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to complete purchase. Check server logs or network status.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInstantAirtimePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!airtimeNetwork) {
      toast.error("Please select a network carrier.");
      return;
    }
    const amt = Number(airtimeAmount);
    if (!amt || amt <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    if (airtimePhone.trim().length < 10) {
      toast.error("Please enter a valid phone number (at least 10 digits)");
      return;
    }
    if (user.balance < amt) {
      toast.error("Insufficient wallet balance. Please fund your wallet first.");
      return;
    }

    setIsBuyingAirtime(true);
    try {
      const response = await fetch('/api/vtu/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.uid,
          type: 'airtime',
          network: airtimeNetwork,
          phoneNumber: airtimePhone.trim(),
          plan: `${airtimeNetwork} Airtime`,
          amount: amt
        })
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(`Airtime purchase successful! ₦${amt} airtime sent to ${airtimePhone}`);
        setAirtimeNetwork(null);
        setAirtimePhone('');
        setAirtimeAmount('');
        setShowAirtimeConfirmModal(false);
      } else {
        toast.error(data.error || "Airtime purchase failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to complete purchase. Check server logs or network status.");
    } finally {
      setIsBuyingAirtime(false);
    }
  };

  const getCarrierStyles = (network: string) => {
    const netUpper = String(network || '').toUpperCase();
    switch (netUpper) {
      case 'MTN':
        return {
          bg: 'bg-yellow-50/70 border-yellow-300 text-yellow-800',
          badge: 'bg-yellow-400 text-slate-900',
          hover: 'hover:border-yellow-400 hover:shadow-yellow-50'
        };
      case 'AIRTEL':
        return {
          bg: 'bg-red-50/70 border-red-200 text-red-800',
          badge: 'bg-red-600 text-white',
          hover: 'hover:border-red-400 hover:shadow-red-50'
        };
      case 'GLO':
        return {
          bg: 'bg-green-50/70 border-green-200 text-green-800',
          badge: 'bg-green-600 text-white',
          hover: 'hover:border-green-400 hover:shadow-green-50'
        };
      case '9MOBILE':
        return {
          bg: 'bg-emerald-50/70 border-emerald-200 text-emerald-800',
          badge: 'bg-emerald-800 text-white',
          hover: 'hover:border-emerald-400 hover:shadow-emerald-50'
        };
      default:
        return {
          bg: 'bg-slate-50 border-slate-200 text-slate-800',
          badge: 'bg-slate-500 text-white',
          hover: 'hover:border-slate-300'
        };
    }
  };

  return (
    <div className="space-y-8">
      {/* Wallet Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Wallet Card */}
        <div className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[220px] transition-all duration-300 hover:shadow-2xl hover:-translate-y-0.5" id="vtu_wallet_card">
          <div className="relative z-10">
            <span className="bg-amber-400 text-slate-900 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider block w-fit mb-4">
              💰 Account Liquid Assets
            </span>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Available Balance</p>
            <h3 className="text-4xl font-extrabold tracking-tight mb-6 text-white">
              {formatCurrency(currentBalance)}
              {isUpdating && <span className="text-sm ml-2 animate-pulse"> → Updating</span>}
            </h3>
          </div>
          
          <div className="relative z-10 flex gap-3 flex-wrap">
            <button 
              onClick={() => handleOpenFundModal()} 
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-blue-900/30 select-none cursor-pointer"
            >
              <ArrowDownLeft size={16} /> Fund Wallet
            </button>
            <button 
              onClick={() => toast("Wallet transfer triggers are active under user settings.", { icon: 'ℹ️', duration: 3000 })} 
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition-all select-none cursor-pointer"
            >
              Transfer
            </button>
          </div>
          
          <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-blue-600/10 rounded-full border border-white/5 pointer-events-none" />
        </div>

        {/* Referrals Card */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-6 text-slate-800 shadow-md flex flex-col justify-between min-h-[220px] transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
          <div className="flex justify-between items-start">
            <div>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider block w-fit mb-3">
                📈 Referral Earnings
              </span>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Commissions</p>
              <h3 className="text-2xl font-black text-slate-900">
                {formatCurrency(
                  transactions
                    .filter(t => t.type === 'funding' && t.description.includes('Referral Commission'))
                    .reduce((sum, t) => sum + t.amount, 0)
                )}
              </h3>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <Users className="text-slate-705 text-slate-705" size={20} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-2">Personal Referral Code</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-mono font-black text-slate-800 select-all tracking-wider text-center flex items-center justify-center">
                {user.referralCode}
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(user.referralCode);
                  toast.success("Referral code copied to clipboard!");
                }} 
                className="bg-slate-900 text-white hover:bg-slate-800 px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Copy
              </button>
            </div>
          </div>
        </div>

        {/* Daily Lucky Spin Card */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-[2rem] p-6 text-slate-800 shadow-md relative overflow-hidden flex flex-col justify-between min-h-[220px] transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex justify-between items-start">
              <div>
                <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider block w-fit mb-2 flex items-center gap-1">
                  <span className="animate-pulse">🎁</span> Daily Free Reward
                </span>
                <h3 className="text-lg font-black tracking-tight text-slate-900">Lucky Spin Wheel</h3>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-amber-100">
                <Gift className="text-amber-600 animate-bounce" size={20} />
              </div>
            </div>

            {/* Spinner display feedback */}
            <div className="my-3 flex flex-col items-center justify-center min-h-[60px]">
              {spinning ? (
                <div className="flex flex-col items-center space-y-1">
                  <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-[11px] text-amber-700 font-bold animate-pulse">Spinning the lucky wheel...</p>
                </div>
              ) : spinResult ? (
                <div className="text-center animate-bounce">
                  <p className="text-[10px] text-amber-600 font-extrabold uppercase tracking-wider">Congratulations!</p>
                  <p className="text-xl font-extrabold text-amber-700 leading-tight mt-1">{spinResult}</p>
                </div>
              ) : timeLeftToSpin ? (
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Next spin unlocks in</p>
                  <p className="text-xl font-mono font-black text-slate-700 tracking-widest mt-1">{timeLeftToSpin}</p>
                </div>
              ) : (
                <div className="text-center px-2">
                  <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                    Get up to <strong>₦250.00</strong> free wallet bonus today! Processes instantly.
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={spinning || !!timeLeftToSpin}
              onClick={handleSpinWheel}
              className={cn(
                "w-full font-black rounded-xl py-3 text-xs uppercase tracking-wider transition-all select-none border cursor-pointer",
                spinning 
                  ? "bg-slate-200 text-slate-400 border-slate-200 cursor-not-allowed shadow-none" 
                  : timeLeftToSpin 
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed shadow-none" 
                    : "bg-[#FFCC00] text-black hover:bg-yellow-400 border-yellow-400 hover:shadow-md"
              )}
            >
              {spinning ? "Spinning..." : timeLeftToSpin ? "Locked for today" : "Spin & Claim Cash"}
            </button>
          </div>
        </div>
      </div>

      {/* WhatsApp Live Support desk */}
      <div className="bg-[#DCFCE7] border border-green-200 rounded-[2rem] p-6 text-slate-800 shadow-md flex flex-col md:flex-row items-center justify-between gap-4 select-none transition-all duration-300 hover:shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center text-white text-xl shrink-0">
            💬
          </div>
          <div className="text-left font-sans">
            <h4 className="font-sans font-extrabold text-slate-900 text-sm uppercase tracking-wider leading-snug">Nooraya Live customer support</h4>
            <p className="text-[11px] text-slate-500 font-bold uppercase mt-0.5">Need immediate assistance, have order queries, or require help? We are online.</p>
          </div>
        </div>
        <a
          href="https://wa.me/2348143889102?text=Hello%20Nooraya%20Support,%20I%20need%20help%20with..."
          target="_blank"
          rel="noopener noreferrer"
          className="w-full md:w-auto bg-[#25D366] hover:bg-[#20ba5a] text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-center inline-flex justify-center items-center gap-1.5 no-underline shadow-md shadow-green-200/50 hover:-translate-y-0.5"
        >
          💬 CHAT WITH SUPPORT ON WHATSAPP
        </a>
      </div>

      {/* Available Data & Airtime Purchases Tabbed Section */}
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setServiceType('data')}
              className={cn(
                "px-5 py-2.5 rounded-2xl text-sm font-extrabold transition-all flex items-center gap-2 border",
                serviceType === 'data' 
                  ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100" 
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              <Smartphone size={16} /> Data Bundles
            </button>
            <button
              onClick={() => setServiceType('airtime')}
              className={cn(
                "px-5 py-2.5 rounded-2xl text-sm font-extrabold transition-all flex items-center gap-2 border",
                serviceType === 'airtime' 
                  ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100" 
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              <Zap size={16} /> Airtime Top-Up
            </button>
          </div>

          {serviceType === 'data' && (
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-center">
              {/* Network Carrier Filter Tabs */}
              <div className="flex flex-wrap gap-2 bg-slate-100/80 p-1 rounded-2xl border border-slate-200">
                {(['All', 'MTN', 'Airtel', 'Glo', '9mobile'] as const).map((networkOpt) => (
                  <button
                    key={networkOpt}
                    type="button"
                    onClick={() => setSelectedNetwork(networkOpt)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      selectedNetwork?.toUpperCase() === networkOpt.toUpperCase()
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-650 hover:text-slate-900"
                    )}
                  >
                    {networkOpt}
                  </button>
                ))}
              </div>

              {/* Plan Category Filter Tabs */}
              <div className="flex flex-wrap gap-2 bg-blue-50/60 p-1 rounded-2xl border border-blue-100/30">
                {(['ALL', 'SME', 'GIFTING', 'CG'] as const).map((catOpt) => (
                  <button
                    key={catOpt}
                    type="button"
                    onClick={() => setSelectedCategory(catOpt)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-extrabold transition-all tracking-tight",
                      selectedCategory === catOpt
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-blue-700/80 hover:text-blue-950"
                    )}
                  >
                    {catOpt === 'CG' ? 'Corporate Gifting (CG)' : catOpt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {serviceType === 'data' ? (
          plans.length === 0 ? (
            <div className="bg-white rounded-[2rem] p-8 border border-slate-100 text-center space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <Database size={28} />
              </div>
              <div className="max-w-md mx-auto">
                <h4 className="font-bold text-lg">No Service Plans Available</h4>
                <p className="text-sm text-slate-500 mt-1">There are no data bundles available right now. Please check back later or add them manually in the admin panel.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPlans.map((plan) => {
                const theme = getCarrierStyles(plan.network);
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "bg-white border rounded-[2rem] p-6 transition-all flex flex-col justify-between cursor-pointer shadow-sm relative overflow-hidden group/card",
                      theme.hover
                    )}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className={cn("px-3 py-1 rounded-full text-[10px] font-black tracking-wide uppercase shadow-sm", theme.badge)}>
                          {plan.network}
                        </span>
                        <span className="text-xs text-slate-400 font-bold font-mono">
                          {plan.duration || '30 Days'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3.5">
                        <div className={cn(
                          "w-11 h-11 rounded-full flex items-center justify-center font-black text-xs tracking-tight shadow-sm shrink-0 border border-black/5",
                          plan.network === 'MTN' && "bg-yellow-400 text-slate-900",
                          plan.network === 'Airtel' && "bg-red-600 text-white",
                          plan.network === 'Glo' && "bg-green-600 text-white",
                          plan.network === '9mobile' && "bg-emerald-950 text-white"
                        )}>
                          {plan.network === '9mobile' ? '9m' : plan.network}
                        </div>
                        <div>
                          <h4 className="text-lg font-extrabold text-slate-900 tracking-tight group-hover/card:text-blue-600 transition-colors">
                            {plan.name}
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">High-speed network connection</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 mt-4 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Our Price</p>
                        <p className="text-2xl font-black text-slate-900 tracking-tight">
                          {formatCurrency(plan.price)}
                        </p>
                      </div>
                      <span className="bg-slate-100 text-slate-700 group-hover/card:bg-blue-600 group-hover/card:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1">
                        Buy Plan
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Instant Airtime Recharge Form Widget */
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm max-w-xl mx-auto space-y-6">
            <div>
              <h4 className="font-extrabold text-slate-900 text-xl tracking-tight">Instant Airtime Recharge</h4>
              <p className="text-xs text-slate-400 mt-1">Recharge any national carrier number securely using your wallet balance.</p>
            </div>

            <form 
              onSubmit={(e) => { 
                e.preventDefault(); 
                if (!airtimeNetwork) {
                  toast.error("Please select a network carrier.");
                  return;
                }
                const amt = Number(airtimeAmount);
                if (!amt || amt <= 0) {
                  toast.error("Please enter a valid recharge amount.");
                  return;
                }
                if (airtimePhone.trim().length < 10) {
                  toast.error("Please enter a valid recipient phone number.");
                  return;
                }
                if (user.balance < amt) {
                  toast.error("Insufficient wallet balance.");
                  return;
                }
                setShowAirtimeConfirmModal(true); 
              }} 
              className="space-y-6"
            >
              {/* Select Carrier */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider block ml-1">Select Network carrier</label>
                <div className="grid grid-cols-4 gap-3">
                  {(['MTN', 'Airtel', 'Glo', '9mobile'] as const).map((nw) => {
                    const nwStyles = getCarrierStyles(nw);
                    const isSelected = airtimeNetwork === nw;
                    return (
                      <button
                        type="button"
                        key={nw}
                        onClick={() => setAirtimeNetwork(nw)}
                        className={cn(
                          "py-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 font-bold text-xs",
                          isSelected 
                            ? "border-blue-600 bg-blue-50/40 shadow-sm text-blue-600" 
                            : "border-slate-150 hover:border-slate-300 bg-slate-50/20 text-slate-600"
                        )}
                      >
                        <span className={cn("px-2.5 py-0.5 rounded-full text-[8.5px] font-black tracking-wide uppercase shadow-sm", nwStyles.badge)}>
                          {nw}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recipient Phone Number */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider block ml-1">Recipient Phone Number</label>
                <div className="relative font-sans">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Phone size={18} />
                  </div>
                  <input
                    required
                    type="tel"
                    placeholder="e.g. 08123456789"
                    value={airtimePhone}
                    onChange={(e) => setAirtimePhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-6 py-4 font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 text-lg"
                  />
                </div>
              </div>

              {/* Amount Inputs */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wider block ml-1">Recharge Amount (₦)</label>
                <div className="relative font-sans">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 font-bold text-slate-450 text-slate-400 text-lg">₦</span>
                  <input
                    required
                    type="number"
                    min="50"
                    max="50000"
                    placeholder="100 - 50,000"
                    value={airtimeAmount}
                    onChange={(e) => setAirtimeAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-6 py-4 font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 text-lg"
                  />
                </div>

                {/* Quick amount chips */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {[100, 200, 500, 1000, 2000, 5000].map((amt) => (
                    <button
                      type="button"
                      key={amt}
                      onClick={() => setAirtimeAmount(String(amt))}
                      className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-705 text-slate-700 rounded-xl text-xs font-bold transition-all"
                    >
                      ₦{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Balance Check Summary */}
              {airtimeAmount && Number(airtimeAmount) > 0 && (
                <div className={cn(
                  "flex items-center gap-3 p-4 rounded-xl text-xs border font-sans",
                  user.balance >= Number(airtimeAmount) 
                    ? "bg-green-50/50 border-green-200 text-green-805 text-green-800" 
                    : "bg-rose-50/50 border-rose-200 text-rose-805 text-rose-800"
                )}>
                  <AlertCircle size={18} className={cn("flex-shrink-0", user.balance >= Number(airtimeAmount) ? "text-green-650" : "text-rose-650")} />
                  <div>
                    <p className="font-bold">Transaction Pre-check</p>
                    <p className="text-[11px] opacity-90 mt-0.5 font-semibold">
                      Your balance: <strong>{formatCurrency(user.balance)}</strong>. 
                      {user.balance >= Number(airtimeAmount) 
                        ? " Sufficient wallet funds available to complete." 
                        : " Warning: Insufficient balance. Please fund wallet first."
                      }
                    </p>
                  </div>
                </div>
              )}

              {/* Pay Button */}
              <button
                type="submit"
                disabled={!airtimeNetwork || !airtimePhone || !airtimeAmount || Number(airtimeAmount) <= 0 || user.balance < Number(airtimeAmount)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl py-4 transition-all shadow-xl shadow-blue-100 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
              >
                Continue to Payment
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Modern Services Grid */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-[0.1em] mb-4 text-slate-800 flex items-center gap-2">
          <span>⚡</span> Quick Billing Services
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
          <QuickAction onClick={() => setTab('buy-data')} icon={<Wifi />} label="Data Bundles" color="blue" />
          <QuickAction onClick={() => setTab('buy-airtime')} icon={<Sparkles />} label="Airtime Top-Up" color="purple" />
          <QuickAction onClick={() => setTab('cable')} icon={<Monitor />} label="Cable TV" color="green" />
          <QuickAction onClick={() => setTab('electricity')} icon={<Lightbulb />} label="Electricity" color="amber" />
          <QuickAction onClick={() => setTab('bills', 'exam')} icon={<GraduationCap />} label="Exam PINs" color="orange" />
          <QuickAction onClick={() => setTab('betting')} icon={<Dices />} label="Betting Top-Up" color="red" />
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Recent Transactions</h3>
          <button onClick={() => setTab('history')} className="text-blue-600 text-sm font-bold hover:underline cursor-pointer">View All</button>
        </div>
        <div className="divide-y divide-slate-50">
          {transactions.slice(0, 4).map(tx => (
            <TransactionItem 
              key={tx.id}
              label={tx.description} 
              date={new Date(tx.createdAt).toLocaleDateString()} 
              amount={tx.type === 'funding' ? tx.amount : -tx.amount} 
              status={tx.status} 
              onClick={() => onSelectTx?.(tx)}
            />
          ))}
          {transactions.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">No recent transactions.</div>
          )}
        </div>
      </div>

      {/* Instant Select-Plan and Purchase Modal */}
      <AnimatePresence>
        {selectedPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPlan(null)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden relative border border-slate-100 shadow-2xl z-10"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white", {
                    'bg-yellow-400': selectedPlan.network === 'MTN',
                    'bg-red-600': selectedPlan.network === 'Airtel',
                    'bg-green-600': selectedPlan.network === 'Glo',
                    'bg-emerald-800': selectedPlan.network === '9mobile'
                  })}>
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900">Purchase {selectedPlan.network} Bundle</h4>
                    <p className="text-xs text-slate-400 font-medium font-sans">Fast automatic delivery</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedPlan(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleInstantPurchase} className="p-8 space-y-6">
                {/* Plan Info Details card */}
                <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Plan Name</p>
                    <p className="font-extrabold text-slate-800 text-lg">{selectedPlan.name}</p>
                    <p className="text-xs text-slate-500 font-sans">Duration: {selectedPlan.duration || '30 Days'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Price</p>
                    <p className="text-2xl font-black text-blue-600 tracking-tight font-sans">
                      {formatCurrency(selectedPlan.price)}
                    </p>
                  </div>
                </div>

                {/* Input Recipient Phone Number */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">Target Phone Number</label>
                  <div className="relative font-sans">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Phone size={18} />
                    </div>
                    <input
                      required
                      type="tel"
                      placeholder="e.g. 08123456789"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-6 py-4 font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 text-lg"
                    />
                  </div>
                </div>

                {/* Balance validation indicator */}
                <div className="flex items-center gap-3 p-4 rounded-xl text-xs bg-blue-50/50 border border-blue-100 text-blue-800">
                  <AlertCircle size={18} className="text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="font-bold font-sans">Wallet Balance Check</p>
                    <p className="text-[11px] text-blue-700/80 font-sans">
                      Current balance: <strong>{formatCurrency(user.balance)}</strong>. 
                      {user.balance >= selectedPlan.price ? " Balance is sufficient!" : " Insufficient balance. Please fund."}
                    </p>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting || user.balance < selectedPlan.price}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl py-4 transition-all shadow-xl shadow-blue-100 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                >
                  {isSubmitting ? "Processing Transaction..." : `Pay ${formatCurrency(selectedPlan.price)}`}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Airtime Confirmation Modal */}
        {showAirtimeConfirmModal && airtimeNetwork && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAirtimeConfirmModal(false)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden relative border border-slate-100 shadow-2xl z-10 p-6 space-y-6"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={24} />
                </div>
                <div className="space-y-1 bg-white">
                  <h4 className="font-extrabold text-slate-900 text-lg">Confirm Airtime Recharge</h4>
                  <p className="text-xs text-slate-500 font-medium">Please verify numbers and amounts carefully.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAirtimeConfirmModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors ml-auto"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3 font-sans">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Type</span>
                  <span className="font-extrabold text-slate-800">Airtime Purchase</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Network</span>
                  <span className="font-extrabold text-slate-800">{airtimeNetwork}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Phone</span>
                  <span className="font-mono font-extrabold text-slate-800">{airtimePhone}</span>
                </div>
                <div className="pt-3 border-t border-slate-200/60 flex justify-between items-center text-base">
                  <span className="text-slate-500 font-extrabold text-sm uppercase tracking-wider">Charge Amount</span>
                  <span className="text-xl font-black text-blue-600 tracking-tight">
                    {formatCurrency(Number(airtimeAmount))}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAirtimeConfirmModal(false)}
                  className="bg-slate-55 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl py-3.5 transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isBuyingAirtime}
                  onClick={handleInstantAirtimePurchase}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl py-3.5 transition-all shadow-lg shadow-blue-105 text-sm disabled:opacity-55"
                >
                  {isBuyingAirtime ? "Sending..." : "Confirm & Recharge"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Dynamic Paystack Automated Wallet Funding Modal */}
        {showFundModal && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            {/* Backdrop cover overlay */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowFundModal(false)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden relative border border-slate-100 shadow-2xl z-10"
            >
              {/* Header */}
              <div className="p-6 border-b-2 border-black flex justify-between items-center bg-[#DBE2EF]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border-2 border-black flex items-center justify-center text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <Wallet size={20} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 uppercase tracking-tight text-sm">
                      Select Payment Channel
                    </h4>
                    <p className="text-[10px] text-slate-700 font-bold uppercase tracking-wider">
                      Instantly credit your wallet balance
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowFundModal(false)}
                  className="p-2 border-2 border-black bg-white text-black hover:bg-slate-100 rounded-xl transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Accounts Content List */}
              <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto bg-white">
                <form onSubmit={handleFlutterwaveFundSubmit} className="space-y-6 font-sans">
                  <div className="text-slate-700 text-xs leading-relaxed font-bold bg-[#DBE2EF]/65 border-2 border-black p-4 rounded-xl shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
                    🦋 Fund your secure wallet instantly with **Flutterwave**. Your balance is credited automatically across our cloud nodes upon secure server validation.
                  </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">Top-up Amount (₦)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-700 font-black text-lg">₦</span>
                        <input
                          type="text"
                          required
                          value={opayAmount}
                          onChange={(e) => setOpayAmount(e.target.value.replace(/\D/g, ''))}
                          placeholder="e.g. 2000"
                          className="w-full bg-slate-50 border-2 border-black focus:border-[#5B21B6] rounded-xl py-4 pl-10 pr-4 font-mono font-extrabold text-slate-900 text-lg focus:outline-none transition-all placeholder:text-slate-350"
                        />
                      </div>
                    </div>

                    {/* Quick presets */}
                    <div className="grid grid-cols-4 gap-2">
                      {['1000', '2000', '5000', '10000'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setOpayAmount(preset)}
                          className={cn(
                            "py-2.5 px-1 text-xs font-black border-2 border-black rounded-xl transition-all font-mono cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                            opayAmount === preset
                              ? "bg-[#FFCC00] text-black"
                              : "bg-white text-slate-600 hover:text-slate-900"
                          )}
                        >
                          ₦{Number(preset).toLocaleString()}
                        </button>
                      ))}
                    </div>

                    {/* Balance forecast */}
                    <div className="p-4 rounded-xl bg-slate-50 border-2 border-black space-y-2 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-500 font-sans uppercase">Current Balance:</span>
                        <span className="font-extrabold font-mono text-slate-900">{formatCurrency(user.balance)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs border-t border-slate-250 pt-2 font-bold">
                        <span className="text-[#5B21B6] uppercase">Projected Balance:</span>
                        <span className="font-black font-mono text-[#5B21B6] text-sm">
                          {formatCurrency(user.balance + Number(opayAmount || 0))}
                        </span>
                      </div>
                    </div>

                    {/* Submit button */}
                    <button
                      type="submit"
                      disabled={fwLoading || !opayAmount || Number(opayAmount) <= 0}
                      className="w-full bg-black border-2 border-black hover:bg-slate-800 disabled:bg-slate-300 disabled:border-slate-300 text-white font-black uppercase tracking-wider py-4 rounded-xl transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer text-xs"
                    >
                      {fwLoading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          <span>INITIALIZING FLUTTERWAVE GATEWAY...</span>
                        </>
                      ) : (
                        <>
                          <span>🦋 INITIALIZE FLUTTERWAVE CHECKOUT</span>
                        </>
                      )}
                    </button>

                    {/* High-fidelity simulation trigger button when in sandbox environment */}
                    {(typeof process === 'undefined' || !process?.env || !process.env.FLUTTERWAVE_SECRET_KEY || String(process.env.FLUTTERWAVE_SECRET_KEY).includes("PASTE_YOUR")) && (
                      <button
                        type="button"
                        onClick={async () => {
                          setFwLoading(true);
                          const mockReference = `NOR-FW-SIM-${Date.now()}`;
                          try {
                            const res = await fetch('/api/payments/verify-flutterwave', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                transactionId: "simulated",
                                reference: mockReference,
                                amount: Number(opayAmount || 2000),
                                email: user.email
                              })
                            });
                            if (res.ok) {
                              toast.success(`[SANDBOX BYPASS] Successfully credited ₦${Number(opayAmount || 2000).toLocaleString()} to wallet!`, { icon: '🤖' });
                              setShowFundModal(false);
                            } else {
                              toast.error("Sandbox simulated trigger failed.");
                            }
                          } catch(e: any) {
                            toast.error("Sandbox simulation exception: " + e.message);
                          } finally {
                            setFwLoading(false);
                          }
                        }}
                        className="w-full text-center py-2.5 px-4 rounded-xl border-2 border-black border-dashed bg-slate-50 hover:bg-slate-100 font-extrabold text-[10px] text-slate-600 uppercase tracking-wider cursor-pointer active:translate-y-0.5 transition-all"
                      >
                        🤖 Run High-Fidelity Sandbox Funding Simulation
                      </button>
                    )}

                    <div className="flex items-center gap-3 p-4 rounded-xl text-xs bg-[#DBE2EF] border-2 border-black text-slate-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                      <AlertCircle size={18} className="text-[#5B21B6] flex-shrink-0" />
                      <div>
                        <p className="font-extrabold block">Instant Verification</p>
                        <p className="text-[10px] leading-relaxed font-bold text-slate-700">
                          Flutterwave verifies transactions live. Do not refresh or exit checkout mid-payment.
                        </p>
                      </div>
                    </div>
                  </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

const imgToast = (item: string) => {
  toast(`${item === 'cable' ? 'Cable TV decoder recharge' : 'Prepaid Electricity token purchase'} is coming soon!`, { id: item + '-toast', icon: 'ℹ️' });
};

function QuickAction({ icon, label, color, onClick }: { icon: React.ReactNode, label: string, color: string, onClick: () => void }) {
  const colorMap: any = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-green-50 text-green-600",
    purple: "bg-purple-100/60 text-purple-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <button 
      onClick={onClick} 
      className="flex flex-col items-center justify-between gap-3 p-5 rounded-[2rem] bg-white border border-slate-100 text-slate-800 shadow-sm hover:shadow-md hover:border-slate-200 transition-all group select-none cursor-pointer w-full"
    >
      <div className={cn("p-4 rounded-2xl font-bold tracking-wider group-hover:scale-105 transition-transform shrink-0", colorMap[color])}>
        {React.cloneElement(icon as React.ReactElement, { size: 24 })}
      </div>
      <span className="text-xs font-extrabold uppercase tracking-wider text-center block mt-1 leading-tight text-slate-700">{label}</span>
    </button>
  );
}


function TransactionItem({ label, date, amount, status, reference, onClick }: { label: string, date: string, amount: number, status: string, reference?: string, key?: string | number, onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn("p-4 flex items-center justify-between hover:bg-slate-100/50 transition-colors", onClick && "cursor-pointer")}>
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          amount > 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-650 bg-red-50/70 text-red-600"
        )}>
          {amount > 0 ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
        </div>
        <div>
          <p className="font-bold text-sm">{label}</p>
          <div className="flex items-center gap-2 mt-0.5 font-sans text-xs">
            <p className="text-slate-500">{date}</p>
            {reference && (
              <>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <p className="text-[10px] font-mono text-slate-400 font-bold uppercase">Ref: {reference}</p>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className={cn("font-bold text-sm", amount > 0 ? "text-green-600" : "text-slate-900")}>
          {amount > 0 ? '+' : ''}{formatCurrency(Math.abs(amount))}
        </p>
        <p className={cn(
          "text-[10px] uppercase font-bold",
          status === 'completed' ? 'text-green-500' : 'text-red-500'
        )}>{status}</p>
      </div>
    </div>
  );
}


function ServicePlaceholder({ name }: { name: string }) {
  return (
    <div className="bg-white rounded-3xl p-12 border border-slate-100 text-center space-y-4">
      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-600">
        <Smartphone size={40} />
      </div>
      <h3 className="text-2xl font-bold">{name}</h3>
      <p className="text-slate-500">This feature is being connected to the service provider API.</p>
      <button className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-blue-100">
        Refresh Status
      </button>
    </div>
  );
}
