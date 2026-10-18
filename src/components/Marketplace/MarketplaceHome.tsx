import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingBag, Search, Plus, Phone, Users, ShieldCheck, 
  ExternalLink, Eye, Star, Clock, CheckCircle2, Package, Tag, Filter
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
  const [activeTab, setActiveTab] = useState<'browse' | 'purchases' | 'my-listings'>('browse');

  // User purchases & listings
  const [myPurchases, setMyPurchases] = useState<MarketplaceOrder[]>([]);
  const [myListings, setMyListings] = useState<MarketplaceListing[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEsimModalOpen, setIsEsimModalOpen] = useState(false);
  const [selectedEsimPackage, setSelectedEsimPackage] = useState<string>('us-5gb');
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Load categories and initial listings
  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (activeTab === 'browse') {
      loadListings();
    } else if (activeTab === 'purchases') {
      loadMyPurchases();
    } else if (activeTab === 'my-listings') {
      loadMyListings();
    }
  }, [selectedCategory, selectedType, activeTab]);

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

  const loadMyPurchases = async () => {
    if (!user?.id && !user?.uid) return;
    setLoading(true);
    try {
      const data = await marketplaceService.getMyPurchases(user.id || user.uid);
      setMyPurchases(data);
    } catch (err) {
      console.error('Failed to load purchases:', err);
    } finally {
      setLoading(false);
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadListings();
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header Banner ────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-emerald-950/10 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 to-transparent pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-black uppercase tracking-widest">
              <ShieldCheck size={14} className="text-emerald-300" />
              Verified Escrow Protection
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              NORODATA Digital Marketplace
            </h1>
            <p className="text-emerald-100/80 text-xs sm:text-sm font-medium leading-relaxed">
              Buy and sell foreign phone numbers (USA, UK, Canada) and verified social media accounts with instant wallet checkout and protected delivery.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-3 rounded-2xl bg-white text-emerald-900 hover:bg-emerald-50 font-black text-xs uppercase tracking-wider shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Plus size={16} className="text-emerald-700" />
              Sell an Item
            </button>
          </div>
        </div>

        {/* Navigation Tabs inside Header */}
        <div className="flex items-center gap-2 mt-6 pt-6 border-t border-emerald-600/50">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${
              activeTab === 'browse'
                ? 'bg-white text-emerald-900 shadow-md'
                : 'text-emerald-100 hover:bg-emerald-700/50'
            }`}
          >
            🛍️ Browse Store
          </button>
          <button
            onClick={() => setActiveTab('purchases')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${
              activeTab === 'purchases'
                ? 'bg-white text-emerald-900 shadow-md'
                : 'text-emerald-100 hover:bg-emerald-700/50'
            }`}
          >
            📦 My Purchases ({myPurchases.length})
          </button>
          <button
            onClick={() => setActiveTab('my-listings')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${
              activeTab === 'my-listings'
                ? 'bg-white text-emerald-900 shadow-md'
                : 'text-emerald-100 hover:bg-emerald-700/50'
            }`}
          >
            🏷️ My Listings ({myListings.length})
          </button>
        </div>
      </div>

      {/* ── BROWSE TAB CONTENT ────────────────────────────────────────── */}
      {activeTab === 'browse' && (
        <div className="space-y-6">
          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Type tabs (Foreign Numbers vs Social Accounts) */}
            <div className="flex items-center gap-1.5 p-1 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
              <button
                onClick={() => { setSelectedType('all'); setSelectedCategory('all'); }}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide transition whitespace-nowrap ${
                  selectedType === 'all'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Digital Assets
              </button>
              <button
                onClick={() => { setSelectedType('foreign_number'); setSelectedCategory('all'); }}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide transition flex items-center gap-1.5 whitespace-nowrap ${
                  selectedType === 'foreign_number'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📱</span> Foreign Numbers
              </button>
              <button
                onClick={() => { setSelectedType('social_account'); setSelectedCategory('all'); }}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide transition flex items-center gap-1.5 whitespace-nowrap ${
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
                placeholder="Search numbers, accounts, handles…"
                className="w-full bg-white border border-slate-200/80 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
              />
            </form>
          </div>

          {/* Sub-Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
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
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition flex items-center gap-1.5 ${
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

          {/* eSIM Instant Admin Desk Banner */}
          <div className="bg-gradient-to-r from-teal-900 via-emerald-800 to-slate-900 rounded-3xl p-5 sm:p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-5 border border-emerald-500/30 shadow-lg relative overflow-hidden">
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl border border-white/20 shrink-0 shadow-inner">
                📶
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-base sm:text-lg tracking-tight">Need an eSIM for Travel or Global Roaming?</h4>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950">Active</span>
                </div>
                <p className="text-xs text-emerald-100/80 font-medium max-w-xl leading-relaxed">
                  Instant USA, UK, Europe (33 countries) & 150+ country eSIM data profiles. Click to open live chat with Admin for instant provisioning & QR code setup.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedEsimPackage('us-5gb');
                setIsEsimModalOpen(true);
              }}
              className="px-6 py-3 rounded-2xl bg-white hover:bg-emerald-50 text-emerald-950 font-black text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 active:scale-95 relative z-10"
            >
              <span>💬 Message Admin for eSIM</span>
            </button>
          </div>

          {/* eSIM Quick Packages Rack */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
            {[
              { id: 'us-5gb', label: 'USA 5GB High-Speed', flag: '🇺🇸', price: '₦8,500', days: '30 Days', desc: 'T-Mobile 5G nationwide coverage with instant QR setup' },
              { id: 'us-10gb', label: 'USA 10GB High-Speed', flag: '🇺🇸', price: '₦14,000', days: '30 Days', desc: 'Heavy data streaming, maps & tethering across America' },
              { id: 'uk-10gb', label: 'UK 10GB + UK Number', flag: '🇬🇧', price: '₦12,500', days: '30 Days', desc: 'High-speed 5G data across UK & Europe + phone number' },
              { id: 'global-5gb', label: 'Global 150+ Countries', flag: '🌍', price: '₦16,000', days: '30 Days', desc: 'Seamless international roaming with zero excess fees' }
            ].map(pkg => (
              <div
                key={pkg.id}
                className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between text-left group"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{pkg.flag}</span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {pkg.days}
                    </span>
                  </div>
                  <h4 className="font-black text-slate-900 text-sm">{pkg.label}</h4>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{pkg.desc}</p>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="font-black text-emerald-700 text-sm">{pkg.price}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEsimPackage(pkg.id);
                      setIsEsimModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1"
                  >
                    <span>Message Admin</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Listings Grid */}
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading digital products…</p>
            </div>
          ) : listings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-bold">
                🛍️
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-lg font-black text-slate-900">No Listings Found</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Be the first to list a foreign phone number or verified social account for sale!
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-md transition"
              >
                + Post New Listing
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {listings.map((item) => {
                const cat = item.marketplace_categories;
                const isPhone = cat?.type === 'foreign_number';
                const isEsim = cat?.type === 'esim' || item.id.startsWith('esim-');
                const sellerName = item.profiles?.full_name || item.profiles?.name || 'Verified Seller';
                const rating = item.profiles?.marketplace_seller_rating || 5.0;

                return (
                  <motion.div
                    key={item.id}
                    whileHover={{ y: -4 }}
                    className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-200/60 transition-all flex flex-col justify-between cursor-pointer group"
                    onClick={() => {
                      if (isEsim) {
                        setSelectedEsimPackage(item.id.replace('esim-', ''));
                        setIsEsimModalOpen(true);
                      } else {
                        setSelectedListing(item);
                        onOpenListing?.(item.id);
                      }
                    }}
                  >
                    <div>
                      {/* Category Badge & Icon */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-bold">
                          <span>{cat?.icon || (isEsim ? '📶' : isPhone ? '📱' : '🌐')}</span>
                          <span>{cat?.name || (isEsim ? 'eSIM Profile' : isPhone ? 'Phone Number' : 'Social Account')}</span>
                        </span>
                        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
                          <Eye size={13} />
                          <span>{item.views || 0}</span>
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
                          <span className="font-bold text-slate-700 truncate">
                            {item.product_details.item_identifier || item.product_details.phone_number || item.product_details.username || 'Instant Delivery'}
                          </span>
                          <span className="text-[10px] uppercase font-black tracking-wider text-emerald-600 shrink-0 ml-2">
                            Verified
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom: Price, Seller & CTA */}
                    <div className="pt-3 border-t border-slate-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Price</p>
                          <p className="text-xl font-black text-emerald-600 font-mono">
                            ₦{Number(item.price).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-bold text-slate-800 truncate max-w-[120px]">{sellerName}</p>
                          <div className="flex items-center justify-end gap-1 text-[10px] text-amber-500 font-bold">
                            <Star size={11} fill="currentColor" />
                            <span>{Number(rating).toFixed(1)}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isEsim) {
                            setSelectedEsimPackage(item.id.replace('esim-', ''));
                            setIsEsimModalOpen(true);
                          } else if (onOpenListing) {
                            onOpenListing(item.id);
                          } else {
                            setSelectedListing(item);
                          }
                        }}
                        className="w-full py-2.5 rounded-2xl bg-slate-900 group-hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        <span>{isEsim ? '💬 Chat Admin & Buy eSIM' : 'Chat & Buy'}</span>
                        <ExternalLink size={13} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MY PURCHASES TAB ─────────────────────────────────────────── */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">Your Marketplace Purchases</h2>
            <span className="text-xs text-slate-500 font-semibold">{myPurchases.length} orders total</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500 font-bold uppercase tracking-widest">
              Loading orders…
            </div>
          ) : myPurchases.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
              <Package size={32} className="text-slate-400 mx-auto" />
              <h3 className="text-base font-black text-slate-900">No purchases yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Browse foreign phone numbers and social media accounts in the store to get started.
              </p>
              <button
                onClick={() => setActiveTab('browse')}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-wider"
              >
                Browse Store
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
                      <span className="text-[11px] font-mono text-slate-400">Order #{order.id.slice(0, 8)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                        order.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : order.status === 'paid'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                    <h4 className="font-black text-slate-900 text-sm">
                      {order.marketplace_listings?.title || 'Marketplace Item'}
                    </h4>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="font-black text-emerald-600 font-mono text-base">
                      ₦{Number(order.price).toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      Open Chat & Details →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MY LISTINGS TAB ──────────────────────────────────────────── */}
      {activeTab === 'my-listings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">Your Active & Sold Listings</h2>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5"
            >
              <Plus size={14} /> New Listing
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500 font-bold uppercase tracking-widest">
              Loading listings…
            </div>
          ) : myListings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
              <Tag size={32} className="text-slate-400 mx-auto" />
              <h3 className="text-base font-black text-slate-900">You haven't listed any items yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Turn your foreign phone numbers or high-engagement social accounts into cash.
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-wider"
              >
                + Create First Listing
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myListings.map(listing => (
                <div
                  key={listing.id}
                  onClick={() => setSelectedListing(listing)}
                  className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between hover:border-emerald-200"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500">
                        {listing.marketplace_categories?.icon} {listing.marketplace_categories?.name}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                        listing.status === 'sold'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {listing.status}
                      </span>
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
        onSuccess={() => {
          loadListings();
          loadMyListings();
        }}
      />

      {/* ── Listing Details & Purchase Trigger Modal ─────────────────── */}
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

      {/* ── Realtime Order Chat, Wallet Payment & Verification Modal ─── */}
      {selectedOrderId && (
        <MarketplaceOrderChatModal
          orderId={selectedOrderId}
          currentUser={user}
          onClose={() => setSelectedOrderId(null)}
          onOrderUpdated={() => {
            loadMyPurchases();
            loadMyListings();
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
