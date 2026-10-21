import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Plus, ShieldCheck, ExternalLink, Eye, Star, 
  Package, Tag, MessageSquare, Loader2, Trash2, BellRing, Wallet,
  AlertTriangle, UserPlus, CheckCircle2, Phone, History, X, Info
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { 
  marketplaceService, 
  MarketplaceCategory, 
  MarketplaceListing, 
  MarketplaceOrder 
} from '../../lib/marketplaceService';
import { fetchWalletSnapshot } from '../../lib/walletApi';
import { CreateListingModal } from './CreateListingModal';
import { ListingDetailsModal } from './ListingDetailsModal';
import { MarketplaceOrderChatModal } from './MarketplaceOrderChatModal';
import { EsimChatModal } from './EsimChatModal';

interface MarketplaceHomeProps {
  currentUser?: any;
  user?: any;
  onBalanceUpdate?: (newBalance: number) => void;
}

export const MarketplaceHome: React.FC<MarketplaceHomeProps> = ({
  currentUser: currentUserProp,
  user: userProp,
  onBalanceUpdate,
}) => {
  const currentUser = currentUserProp || userProp;
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<'all' | 'foreign_number' | 'social_account' | 'esim'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [openingListingId, setOpeningListingId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDefaultType, setCreateDefaultType] = useState<'foreign_number' | 'social_account'>('foreign_number');
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [activeOrder, setActiveOrder] = useState<MarketplaceOrder | null>(null);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [esimChatOpen, setEsimChatOpen] = useState(false);
  const [selectedEsimPackage, setSelectedEsimPackage] = useState<string>('us-5gb');
  const [activeTab, setActiveTab] = useState<'browse' | 'my-listings' | 'my-orders' | 'admin-orders' | 'manage-admins'>('browse');
  const [myListings, setMyListings] = useState<MarketplaceListing[]>([]);
  const [myOrders, setMyOrders] = useState<MarketplaceOrder[]>([]);
  const [adminOrders, setAdminOrders] = useState<MarketplaceOrder[]>([]);
  const [traceSearchQuery, setTraceSearchQuery] = useState('');

  // Popup message shown once user clicks on Marketplace
  const [showMarketplacePopup, setShowMarketplacePopup] = useState(true);

  // Insufficient Balance Modal state
  const [insufficientModal, setInsufficientModal] = useState<{
    isOpen: boolean;
    itemTitle: string;
    phoneNumber?: string;
    requiredAmount: number;
    currentBalance: number;
  } | null>(null);

  // Live wallet balance & Admin list state
  const [liveWalletBalance, setLiveWalletBalance] = useState<number>(
    Number(currentUser?.wallet_balance ?? currentUser?.balance ?? 0)
  );
  const [promotedAdmins, setPromotedAdmins] = useState<string[]>([
    'ibrahimfaruqolamilekan4@gmail.com',
    'adewaleogunkeye200@gmail.com',
    'jeffholland299@gmail.com',
  ]);
  const [isCallerAdminFromServer, setIsCallerAdminFromServer] = useState(false);
  const [promoteEmailInput, setPromoteEmailInput] = useState('');
  const [promotingEmail, setPromotingEmail] = useState(false);

  const userEmailNormalized = String(currentUser?.email || '').toLowerCase().trim();
  const isAdmin =
    isCallerAdminFromServer ||
    currentUser?.role === 'admin' ||
    promotedAdmins.includes(userEmailNormalized);

  useEffect(() => {
    setLiveWalletBalance(Number(currentUser?.wallet_balance ?? currentUser?.balance ?? 0));
  }, [currentUser?.wallet_balance, currentUser?.balance]);

  useEffect(() => {
    const syncInitial = async () => {
      try {
        const [adminRes, snap] = await Promise.all([
          marketplaceService.getMarketplaceAdmins(),
          fetchWalletSnapshot().catch(() => null),
        ]);
        if (adminRes.admins?.length) setPromotedAdmins(adminRes.admins);
        if (adminRes.isCallerAdmin) setIsCallerAdminFromServer(true);
        if (snap && typeof snap.balance === 'number') {
          setLiveWalletBalance(snap.balance);
        }
      } catch (_) {}
    };
    syncInitial();
  }, [currentUser?.id, currentUser?.email]);

  useEffect(() => {
    loadData();
  }, [selectedCategory, selectedType, searchQuery, activeTab, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    marketplaceService.getAdminOrders().then(setAdminOrders).catch(() => {});
    const interval = setInterval(() => {
      marketplaceService.getAdminOrders().then(setAdminOrders).catch(() => {});
    }, 6000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const loadData = async () => {
    try {
      setLoading(true);
      const cats = await marketplaceService.getCategories();
      setCategories(cats);

      const userId = currentUser?.id || currentUser?.uid || '';

      if (activeTab === 'browse') {
        const filters: any = {};
        if (selectedCategory !== 'all') filters.category = selectedCategory;
        if (selectedType !== 'all' && selectedType !== 'esim') filters.type = selectedType;
        if (searchQuery) filters.search = searchQuery;

        const [items, buyerOrders] = await Promise.all([
          marketplaceService.getListings(filters),
          userId ? marketplaceService.getMyPurchases(userId).catch(() => []) : Promise.resolve([]),
        ]);
        setListings(items);
        if (buyerOrders.length) setMyOrders(buyerOrders);
      } else if (activeTab === 'my-listings' && userId) {
        const items = await marketplaceService.getMyListings(userId);
        setMyListings(items);
      } else if (activeTab === 'my-orders' && userId) {
        const purchases = await marketplaceService.getMyPurchases(userId);
        const sales = await marketplaceService.getMySales(userId);
        const map = new Map<string, MarketplaceOrder>();
        [...purchases, ...sales].forEach((o) => map.set(o.id, o));
        setMyOrders(Array.from(map.values()));
      } else if (activeTab === 'admin-orders' && isAdmin) {
        const allOrders = await marketplaceService.getAdminOrders();
        setAdminOrders(allOrders);
      } else if (activeTab === 'manage-admins' && isAdmin) {
        const res = await marketplaceService.getMarketplaceAdmins();
        if (res.admins?.length) setPromotedAdmins(res.admins);
      }
    } catch (error) {
      console.error('Error loading marketplace:', error);
    } finally {
      setLoading(false);
    }
  };

  // When ANY user clicks on a Foreign Number, check wallet balance first, then immediately open live chat with Admin!
  const handleListingClick = async (listing: MarketplaceListing) => {
    const isForeignNumber =
      listing.marketplace_categories?.type === 'foreign_number' ||
      listing.category_id?.includes('phone') ||
      listing.is_admin_listing;

    if (!isForeignNumber) {
      setSelectedListing(listing);
      return;
    }

    const buyerId = currentUser?.id || currentUser?.uid;
    if (!buyerId) {
      toast.error('Please log in to buy a foreign number');
      return;
    }

    const phoneNum =
      listing.product_details?.phone_number ||
      listing.product_details?.item_identifier ||
      listing.title;
    const requiredPrice = Number(listing.price || 0);

    // Check if buyer already has an existing order/chat for this number
    const existingOrder = myOrders.find(
      (o) =>
        o.listing_id === listing.id &&
        ['pending', 'code_requested', 'code_sent', 'paid'].includes(o.status)
    );

    // Refresh live wallet balance before checking
    let currentBal = liveWalletBalance;
    try {
      const snap = await fetchWalletSnapshot();
      if (snap && typeof snap.balance === 'number') {
        currentBal = snap.balance;
        setLiveWalletBalance(currentBal);
      }
    } catch (_) {}

    // STRICT CHECK: If account is not funded with the required amount, write Insufficient Balance!
    if (!isAdmin && !existingOrder && requiredPrice > 0 && currentBal < requiredPrice) {
      toast.error(
        `Insufficient Balance! Required: ₦${requiredPrice.toLocaleString()}, Available: ₦${currentBal.toLocaleString()}. Please fund your wallet first.`
      );
      setInsufficientModal({
        isOpen: true,
        itemTitle: listing.title,
        phoneNumber: phoneNum,
        requiredAmount: requiredPrice,
        currentBalance: currentBal,
      });
      return;
    }

    try {
      setOpeningListingId(listing.id);
      const order = await marketplaceService.initiatePurchase(buyerId, listing.id, listing);
      setActiveOrder(order);
      setChatModalOpen(true);
      toast.success(`Chat opened with Admin for ${phoneNum}!`);
    } catch (error: any) {
      if (
        error?.code === 'INSUFFICIENT_BALANCE' ||
        String(error?.message || '').toLowerCase().includes('insufficient')
      ) {
        const reqAmt = Number(error?.required || requiredPrice);
        const balAmt = Number(error?.balance ?? currentBal);
        toast.error('Insufficient Balance! Please fund your wallet before requesting to buy any number.');
        setInsufficientModal({
          isOpen: true,
          itemTitle: listing.title,
          phoneNumber: phoneNum,
          requiredAmount: reqAmt,
          currentBalance: balAmt,
        });
      } else {
        toast.error(error.message || 'Failed to open chat with Admin');
      }
    } finally {
      setOpeningListingId(null);
    }
  };

  // When user clicks an eSIM package, also check wallet balance first!
  const handleEsimClick = async (pkgId: string, pkgTitle: string, pkgPrice: number) => {
    let currentBal = liveWalletBalance;
    try {
      const snap = await fetchWalletSnapshot();
      if (snap && typeof snap.balance === 'number') {
        currentBal = snap.balance;
        setLiveWalletBalance(currentBal);
      }
    } catch (_) {}

    if (!isAdmin && pkgPrice > 0 && currentBal < pkgPrice) {
      toast.error(
        `Insufficient Balance! ${pkgTitle} requires ₦${pkgPrice.toLocaleString()}, but your wallet balance is ₦${currentBal.toLocaleString()}.`
      );
      setInsufficientModal({
        isOpen: true,
        itemTitle: pkgTitle,
        requiredAmount: pkgPrice,
        currentBalance: currentBal,
      });
      return;
    }

    setSelectedEsimPackage(pkgId);
    setEsimChatOpen(true);
  };

  const handleDeleteListing = async (e: React.MouseEvent, listingId: string) => {
    e.stopPropagation();
    try {
      await marketplaceService.deleteListing(listingId);
      setListings((prev) => prev.filter((item) => item.id !== listingId));
      setMyListings((prev) => prev.filter((item) => item.id !== listingId));
      toast.success('Listing removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete listing');
    }
  };

  const handlePromoteEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = promoteEmailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    try {
      setPromotingEmail(true);
      const res = await marketplaceService.promoteAdminEmail(email);
      setPromotedAdmins(res.admins || []);
      setPromoteEmailInput('');
      toast.success(res.message || `${email} promoted to Admin!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to promote email');
    } finally {
      setPromotingEmail(false);
    }
  };

  const handleRemoveAdminEmail = async (email: string) => {
    try {
      const res = await marketplaceService.removeAdminEmail(email);
      setPromotedAdmins(res.admins || []);
      toast.success(`Removed ${email} from Marketplace Admins`);
    } catch (err: any) {
      toast.error(err.message || 'Cannot remove core admin email');
    }
  };

  const pendingAdminOrdersCount = adminOrders.filter((o) => o.status !== 'completed').length;

  const filteredAdminOrders = adminOrders.filter((o) => {
    if (!traceSearchQuery.trim()) return true;
    const q = traceSearchQuery.toLowerCase().trim();
    const phone = String(o.clicked_number || o.marketplace_listings?.product_details?.phone_number || '').toLowerCase();
    const buyerEmail = String(o.buyer?.email || '').toLowerCase();
    const buyerName = String(o.buyer?.full_name || '').toLowerCase();
    const orderId = String(o.id || '').toLowerCase();
    const title = String(o.marketplace_listings?.title || '').toLowerCase();
    return (
      phone.includes(q) ||
      buyerEmail.includes(q) ||
      buyerName.includes(q) ||
      orderId.includes(q) ||
      title.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-3xl overflow-hidden border border-emerald-500/20">
      {/* ── POPUP MESSAGE WHEN USER CLICKS ON MARKETPLACE ──────────────────── */}
      <AnimatePresence>
        {showMarketplacePopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              className="bg-slate-900 border-2 border-emerald-500/50 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative"
            >
              <button
                type="button"
                onClick={() => setShowMarketplacePopup(false)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <Info className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    Important Notice
                  </span>
                  <h3 className="text-lg font-black text-white mt-1">
                    Foreign Numbers & eSIM Guide
                  </h3>
                </div>
              </div>

              <div className="space-y-3 text-xs sm:text-sm text-slate-200 bg-slate-800/80 border border-slate-700 rounded-2xl p-4 leading-relaxed">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <p>
                    <strong>Click on any Foreign Number or eSIM</strong> and it will immediately open a live chat between you and the Admin to get your number and receive your login verification code.
                  </p>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <p>
                    <strong>Make sure you fund your wallet</strong> before requesting to buy any number or eSIM. If your account is not funded with the required amount, it will write <strong className="text-red-400">Insufficient Balance</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-teal-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <p>
                    Once you receive the login code and the deal is done, the amount is <strong>automatically debited from your wallet</strong>. All chat messages are permanently saved in your chat history.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  Your Current Wallet Balance:
                </span>
                <span className="text-base font-black text-emerald-400">
                  ₦{Number(liveWalletBalance).toLocaleString()}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowMarketplacePopup(false);
                    window.dispatchEvent(new CustomEvent('open-fund-modal'));
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-black text-xs transition"
                >
                  + Fund Wallet First
                </button>
                <button
                  type="button"
                  onClick={() => setShowMarketplacePopup(false)}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs shadow-lg transition"
                >
                  I Understand, Continue →
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── INSUFFICIENT BALANCE MODAL ─────────────────────────────────────── */}
      <AnimatePresence>
        {insufficientModal?.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              className="bg-slate-900 border-2 border-red-500/60 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative"
            >
              <button
                type="button"
                onClick={() => setInsufficientModal(null)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 px-2.5 py-0.5 rounded-full border border-red-500/30">
                    Wallet Check Failed
                  </span>
                  <h3 className="text-xl font-black text-white mt-1">
                    Insufficient Balance
                  </h3>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Your wallet does not have enough balance to request <strong className="text-white">{insufficientModal.itemTitle}</strong>
                {insufficientModal.phoneNumber ? ` (${insufficientModal.phoneNumber})` : ''}. Please fund your wallet before requesting to buy any number or eSIM.
              </p>

              <div className="bg-slate-950/90 border border-red-500/30 rounded-2xl p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold">Required Price:</span>
                  <span className="font-black text-white text-sm">
                    ₦{Number(insufficientModal.requiredAmount).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                  <span className="text-slate-400 font-bold">Your Wallet Balance:</span>
                  <span className="font-black text-red-400 text-sm">
                    ₦{Number(insufficientModal.currentBalance).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                  <span className="text-amber-300 font-bold">Amount Needed:</span>
                  <span className="font-black text-amber-400 text-sm">
                    ₦{Math.max(0, Number(insufficientModal.requiredAmount) - Number(insufficientModal.currentBalance)).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setInsufficientModal(null)}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInsufficientModal(null);
                    window.dispatchEvent(new CustomEvent('open-fund-modal'));
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs shadow-lg transition"
                >
                  Deposit Funds Now →
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-950/90 via-slate-900 to-teal-950/90 border-b border-emerald-500/20 py-10 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-3.5 py-1 mb-3">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                  Admin-Verified Foreign Numbers & Digital Assets
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">
                Foreign Numbers, eSIMs & Socials
              </h1>
              <p className="text-slate-300 text-sm md:text-base max-w-2xl">
                Click any Foreign Number posted by Admin to immediately open a live chat, receive your verification code to login, and your wallet will be debited automatically once the deal is done.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-3.5 py-1.5 rounded-xl text-xs text-slate-200">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <span>Your Wallet Balance:</span>
                <strong className="text-emerald-400 font-black">₦{Number(liveWalletBalance).toLocaleString()}</strong>
                <button
                  type="button"
                  onClick={() => setShowMarketplacePopup(true)}
                  className="ml-2 text-[11px] text-amber-300 underline hover:text-amber-200 font-bold"
                >
                  How it works
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {/* ONLY ADMIN CAN POST FOREIGN NUMBERS FOR SALE */}
              {isAdmin && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setCreateDefaultType('foreign_number');
                    setCreateModalOpen(true);
                  }}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black py-3 px-5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-600/30 text-sm cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  + Post Foreign Number (Admin)
                </motion.button>
              )}

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setCreateDefaultType('social_account');
                  setCreateModalOpen(true);
                }}
                className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 font-bold py-3 px-5 rounded-xl transition flex items-center gap-2 text-sm cursor-pointer"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                Sell Social Account
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-slate-800 overflow-x-auto pb-1">
          {[
            { id: 'browse', label: '🌍 Browse Foreign Numbers & Assets' },
            ...(isAdmin
              ? [
                  {
                    id: 'admin-orders',
                    label: `💬 Buyer Chats & Trace History (${adminOrders.length})`,
                    badge: pendingAdminOrdersCount,
                  },
                  {
                    id: 'manage-admins',
                    label: `👑 Promote / Manage Admins (${promotedAdmins.length})`,
                  },
                ]
              : []),
            { id: 'my-orders', label: '📦 My Purchases & Chat History' },
            { id: 'my-listings', label: '🏷️ My Listings' },
          ].map((tab: any) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-3 font-bold transition border-b-2 whitespace-nowrap flex items-center gap-2 text-sm cursor-pointer ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-slate-950">
                  {tab.badge} Active
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Browse Tab */}
        {activeTab === 'browse' && (
          <div className="space-y-8">
            {/* Search & Filters */}
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search foreign numbers (+1, +44), countries, WhatsApp, Telegram, or social accounts..."
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {[
                  { value: 'all', label: 'All Offerings' },
                  { value: 'foreign_number', label: '📱 Foreign Numbers (Admin Verified)' },
                  { value: 'esim', label: '📶 International eSIM' },
                  { value: 'social_account', label: '👥 Social Media Accounts' },
                ].map((type) => (
                  <button
                    key={type.value}
                    onClick={() => {
                      setSelectedType(type.value as any);
                      setSelectedCategory('all');
                    }}
                    className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer ${
                      selectedType === type.value
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              {selectedType !== 'esim' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`p-3 rounded-xl border transition text-center cursor-pointer ${
                      selectedCategory === 'all'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-800/40 border-slate-700/50 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-lg mb-1">🌐</div>
                    <div className="text-xs font-semibold">All</div>
                  </button>

                  {categories
                    .filter((cat) => selectedType === 'all' || cat.type === selectedType)
                    .map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`p-3 rounded-xl border transition text-center cursor-pointer ${
                          selectedCategory === cat.id
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-slate-800/40 border-slate-700/50 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div className="text-lg mb-1">{cat.icon}</div>
                        <div className="text-xs font-semibold line-clamp-1">{cat.name}</div>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Banner explaining the Foreign Number instant chat + wallet requirement */}
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 font-black">
                  💬
                </div>
                <div className="text-xs text-slate-200 space-y-0.5">
                  <p className="font-black text-emerald-300 text-sm">
                    How Foreign Number & eSIM Purchase Works
                  </p>
                  <p className="text-slate-300">
                    1. Fund your wallet first (otherwise it will show <strong className="text-red-400">Insufficient Balance</strong>) • 2. Click any Foreign Number or eSIM to open live chat with Admin • 3. Use the number in chat to receive your login code • 4. Wallet is debited automatically once done!
                  </p>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => {
                    setCreateDefaultType('foreign_number');
                    setCreateModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shrink-0 transition cursor-pointer"
                >
                  + Post New Number
                </button>
              )}
            </div>

            {/* eSIM Instant Activation Banner & Packages */}
            {(selectedType === 'all' || selectedType === 'esim') && (
              <div className="bg-gradient-to-r from-teal-950/90 via-slate-900 to-emerald-950/90 border border-teal-500/30 rounded-2xl p-6 shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2 max-w-xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-500/30 text-teal-300 text-xs font-bold">
                      <span>📶 Official International eSIM Desk</span>
                    </div>
                    <h2 className="text-2xl font-black text-white">
                      Instant Global eSIM Profiles (USA, UK, Europe & 150+ Countries)
                    </h2>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      Need a travel or business eSIM? Click any package below to open a direct live chat with our eSIM Admin Desk. Make sure your wallet is funded with the package price first.
                    </p>
                  </div>
                  <button
                    onClick={() => handleEsimClick('us-5gb', '🇺🇸 USA 5GB eSIM (30 Days)', 8500)}
                    className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold px-6 py-3.5 rounded-xl shadow-lg transition flex items-center gap-2 whitespace-nowrap self-start md:self-center cursor-pointer"
                  >
                    <MessageSquare className="w-5 h-5" />
                    Message Admin for eSIM
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800/80">
                  {[
                    { id: 'us-5gb', flag: '🇺🇸', title: 'USA 5GB (30 Days)', price: '₦8,500', numericPrice: 8500, desc: 'AT&T / T-Mobile 5G • Instant QR Activation' },
                    { id: 'uk-10gb', flag: '🇬🇧', title: 'UK 10GB + +44 Number', price: '₦12,500', numericPrice: 12500, desc: 'Vodafone / O2 UK • Calls, SMS & 5G Data' },
                    { id: 'global-5gb', flag: '🌍', title: 'Global 150+ Countries (5GB)', price: '₦16,000', numericPrice: 16000, desc: 'Worldwide roaming coverage • Zero physical SIM' },
                  ].map((pkg) => (
                    <div
                      key={pkg.id}
                      onClick={() => handleEsimClick(pkg.id, `${pkg.flag} ${pkg.title}`, pkg.numericPrice)}
                      className="bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/60 hover:border-teal-500/50 rounded-xl p-4 cursor-pointer transition group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-2xl">{pkg.flag}</span>
                          <span className="text-base font-black text-teal-400">{pkg.price}</span>
                        </div>
                        <h4 className="font-bold text-white group-hover:text-teal-300 transition text-sm">
                          {pkg.title}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1">{pkg.desc}</p>
                      </div>
                      <div className="mt-4 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-teal-400 font-bold">
                        <span>Click to Open Chat & Get eSIM</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Listings Grid */}
            {selectedType !== 'esim' && (
              <>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  </div>
                ) : listings.length === 0 ? (
                  <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-slate-800">
                    <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400">No numbers or listings found matching your criteria</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {listings.map((listing) => {
                      const isForeignNumber =
                        listing.marketplace_categories?.type === 'foreign_number' ||
                        listing.category_id?.includes('phone') ||
                        listing.is_admin_listing;
                      const isOpening = openingListingId === listing.id;
                      const phoneDisplay =
                        listing.product_details?.phone_number ||
                        listing.product_details?.item_identifier ||
                        '';

                      return (
                        <motion.div
                          key={listing.id}
                          whileHover={{ y: -4 }}
                          onClick={() => handleListingClick(listing)}
                          className="bg-slate-900/80 border border-slate-700/60 hover:border-emerald-500/60 rounded-2xl overflow-hidden cursor-pointer transition group flex flex-col justify-between shadow-lg"
                        >
                          <div>
                            <div className="h-36 bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-950/60 flex flex-col items-center justify-center relative overflow-hidden p-4 text-center">
                              <div className="text-4xl mb-1 group-hover:scale-110 transition">
                                {listing.marketplace_categories?.icon || '📱'}
                              </div>
                              {phoneDisplay && (
                                <span className="font-mono font-black text-sm text-emerald-300 bg-slate-950/90 px-3 py-1 rounded-lg border border-emerald-500/40 shadow">
                                  {phoneDisplay}
                                </span>
                              )}
                              <div className="absolute top-3 left-3">
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  {isForeignNumber ? '✓ Admin Official Number' : 'Verified Asset'}
                                </span>
                              </div>
                              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                                <div className="bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded-full text-xs text-slate-300 flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  {listing.views}
                                </div>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteListing(e, listing.id)}
                                    title="Remove Listing (Admin)"
                                    className="bg-red-600/90 hover:bg-red-600 text-white p-1.5 rounded-full transition shadow"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="p-5 space-y-3">
                              <div>
                                <h3 className="font-black text-white group-hover:text-emerald-400 transition line-clamp-2 text-base">
                                  {listing.title}
                                </h3>
                                <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                                  {listing.description}
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                                <div className="text-xs text-slate-300 font-semibold">
                                  {isForeignNumber
                                    ? '👑 NORODATA Official Admin'
                                    : listing.profiles?.full_name || 'Verified Seller'}
                                </div>
                                <div className="flex items-center gap-1 text-amber-400 text-xs font-bold">
                                  <Star className="w-3.5 h-3.5 fill-current" />
                                  {(listing.profiles?.marketplace_seller_rating || 5.0).toFixed(1)}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-2">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                Auto-Debit Price
                              </span>
                              <div className="text-xl font-black text-emerald-400">
                                ₦{Number(listing.price).toLocaleString()}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isOpening}
                              className="bg-emerald-600 group-hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-black text-xs transition flex items-center gap-1.5 shadow-md"
                            >
                              {isOpening ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Opening Chat...
                                </>
                              ) : isForeignNumber ? (
                                <>
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  Click to Chat & Get Code
                                </>
                              ) : (
                                <>
                                  <span>View Details</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Admin Dedicated Buyer Chats & Permanent Trace History Tab */}
        {activeTab === 'admin-orders' && isAdmin && (
          <div className="space-y-4">
            <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-black text-white text-base flex items-center gap-2">
                  <History className="w-5 h-5 text-emerald-400" />
                  Incoming Foreign Number Chats & Permanent Audit History
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every message between users and Admin is permanently stored. Click any order to view full chat history, send login code, and auto-debit buyer's wallet.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={traceSearchQuery}
                  onChange={(e) => setTraceSearchQuery(e.target.value)}
                  placeholder="Search buyer email, number, order ID..."
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={loadData}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-emerald-300 border border-emerald-500/30 shrink-0 cursor-pointer"
                >
                  Refresh
                </button>
              </div>
            </div>

            {filteredAdminOrders.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-slate-800">
                <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No buyer chats matching your filter yet</p>
              </div>
            ) : (
              filteredAdminOrders.map((order) => {
                const phoneNum =
                  order.clicked_number ||
                  order.marketplace_listings?.product_details?.phone_number ||
                  order.marketplace_listings?.product_details?.item_identifier ||
                  '';
                const buyerBal = Number(order.buyer?.wallet_balance ?? 0);
                const msgCount = Array.isArray(order.messages) ? order.messages.length : 0;

                return (
                  <div
                    key={order.id}
                    onClick={() => {
                      setActiveOrder(order);
                      setChatModalOpen(true);
                    }}
                    className="bg-slate-900/80 border border-slate-700/60 hover:border-emerald-500/50 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            order.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {order.status === 'completed' ? '✓ Completed & Wallet Debited' : '⏳ Awaiting Login Code'}
                        </span>
                        {order.code_requested && order.status !== 'completed' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1">
                            <BellRing className="w-3 h-3" /> Buyer Requested Login Code
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-slate-400">
                          ID: {order.id} • {msgCount} permanent msg{msgCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <h3 className="font-black text-white text-base">
                        {order.marketplace_listings?.title || 'Foreign Number Order'}
                      </h3>
                      {phoneNum && (
                        <p className="text-xs font-mono text-emerald-300 font-bold flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" />
                          Clicked Number: {phoneNum}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                        <span>
                          Buyer: <strong className="text-white">{order.buyer?.full_name || 'Customer'}</strong> ({order.buyer?.email || 'No email'})
                        </span>
                        <span className="flex items-center gap-1">
                          <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                          Buyer Wallet:{' '}
                          <strong className={buyerBal >= Number(order.price) ? 'text-emerald-400' : 'text-red-400'}>
                            ₦{buyerBal.toLocaleString()}
                          </strong>
                        </span>
                      </div>
                      {order.last_message && (
                        <p className="text-xs text-slate-400 italic line-clamp-1">
                          Last message: "{order.last_message}"
                        </p>
                      )}
                    </div>

                    <div className="flex sm:flex-col items-end justify-between gap-2 shrink-0">
                      <div className="text-lg font-black text-emerald-400">
                        ₦{Number(order.price).toLocaleString()}
                      </div>
                      <button className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Open Chat & Send Code
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Promote / Manage Foreign Number Admins Tab */}
        {activeTab === 'manage-admins' && isAdmin && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    Promote Email to Foreign Number & Marketplace Admin
                  </h3>
                  <p className="text-xs text-slate-400">
                    Promoted emails have full access to post foreign numbers for sale, view all buyer chat histories, send login verification codes, and complete auto-debit deals.
                  </p>
                </div>
              </div>

              <form onSubmit={handlePromoteEmail} className="flex flex-col sm:flex-row gap-3 pt-2">
                <input
                  type="email"
                  required
                  value={promoteEmailInput}
                  onChange={(e) => setPromoteEmailInput(e.target.value)}
                  placeholder="Enter user email to promote to Admin (e.g. admin@gmail.com)..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={promotingEmail || !promoteEmailInput.trim()}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs sm:text-sm transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  {promotingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Promote Email to Admin
                </button>
              </form>

              <div className="pt-4 border-t border-slate-800 space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Active Foreign Number & Marketplace Admins ({promotedAdmins.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {promotedAdmins.map((email) => {
                    const isCore = [
                      'ibrahimfaruqolamilekan4@gmail.com',
                      'adewaleogunkeye200@gmail.com',
                      'jeffholland299@gmail.com',
                    ].includes(email.toLowerCase());
                    return (
                      <div
                        key={email}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="text-xs font-bold text-white truncate">{email}</span>
                          {isCore && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                              Core Admin
                            </span>
                          )}
                        </div>
                        {!isCore && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAdminEmail(email)}
                            className="text-xs text-red-400 hover:text-red-300 font-bold px-2 py-1 rounded hover:bg-red-950/50 transition"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* My Listings Tab */}
        {activeTab === 'my-listings' && (
          <div className="space-y-4">
            {myListings.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-slate-800">
                <Tag className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 mb-4">You haven't created any listings yet</p>
                <button
                  onClick={() => {
                    setCreateDefaultType(isAdmin ? 'foreign_number' : 'social_account');
                    setCreateModalOpen(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold transition"
                >
                  Create First Listing
                </button>
              </div>
            ) : (
              myListings.map((listing) => (
                <div
                  key={listing.id}
                  className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <h3 className="font-bold text-white">{listing.title}</h3>
                    <p className="text-sm text-slate-400">{listing.description}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-black text-emerald-400">
                        ₦{Number(listing.price).toLocaleString()}
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          listing.status === 'available'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {listing.status}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteListing(e, listing.id)}
                      className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* My Orders & Permanent Chat History Tab */}
        {activeTab === 'my-orders' && (
          <div className="space-y-4">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <History className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  All your Foreign Number chats and verification codes with Admin are permanently saved here for reference and dispute tracing.
                </span>
              </div>
              <button
                onClick={loadData}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold shrink-0"
              >
                Refresh History
              </button>
            </div>

            {myOrders.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-slate-800">
                <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No active or past number orders yet. Click any Foreign Number in Browse to open a chat with Admin!</p>
              </div>
            ) : (
              myOrders.map((order) => {
                const phoneNum =
                  order.clicked_number ||
                  order.marketplace_listings?.product_details?.phone_number ||
                  order.marketplace_listings?.product_details?.item_identifier ||
                  '';
                const msgCount = Array.isArray(order.messages) ? order.messages.length : 0;

                return (
                  <div
                    key={order.id}
                    onClick={() => {
                      setActiveOrder(order);
                      setChatModalOpen(true);
                    }}
                    className="bg-slate-900/80 border border-slate-700/50 hover:border-emerald-500/50 rounded-xl p-4 flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white">
                          {order.marketplace_listings?.title || 'Foreign Number Order'}
                        </h3>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                          {msgCount} saved msg{msgCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      {phoneNum && (
                        <p className="text-xs font-mono text-emerald-400 font-bold">
                          Number: {phoneNum}
                        </p>
                      )}
                      <p className="text-xs text-slate-400">
                        Status:{' '}
                        <span className="capitalize text-emerald-400 font-bold">
                          {order.status === 'completed' ? 'Completed & Auto-Debited' : 'Chat Open with Admin'}
                        </span>
                        {order.verification_code ? ` • Login Code: ${order.verification_code}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-emerald-400">
                        ₦{Number(order.price).toLocaleString()}
                      </div>
                      <span className="text-xs text-emerald-300 font-bold flex items-center gap-1 justify-end mt-1">
                        <MessageSquare className="w-3.5 h-3.5" /> Open Saved Chat →
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateListingModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        categories={categories}
        sellerId={currentUser?.id || currentUser?.uid}
        isAdmin={isAdmin}
        defaultType={createDefaultType}
        onSuccess={() => {
          loadData();
        }}
      />

      {selectedListing && (
        <ListingDetailsModal
          listing={selectedListing}
          currentUser={currentUser}
          isOpen={!!selectedListing}
          onClose={() => setSelectedListing(null)}
          onStartOrder={(order) => {
            setActiveOrder(order);
            setSelectedListing(null);
            setChatModalOpen(true);
          }}
        />
      )}

      {activeOrder && (
        <MarketplaceOrderChatModal
          order={activeOrder}
          currentUser={currentUser}
          isOpen={chatModalOpen}
          onClose={() => {
            setChatModalOpen(false);
            loadData();
          }}
          onPaymentComplete={(newBalance) => {
            setLiveWalletBalance(newBalance);
            onBalanceUpdate?.(newBalance);
            loadData();
          }}
        />
      )}

      <EsimChatModal
        isOpen={esimChatOpen}
        onClose={() => setEsimChatOpen(false)}
        currentUser={{ ...currentUser, wallet_balance: liveWalletBalance }}
        initialPackage={selectedEsimPackage}
      />
    </div>
  );
};
