import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, Plus, ShieldCheck, ExternalLink, Eye, Star, 
  Package, Tag, MessageSquare, Loader2, Trash2, BellRing, Wallet
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { marketplaceService, MarketplaceListing, MarketplaceCategory, MarketplaceOrder } from '../../lib/marketplaceService';
import { CreateListingModal } from './CreateListingModal';
import { ListingDetailsModal } from './ListingDetailsModal';
import { MarketplaceOrderChatModal } from './MarketplaceOrderChatModal';
import { EsimChatModal } from './EsimChatModal';

interface MarketplaceHomeProps {
  user: any;
  onOpenListing?: (id: string) => void;
}

export function MarketplaceHome({ user, onOpenListing }: MarketplaceHomeProps) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState<'all' | 'foreign_number' | 'social_account' | 'esim'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectingListingId, setConnectingListingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'browse' | 'purchases' | 'my-listings' | 'admin-chats'>('browse');

  // User purchases, listings & admin orders
  const [myPurchases, setMyPurchases] = useState<MarketplaceOrder[]>([]);
  const [myListings, setMyListings] = useState<MarketplaceListing[]>([]);
  const [adminOrders, setAdminOrders] = useState<MarketplaceOrder[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDefaultType, setModalDefaultType] = useState<'foreign_number' | 'social_account' | undefined>(undefined);
  const [isEsimModalOpen, setIsEsimModalOpen] = useState(false);
  const [selectedEsimPackage, setSelectedEsimPackage] = useState<string>('us-5gb');
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const isAdmin = Boolean(
    user?.role === 'admin' ||
    ['ibrahimfaruqolamilekan4@gmail.com', 'adewaleogunkeye200@gmail.com', 'jeffholland299@gmail.com'].includes(
      String(user?.email || '').toLowerCase().trim()
    )
  );

  // Load categories and initial data
  useEffect(() => {
    loadCategories();
    loadMyPurchases(true);
    if (isAdmin) {
      loadAdminOrders(true);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === 'browse') {
      loadListings();
    } else if (activeTab === 'purchases') {
      loadMyPurchases();
    } else if (activeTab === 'my-listings') {
      loadMyListings();
    } else if (activeTab === 'admin-chats') {
      loadAdminOrders();
    }
  }, [selectedCategory, selectedType, activeTab]);

  // Poll admin orders when Admin is viewing
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(() => {
      loadAdminOrders(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const loadCategories = async () => {
    const cats = await marketplaceService.getCategories();
    setCategories(cats);
  };

  const loadListings = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (selectedCategory !== 'all') filters.category = selectedCategory;
      if (selectedType !== 'all') filters.type = selectedType;
      if (searchQuery.trim()) filters.search = searchQuery.trim();

      const data = await marketplaceService.getListings(filters);
      setListings(data);
    } catch (error) {
      console.error('Failed to load listings:', error);
      toast.error('Could not load marketplace listings.');
    } finally {
      setLoading(false);
    }
  };

  const loadMyPurchases = async (silent = false) => {
    if (!user?.id && !user?.uid) return;
    if (!silent) setLoading(true);
    try {
      const data = await marketplaceService.getMyPurchases(user.id || user.uid);
      setMyPurchases(data);
    } catch (err) {
      console.error('Failed to load purchases:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadMyListings = async () => {
    if (!user?.id && !user?.uid) return;
    setLoading(true);
    try {
      const data = await marketplaceService.getMyListings(user.id || user.uid);
      setMyListings(data);
    } catch (err) {
      console.error('Failed to load my listings:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAdminOrders = async (silent = false) => {
    if (!isAdmin) return;
    if (!silent) setLoading(true);
    try {
      const data = await marketplaceService.getAdminOrders();
      setAdminOrders(data);
    } catch (err) {
      console.error('Failed to load admin orders:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadListings();
  };

  // Whenever ANY user clicks on a Foreign Number, immediately open live chat between them and Admin!
  const handleClickListing = async (item: MarketplaceListing) => {
    const cat = item.marketplace_categories;
    const isPhone = cat?.type === 'foreign_number' || String(item.category_id || '').includes('phone');
    const isEsim = cat?.type === 'esim' || item.id.startsWith('esim-');

    if (isEsim) {
      setSelectedEsimPackage(item.id.replace('esim-', ''));
      setIsEsimModalOpen(true);
      return;
    }

    if (isPhone) {
      if (!user?.id && !user?.uid) {
        toast.error('Please log in to buy a foreign number.');
        return;
      }
      setConnectingListingId(item.id);
      try {
        const buyerId = user.id || user.uid;
        const order = await marketplaceService.initiatePurchase(buyerId, item.id, item);
        setSelectedOrderId(order.id);
        loadMyPurchases(true);
        if (isAdmin) loadAdminOrders(true);
      } catch (err: any) {
        toast.error(err.message || 'Could not open chat with Admin.');
      } finally {
        setConnectingListingId(null);
      }
      return;
    }

    setSelectedListing(item);
    onOpenListing?.(item.id);
  };

  const handleDeleteListing = async (e: React.MouseEvent, listingId: string) => {
    e.stopPropagation();
    try {
      await marketplaceService.deleteListing(listingId);
      toast.success('Listing removed.');
      loadListings();
      loadMyListings();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete listing.');
    }
  };

  const pendingAdminCodeRequests = adminOrders.filter(o => o.status !== 'completed' && o.code_requested).length;

  return (
    <div className="space-y-6">
      {/* ── Top Header Banner ────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-emerald-950/10 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 to-transparent pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-black uppercase tracking-widest">
              <ShieldCheck size={14} className="text-emerald-300" />
              Admin-Verified Foreign Numbers & Digital Assets
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              NORODATA Digital Marketplace
            </h1>
            <p className="text-emerald-100/80 text-xs sm:text-sm font-medium leading-relaxed">
              Click any foreign phone number (USA, UK, Canada) to immediately open a live chat with Admin, request your OTP verification code, and your wallet will be debited automatically once the deal is done.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAdmin ? (
              <button
                onClick={() => {
                  setModalDefaultType('foreign_number');
                  setIsModalOpen(true);
                }}
                className="px-5 py-3 rounded-2xl bg-white text-emerald-900 hover:bg-emerald-50 font-black text-xs uppercase tracking-wider shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Plus size={16} className="text-emerald-700" />
                Post Foreign Number (Admin)
              </button>
            ) : selectedType !== 'foreign_number' ? (
              <button
                onClick={() => {
                  setModalDefaultType('social_account');
                  setIsModalOpen(true);
                }}
                className="px-5 py-3 rounded-2xl bg-white text-emerald-900 hover:bg-emerald-50 font-black text-xs uppercase tracking-wider shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Plus size={16} className="text-emerald-700" />
                Sell Social Account
              </button>
            ) : (
              <div className="px-4 py-2.5 rounded-2xl bg-emerald-900/50 border border-emerald-400/30 text-emerald-100 text-xs font-bold flex items-center gap-2">
                <ShieldCheck size={15} className="text-emerald-300" />
                <span>Official Admin Numbers Only</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs inside Header */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-6 border-t border-emerald-600/50">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${
              activeTab === 'browse'
                ? 'bg-white text-emerald-900 shadow-md'
                : 'text-emerald-100 hover:bg-emerald-700/50'
            }`}
          >
            🛍️ Browse Numbers & Store
          </button>
          <button
            onClick={() => setActiveTab('purchases')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${
              activeTab === 'purchases'
                ? 'bg-white text-emerald-900 shadow-md'
                : 'text-emerald-100 hover:bg-emerald-700/50'
            }`}
          >
            💬 My Number Chats & Orders ({myPurchases.length})
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin-chats')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'admin-chats'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'bg-amber-500/20 border border-amber-300/40 text-amber-200 hover:bg-amber-500/30'
              }`}
            >
              <span>🛡️ Admin Buyer Chats ({adminOrders.length})</span>
              {pendingAdminCodeRequests > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                  {pendingAdminCodeRequests} Code Req
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setActiveTab('my-listings')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${
              activeTab === 'my-listings'
                ? 'bg-white text-emerald-900 shadow-md'
                : 'text-emerald-100 hover:bg-emerald-700/50'
            }`}
          >
            🏷️ {isAdmin ? 'Manage Posted Numbers' : 'My Listings'} ({myListings.length})
          </button>
        </div>
      </div>

      {/* ── BROWSE TAB CONTENT ────────────────────────────────────────── */}
      {activeTab === 'browse' && (
        <div className="space-y-6">
          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Type tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
              <button
                onClick={() => { setSelectedType('all'); setSelectedCategory('all'); }}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide transition whitespace-nowrap cursor-pointer ${
                  selectedType === 'all'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Digital Assets
              </button>
              <button
                onClick={() => { setSelectedType('foreign_number'); setSelectedCategory('all'); }}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedType === 'foreign_number'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📱</span> Foreign Numbers (Admin Verified)
              </button>
              <button
                onClick={() => { setSelectedType('social_account'); setSelectedCategory('all'); }}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedType === 'social_account'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🌐</span> Social Accounts
              </button>
              <button
                onClick={() => {
                  setSelectedType('esim');
                  setSelectedCategory('all');
                  setIsEsimModalOpen(true);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedType === 'esim'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📶</span> eSIM (Live Admin Chat)
              </button>
            </div>

            {/* Search Input */}
            <form onSubmit={handleSearch} className="relative min-w-[240px]">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search numbers, countries, accounts…"
                className="w-full bg-white border border-slate-200/80 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
              />
            </form>
          </div>

          {/* Sub-Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              All Categories
            </button>
            {categories
              .filter(c => selectedType === 'all' || c.type === selectedType)
              .map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition flex items-center gap-1.5 cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
          </div>

          {/* Listings Grid */}
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading available numbers & assets…</p>
            </div>
          ) : listings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-bold">
                📱
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-lg font-black text-slate-900">No Numbers Currently Listed</h3>
                <p className="text-xs text-slate-500 font-medium">
                  {isAdmin
                    ? 'Post a foreign phone number for sale so users can click to chat and buy.'
                    : 'Check back shortly — Admin is restocking fresh foreign numbers.'}
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => {
                    setModalDefaultType('foreign_number');
                    setIsModalOpen(true);
                  }}
                  className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-md transition cursor-pointer"
                >
                  + Post Foreign Number for Sale
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {listings.map((item) => {
                const cat = item.marketplace_categories;
                const isPhone = cat?.type === 'foreign_number' || String(item.category_id || '').includes('phone');
                const isEsim = cat?.type === 'esim' || item.id.startsWith('esim-');
                const sellerName = isPhone ? 'NORODATA Official Admin' : (item.profiles?.full_name || item.profiles?.name || 'Verified Seller');
                const rating = item.profiles?.marketplace_seller_rating || 5.0;
                const isConnecting = connectingListingId === item.id;

                return (
                  <motion.div
                    key={item.id}
                    whileHover={{ y: -4 }}
                    className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-200/60 transition-all flex flex-col justify-between cursor-pointer group"
                    onClick={() => handleClickListing(item)}
                  >
                    <div>
                      {/* Category Badge & Icon */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-bold">
                          <span>{cat?.icon || (isEsim ? '📶' : isPhone ? '📱' : '🌐')}</span>
                          <span>{cat?.name || (isEsim ? 'eSIM Profile' : isPhone ? 'Foreign Number' : 'Social Account')}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
                            <Eye size={13} />
                            <span>{item.views || 0}</span>
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteListing(e, item.id)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                              title="Remove listing (Admin)"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="font-black text-slate-900 text-base leading-snug group-hover:text-emerald-700 transition line-clamp-2 mb-1.5">
                        {item.title}
                      </h3>

                      {/* Description */}
                      <p className="text-xs text-slate-500 font-medium line-clamp-2 mb-4 leading-relaxed">
                        {item.description}
                      </p>

                      {/* Product details highlight */}
                      {item.product_details && (
                        <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 mb-4 text-[11px] font-mono text-slate-600 flex items-center justify-between">
                          <span className="font-bold text-slate-800 truncate">
                            {item.product_details.phone_number || item.product_details.item_identifier || item.product_details.username || 'Instant OTP Delivery'}
                          </span>
                          <span className="text-[10px] uppercase font-black tracking-wider text-emerald-600 shrink-0 ml-2">
                            {isPhone ? 'Admin Verified' : 'Verified'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom: Price, Seller & CTA */}
                    <div className="pt-3 border-t border-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Price (Auto-Debit on Deal Done)</p>
                          <p className="text-xl font-black text-emerald-600 font-mono">
                            ₦{Number(item.price).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-bold text-slate-800 truncate max-w-[140px]">{sellerName}</p>
                          <div className="flex items-center justify-end gap-1 text-[10px] text-amber-500 font-bold">
                            <Star size={11} fill="currentColor" />
                            <span>{Number(rating).toFixed(1)}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isConnecting}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClickListing(item);
                        }}
                        className="w-full py-2.5 rounded-2xl bg-slate-900 group-hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 disabled:opacity-50"
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Opening Admin Chat…</span>
                          </>
                        ) : isPhone ? (
                          <>
                            <MessageSquare size={14} />
                            <span>Click to Chat Admin & Request Code</span>
                          </>
                        ) : (
                          <>
                            <span>Chat & Buy</span>
                            <ExternalLink size={13} />
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MY PURCHASES / NUMBER CHATS TAB ───────────────────────────── */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">Your Foreign Number Chats & Purchases</h2>
            <span className="text-xs text-slate-500 font-semibold">{myPurchases.length} orders total</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500 font-bold uppercase tracking-widest">
              Loading orders…
            </div>
          ) : myPurchases.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
              <Package size={32} className="text-slate-400 mx-auto" />
              <h3 className="text-base font-black text-slate-900">No active number chats yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Click any foreign phone number in the store to immediately open a live chat with Admin and request your verification code.
              </p>
              <button
                onClick={() => setActiveTab('browse')}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-wider cursor-pointer"
              >
                Browse Foreign Numbers
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myPurchases.map(order => (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between hover:border-emerald-200"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-400">Order #{order.id.slice(0, 10)}</span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase ${
                        order.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : order.code_requested
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {order.status === 'completed' ? 'Completed & Debited' : order.code_requested ? 'Code Requested' : 'Live Admin Chat'}
                      </span>
                    </div>
                    <h4 className="font-black text-slate-900 text-sm">
                      {order.marketplace_listings?.title || 'Foreign Number'}
                    </h4>
                    {order.marketplace_listings?.product_details?.phone_number && (
                      <p className="text-xs font-mono font-bold text-slate-600">
                        📱 {order.marketplace_listings.product_details.phone_number}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="font-black text-emerald-600 font-mono text-base">
                      ₦{Number(order.price).toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      Open Admin Chat →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ADMIN BUYER CHATS TAB (ADMIN ONLY) ───────────────────────── */}
      {isAdmin && activeTab === 'admin-chats' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900 text-white p-5 rounded-3xl">
            <div>
              <h2 className="text-lg font-black">🛡️ Admin Foreign Number Buyer Chats</h2>
              <p className="text-xs text-slate-300">
                Click any buyer order below to open the chat, send the verification OTP code, and automatically debit the buyer's wallet!
              </p>
            </div>
            <button
              onClick={() => loadAdminOrders(false)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider cursor-pointer self-start sm:self-auto"
            >
              Refresh Chats ({adminOrders.length})
            </button>
          </div>

          {adminOrders.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-2">
              <MessageSquare size={32} className="text-slate-400 mx-auto" />
              <h3 className="text-base font-black text-slate-900">No buyer chats yet</h3>
              <p className="text-xs text-slate-500">
                Whenever any user clicks on a foreign number to buy, their live chat will appear right here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {adminOrders.map(order => {
                const buyerName = order.buyer?.full_name || order.buyer?.name || 'Customer';
                const buyerEmail = order.buyer?.email || '';
                const buyerBalance = Number(order.buyer?.wallet_balance ?? 0);
                const lastMsg = order.messages?.[order.messages.length - 1]?.content || 'Chat opened';

                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`bg-white rounded-3xl p-5 border shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between ${
                      order.code_requested && order.status !== 'completed'
                        ? 'border-amber-400 ring-2 ring-amber-400/20'
                        : 'border-slate-100 hover:border-emerald-200'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-slate-900 truncate">
                          👤 {buyerName} {buyerEmail ? `(${buyerEmail})` : ''}
                        </span>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase shrink-0 ${
                          order.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : order.code_requested
                            ? 'bg-amber-100 text-amber-900 animate-pulse'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {order.status === 'completed'
                            ? '✅ Deal Done (Debited)'
                            : order.code_requested
                            ? '🔔 Code Requested'
                            : '💬 Active Chat'}
                        </span>
                      </div>

                      <h4 className="font-black text-emerald-800 text-sm">
                        {order.marketplace_listings?.title || 'Foreign Number'}
                      </h4>

                      <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        {lastMsg}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Number Price</span>
                          <span className="font-black text-emerald-600 font-mono text-sm">
                            ₦{Number(order.price).toLocaleString()}
                          </span>
                        </div>
                        <div className="pl-3 border-l border-slate-200">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Buyer Wallet</span>
                          <span className={`font-black font-mono text-sm ${buyerBalance >= Number(order.price) ? 'text-slate-900' : 'text-rose-600'}`}>
                            ₦{buyerBalance.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <span className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white text-xs font-black uppercase tracking-wider transition">
                        Open & Send Code →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MY LISTINGS TAB ──────────────────────────────────────────── */}
      {activeTab === 'my-listings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">
              {isAdmin ? 'Admin Posted Numbers & Store Listings' : 'Your Active & Sold Listings'}
            </h2>
            <button
              onClick={() => {
                setModalDefaultType(isAdmin ? 'foreign_number' : 'social_account');
                setIsModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} /> {isAdmin ? 'Post Foreign Number' : 'New Listing'}
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500 font-bold uppercase tracking-widest">
              Loading listings…
            </div>
          ) : myListings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
              <Tag size={32} className="text-slate-400 mx-auto" />
              <h3 className="text-base font-black text-slate-900">No items listed yet</h3>
              <button
                onClick={() => {
                  setModalDefaultType(isAdmin ? 'foreign_number' : 'social_account');
                  setIsModalOpen(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-wider cursor-pointer"
              >
                + Create First Listing
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myListings.map(listing => (
                <div
                  key={listing.id}
                  onClick={() => handleClickListing(listing)}
                  className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between hover:border-emerald-200"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500">
                        {listing.marketplace_categories?.icon} {listing.marketplace_categories?.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                          listing.status === 'sold'
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {listing.status}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteListing(e, listing.id)}
                            className="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <h4 className="font-black text-slate-900 text-sm">{listing.title}</h4>
                    <p className="text-xs text-slate-500 line-clamp-1">{listing.description}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="font-black text-emerald-600 font-mono text-base">
                      ₦{Number(listing.price).toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                      <Eye size={12} /> {listing.views || 0} views
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Create Listing Modal ─────────────────────────────────────── */}
      <CreateListingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        categories={categories}
        sellerId={user?.id || user?.uid}
        isAdmin={isAdmin}
        defaultType={modalDefaultType}
        onSuccess={() => {
          loadListings();
          loadMyListings();
        }}
      />

      {/* ── Listing Details Modal (for non-phone items) ─── */}
      {selectedListing && (
        <ListingDetailsModal
          listing={selectedListing}
          currentUser={user}
          onClose={() => setSelectedListing(null)}
          onStartOrder={(order) => {
            setSelectedListing(null);
            setSelectedOrderId(order.id);
            setActiveTab('purchases');
            loadMyPurchases();
          }}
        />
      )}

      {/* ── Realtime Order Chat, Code Request & Auto-Wallet Debit Modal ─── */}
      {selectedOrderId && (
        <MarketplaceOrderChatModal
          orderId={selectedOrderId}
          currentUser={user}
          onClose={() => setSelectedOrderId(null)}
          onOrderUpdated={() => {
            loadMyPurchases(true);
            loadListings();
            if (isAdmin) loadAdminOrders(true);
          }}
        />
      )}

      {/* ── Direct eSIM Live Admin Chat Modal ─── */}
      <EsimChatModal
        isOpen={isEsimModalOpen}
        currentUser={user}
        initialPackage={selectedEsimPackage}
        onClose={() => setIsEsimModalOpen(false)}
      />
    </div>
  );
}
