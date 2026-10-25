import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  MessageSquare, Send, CheckCircle2, Clock, AlertCircle, 
  Smartphone, Globe, Phone, Mail, RefreshCw, Search, 
  Check, Copy, QrCode, User, ExternalLink, ShieldAlert, Sparkles, Filter,
  Key, Wallet, Plus, ShieldCheck, Trash2, X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { marketplaceService, MarketplaceOrder, MarketplaceMessage, MarketplaceCategory, EsimPlan } from '../lib/marketplaceService';
import { CreateListingModal } from './Marketplace/CreateListingModal';

export interface EsimInquiry {
  id: string;
  user_id?: string;
  user_name: string;
  user_email: string;
  user_phone?: string;
  package_id?: string;
  package_label: string;
  package_price: string;
  destination_country: string;
  device_model: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  last_message?: string;
  last_message_at?: string;
  activation_code?: string;
  qr_code_url?: string;
  messages: Array<{
    id: string;
    sender: 'user' | 'admin';
    sender_name?: string;
    sender_email?: string;
    text: string;
    created_at: string;
    has_qr?: boolean;
    activation_code?: string;
  }>;
}

const DEFAULT_INQUIRIES: EsimInquiry[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Foreign Numbers & Buyer Chats Admin Desk
// ─────────────────────────────────────────────────────────────────────────────
function ForeignNumbersAdminDesk({ user, adminEmail }: { user: any; adminEmail: string }) {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<MarketplaceOrder | null>(null);
  const [messages, setMessages] = useState<MarketplaceMessage[]>([]);
  const [buyerBalance, setBuyerBalance] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [verificationCode, setVerificationCode] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [fulfilling, setFulfilling] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [createListingOpen, setCreateListingOpen] = useState(false);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await marketplaceService.getAdminOrders();
      setOrders(data);
      if (!selectedOrderId && data.length > 0) {
        setSelectedOrderId(data[0].id);
      }
    } catch (err: any) {
      console.warn('[ForeignNumbersAdminDesk] Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    loadOrders();
    marketplaceService.getCategories().then(setCategories).catch(() => {});
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  // Load selected order details live from database
  useEffect(() => {
    if (!selectedOrderId) {
      setActiveOrder(null);
      setMessages([]);
      return;
    }
    let active = true;

    const fetchDetails = async () => {
      try {
        const details = await marketplaceService.getOrderDetails(selectedOrderId);
        if (!active) return;
        if (details.order) setActiveOrder(details.order);
        if (details.messages) setMessages(details.messages);
        if (typeof details.buyerBalance === 'number') {
          setBuyerBalance(details.buyerBalance);
        } else if (details.order?.buyer?.wallet_balance !== undefined) {
          setBuyerBalance(Number(details.order.buyer.wallet_balance));
        }
      } catch (err: any) {
        console.warn('[ForeignNumbersAdminDesk] Error fetching details:', err);
      }
    };

    fetchDetails();
    const interval = setInterval(fetchDetails, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedOrderId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleAdminSendCodeAndComplete = async () => {
    if (!activeOrder) return;
    if (!verificationCode.trim()) {
      toast.error('Please enter the verification code');
      return;
    }
    const price = Number(activeOrder.price || 0);
    if (buyerBalance < price) {
      toast.error('Buyer balance too low');
      return;
    }

    try {
      setFulfilling(true);
      await marketplaceService.sendCodeAndComplete(activeOrder.id, verificationCode.trim());
      setVerificationCode('');
      toast.success(`Success! Verification code delivered & ₦${price.toLocaleString()} debited.`);
      const details = await marketplaceService.getOrderDetails(activeOrder.id);
      if (details.order) setActiveOrder(details.order);
      if (details.messages) setMessages(details.messages);
      if (typeof details.buyerBalance === 'number') setBuyerBalance(details.buyerBalance);
      loadOrders();
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete order');
    } finally {
      setFulfilling(false);
    }
  };

  const handleSendTextMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder || !adminMessage.trim()) return;

    try {
      setSendingMsg(true);
      const userId = user?.id || user?.uid || 'admin';
      await marketplaceService.sendMessage(activeOrder.id, userId, adminMessage.trim());
      setAdminMessage('');
      const details = await marketplaceService.getOrderDetails(activeOrder.id);
      if (details.order) setActiveOrder(details.order);
      if (details.messages) setMessages(details.messages);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message');
    } finally {
      setSendingMsg(false);
    }
  };

  const copyPhoneNumber = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(true);
    toast.success('Number copied!');
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success('Code copied!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Search & Filter
  const filteredOrders = orders.filter((o) => {
    const isCompleted = o.status === 'completed';
    if (statusFilter === 'open' && isCompleted) return false;
    if (statusFilter === 'completed' && !isCompleted) return false;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;

    const buyerEmail = (o.buyer?.email || '').toLowerCase();
    const buyerName = (o.buyer?.full_name || o.buyer?.name || '').toLowerCase();
    const phone = (o.phone_number || o.clicked_number || o.marketplace_listings?.product_details?.phone_number || '').toLowerCase();
    const orderId = (o.id || '').toLowerCase();
    return buyerEmail.includes(q) || buyerName.includes(q) || phone.includes(q) || orderId.includes(q);
  });

  const openCount = orders.filter((o) => o.status !== 'completed').length;
  const completedCount = orders.filter((o) => o.status === 'completed').length;

  const currentNumber =
    activeOrder?.phone_number ||
    activeOrder?.clicked_number ||
    activeOrder?.marketplace_listings?.product_details?.phone_number ||
    '';
  const currentPrice = Number(activeOrder?.price || 0);

  return (
    <div className="space-y-4">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-3xl p-5 text-white border border-emerald-500/30 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Phone size={18} />
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Foreign Numbers & Buyer Chats Desk
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-400 text-slate-950">
              Live Hub
            </span>
          </div>
          <p className="text-xs text-emerald-100/70 font-medium max-w-2xl">
            Handle buyer orders, check live wallet funding, answer customer inquiries, and deliver verification codes with auto-debit protection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setCreateListingOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-md transition cursor-pointer"
          >
            <Plus size={14} />
            <span>+ Post Foreign Number</span>
          </button>
          <button
            type="button"
            onClick={loadOrders}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm space-y-0.5">
          <p className="text-[10px] uppercase font-bold text-slate-400">Total Buyer Chats</p>
          <p className="text-xl font-black text-slate-900">{orders.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 border border-amber-100 shadow-sm space-y-0.5">
          <p className="text-[10px] uppercase font-bold text-amber-600">🟡 Open Chats</p>
          <p className="text-xl font-black text-amber-600">{openCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 border border-emerald-100 shadow-sm space-y-0.5">
          <p className="text-[10px] uppercase font-bold text-emerald-600">🟢 Completed Deals</p>
          <p className="text-xl font-black text-emerald-600">{completedCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 border border-blue-100 shadow-sm space-y-0.5">
          <p className="text-[10px] uppercase font-bold text-blue-600">🛡️ Auto-Debit Guard</p>
          <p className="text-xs font-bold text-blue-700 mt-1">Atomic Locking</p>
        </div>
      </div>

      {/* Main Chat Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-slate-900/60 rounded-3xl p-2 sm:p-3 border border-slate-800">
        {/* LEFT COLUMN: Buyer Chats List (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-col h-[680px]">
          {/* Search bar */}
          <div className="space-y-2.5 pb-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Search buyer email, phone number, order ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-emerald-500 font-medium text-slate-800"
              />
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`flex-1 py-1 rounded-lg transition cursor-pointer text-center ${
                  statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('open')}
                className={`flex-1 py-1 rounded-lg transition cursor-pointer text-center ${
                  statusFilter === 'open' ? 'bg-amber-500 text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Open ({openCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`flex-1 py-1 rounded-lg transition cursor-pointer text-center ${
                  statusFilter === 'completed' ? 'bg-emerald-600 text-white shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Completed ({completedCount})
              </button>
            </div>
          </div>

          {/* List Items */}
          <div className="flex-1 overflow-y-auto space-y-2 pt-3 pr-1">
            {filteredOrders.length === 0 ? (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <MessageSquare className="mx-auto text-slate-300" size={32} />
                <p className="text-xs font-semibold">No buyer chats found</p>
              </div>
            ) : (
              filteredOrders.map((ord) => {
                const isSelected = ord.id === activeOrder?.id;
                const buyerLabel = ord.buyer?.full_name || ord.buyer?.name || ord.buyer?.email || 'Buyer';
                const phone = ord.phone_number || ord.clicked_number || ord.marketplace_listings?.product_details?.phone_number || '';
                const isDone = ord.status === 'completed';

                return (
                  <div
                    key={ord.id}
                    onClick={() => setSelectedOrderId(ord.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-400 shadow-sm'
                        : 'bg-white hover:bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <span className="font-black text-xs text-slate-900 block truncate">
                          {buyerLabel}
                        </span>
                        {ord.buyer?.email && (
                          <span className="text-[10px] text-slate-400 font-mono block truncate">
                            {ord.buyer.email}
                          </span>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${
                          isDone
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {isDone ? 'Completed' : 'Open'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold text-emerald-800 my-1">
                      <span className="font-mono">{phone || 'Foreign Number'}</span>
                      <span className="text-slate-900">₦{Number(ord.price || 0).toLocaleString()}</span>
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-1 mb-1.5">
                      {ord.last_message || ord.messages?.[ord.messages.length - 1]?.content || 'Chat initiated'}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-mono">ID: {ord.id.substring(0, 10)}...</span>
                      <span>
                        {new Date(ord.updated_at || ord.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Active Chat & Fulfillment Workspace (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-5 flex flex-col h-[680px]">
          {activeOrder ? (
            <>
              {/* TOP HEADER: Buyer name/email, Number, Price, Live Balance, Status line */}
              <div className="pb-3 border-b border-slate-100 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-slate-900 truncate">
                        {activeOrder.buyer?.full_name || activeOrder.buyer?.name || 'Buyer'}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          activeOrder.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {activeOrder.status === 'completed' ? 'Completed' : 'Open Chat'}
                      </span>
                    </div>
                    {activeOrder.buyer?.email && (
                      <p className="text-xs text-slate-500 font-mono">{activeOrder.buyer.email}</p>
                    )}
                  </div>

                  {currentNumber && (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shrink-0">
                      <span className="font-mono font-bold text-xs text-slate-800">{currentNumber}</span>
                      <button
                        type="button"
                        onClick={() => copyPhoneNumber(currentNumber)}
                        className="text-emerald-600 hover:text-emerald-700 p-1 cursor-pointer"
                        title="Copy number"
                      >
                        {copiedPhone ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Financial bar & clear indicator line */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-3 text-xs">
                    <span>
                      Price: <strong className="font-black text-slate-900">₦{currentPrice.toLocaleString()}</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      Buyer Wallet:{' '}
                      <strong className="font-black text-slate-900">
                        ₦{buyerBalance.toLocaleString()}
                      </strong>
                    </span>
                  </div>

                  {/* Clear line: "Enough balance" (green) or "Short by ₦X" (red) */}
                  <div>
                    {buyerBalance >= currentPrice ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 size={13} className="text-emerald-600" />
                        Enough balance
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-300">
                        <AlertCircle size={13} className="text-red-600" />
                        Short by ₦{(currentPrice - buyerBalance).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Chat Messages Feed */}
              <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1">
                {messages.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <Sparkles className="mx-auto mb-2 opacity-50" size={24} />
                    <p className="text-xs">No messages yet. Send a message to buyer below.</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isVerificationCode = m.message_type === 'verification_code';
                    const isFromAdmin =
                      m.sender_role === 'admin' ||
                      m.sender_role === 'operator' ||
                      m.sender_id === 'admin' ||
                      m.sender_id === user?.id;

                    return (
                      <div
                        key={m.id}
                        className={`flex ${isFromAdmin ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl p-3 text-xs ${
                            isVerificationCode
                              ? 'bg-emerald-950 border-2 border-emerald-500 text-emerald-100 shadow-lg w-full max-w-sm'
                              : isFromAdmin
                              ? 'bg-emerald-600 text-white rounded-br-none'
                              : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <span className="font-black uppercase tracking-wider text-[9px] opacity-80">
                              {isFromAdmin ? '👑 Official Admin Desk' : activeOrder.buyer?.full_name || 'Buyer'}
                            </span>
                            <span className="text-[9px] opacity-60">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {isVerificationCode ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 font-black text-emerald-300 uppercase tracking-wider text-[11px]">
                                <Key size={14} />
                                <span>Verification Code Delivered</span>
                              </div>
                              <p className="text-slate-300">{m.content || m.body}</p>
                              <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-emerald-500/40">
                                <span className="font-mono text-base font-black text-emerald-400 tracking-widest">
                                  {m.code_value}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => copyCode(m.code_value || '')}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap leading-relaxed">{m.content || m.body}</p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Admin Fulfillment Box & Regular Message Input */}
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                {/* Admin Fulfillment Box */}
                {activeOrder.status !== 'completed' ? (
                  <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-emerald-300 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                        <Key size={13} />
                        Admin Fulfillment (Atomic Auto-Debit)
                      </span>
                      <span className={buyerBalance >= currentPrice ? 'text-emerald-400' : 'text-red-400'}>
                        Buyer: ₦{buyerBalance.toLocaleString()} {buyerBalance >= currentPrice ? '(Ready)' : '(Short)'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="Enter verification code (e.g. 849-201)..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAdminSendCodeAndComplete}
                        disabled={fulfilling || !verificationCode.trim()}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition disabled:opacity-50 shadow-md cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                      >
                        {fulfilling ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        <span>Send Code & Complete (debit ₦{currentPrice.toLocaleString()})</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-2.5 text-emerald-800 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                      <span>Deal Completed! ₦{currentPrice.toLocaleString()} was debited from buyer wallet.</span>
                    </div>
                    {activeOrder.payment_reference && (
                      <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-emerald-300">
                        {activeOrder.payment_reference}
                      </span>
                    )}
                  </div>
                )}

                {/* Plain Text Message Input */}
                <form onSubmit={handleSendTextMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={adminMessage}
                    onChange={(e) => setAdminMessage(e.target.value)}
                    placeholder="Type a plain message to buyer (e.g. 'Fund your wallet and come back')..."
                    disabled={sendingMsg}
                    className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 text-xs font-medium"
                  />
                  <button
                    type="submit"
                    disabled={sendingMsg || !adminMessage.trim()}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {sendingMsg ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                    <span>Send Message</span>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center space-y-2">
                <MessageSquare className="mx-auto text-slate-300" size={36} />
                <p className="text-xs font-semibold">Select a buyer chat from the left to start fulfilling</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Post Foreign Number Modal */}
      {createListingOpen && (
        <CreateListingModal
          isOpen={createListingOpen}
          onClose={() => setCreateListingOpen(false)}
          categories={categories}
          sellerId={user?.id || 'admin'}
          isAdmin={true}
          defaultType="foreign_number"
          onSuccess={() => {
            setCreateListingOpen(false);
            loadOrders();
            toast.success('Foreign Number posted successfully!');
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin eSIM Plans Management Section (Zero Hardcoded — Admins Post Real Plans)
// ─────────────────────────────────────────────────────────────────────────────
function EsimPlansAdminSection({ adminEmail: _adminEmail }: { adminEmail: string }) {
  const [plans, setPlans] = useState<EsimPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [country, setCountry] = useState('United States');
  const [flag, setFlag] = useState('🇺🇸');
  const [dataAmount, setDataAmount] = useState('5GB');
  const [duration, setDuration] = useState('30 Days');
  const [price, setPrice] = useState('');
  const [carrier, setCarrier] = useState('AT&T / T-Mobile 5G');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      const res = await marketplaceService.getEsimPlans();
      setPlans(res);
    } catch (_) {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const numPrice = Number(price);
    if (!title.trim() || isNaN(numPrice) || numPrice <= 0) {
      toast.error('Please enter a valid title and positive numeric price');
      return;
    }
    try {
      setSaving(true);
      const res = await marketplaceService.createEsimPlan({
        title: title.trim(),
        country: country.trim(),
        flag: flag.trim() || '🌐',
        data_amount: dataAmount.trim(),
        duration: duration.trim(),
        numericPrice: numPrice,
        price: `₦${numPrice.toLocaleString()}`,
        carrier: carrier.trim(),
        desc: desc.trim() || `${dataAmount} • ${duration} • ${carrier}`,
      });
      if (res.plan) {
        setPlans(prev => [res.plan, ...prev]);
        toast.success(`eSIM Plan "${res.plan.title}" posted successfully!`);
        setShowAddModal(false);
        setTitle('');
        setPrice('');
        setDesc('');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await marketplaceService.deleteEsimPlan(id);
      setPlans(prev => prev.filter(p => p.id !== id));
      toast.success('eSIM Plan deleted successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete plan');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-3xl p-6 text-white border border-teal-500/30 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <Globe size={20} />
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">Real eSIM Packages Manager</h2>
          </div>
          <p className="text-xs text-teal-100/70 mt-1 max-w-xl">
            Post and manage real international eSIM packages. Users see these plans live on the Marketplace and can request instant activation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-black text-xs shadow-lg transition cursor-pointer shrink-0"
        >
          <Plus size={16} />
          <span>+ Post New eSIM Plan</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
          <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-bold">Loading active eSIM packages...</p>
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 px-6 bg-white rounded-3xl border border-slate-200 space-y-3 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 text-2xl mx-auto font-black">
            📶
          </div>
          <h3 className="text-base font-black text-slate-900">No eSIM packages currently posted</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            You have not posted any real eSIM packages yet. Click the button below to add your first package with live pricing.
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow transition cursor-pointer"
          >
            <Plus size={14} />
            <span>+ Add First eSIM Package</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-teal-400 shadow-sm transition space-y-3 relative group"
            >
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                title="Delete Plan"
                className="absolute top-4 right-4 p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition cursor-pointer"
              >
                <Trash2 size={14} />
              </button>

              <div className="flex items-center gap-3 pr-10">
                <span className="text-3xl">{p.flag || '📶'}</span>
                <div>
                  <h4 className="font-black text-slate-900 text-sm line-clamp-1">{p.title}</h4>
                  <p className="text-[11px] text-slate-400 font-semibold">{p.country}</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between text-xs border border-slate-100">
                <span className="text-slate-500 font-bold">{p.data_amount} • {p.duration}</span>
                <span className="font-black text-teal-700 text-sm">{p.price}</span>
              </div>

              <p className="text-xs text-slate-500 line-clamp-2">{p.desc || p.carrier}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add Plan Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 border border-slate-200">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center text-2xl font-black shrink-0">
                📶
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Post Real eSIM Package</h3>
                <p className="text-xs text-slate-500">Live inventory for customers on NORODATA</p>
              </div>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Country / Region</label>
                  <input
                    type="text"
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. United States, UK"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Flag Emoji</label>
                  <input
                    type="text"
                    required
                    value={flag}
                    onChange={(e) => setFlag(e.target.value)}
                    placeholder="e.g. 🇺🇸, 🇬🇧, 🌍"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Package Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. USA 5GB (30 Days) 5G Data"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Data Amount</label>
                  <input
                    type="text"
                    required
                    value={dataAmount}
                    onChange={(e) => setDataAmount(e.target.value)}
                    placeholder="e.g. 5GB, 10GB"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Duration</label>
                  <input
                    type="text"
                    required
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g. 30 Days"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Price (₦)</label>
                  <input
                    type="number"
                    required
                    min="100"
                    step="50"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 8500"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Carrier / Network</label>
                  <input
                    type="text"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="e.g. AT&T / T-Mobile 5G"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description (Optional)</label>
                <input
                  type="text"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="e.g. Instant QR Code • Non-VoIP Data"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold transition shadow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span>{saving ? 'Publishing...' : 'Publish Package'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Admin Component with Top Mode Switcher
// ─────────────────────────────────────────────────────────────────────────────
export function AdminEsimMessages() {
  const { user } = useAuth();
  const [deskMode, setDeskMode] = useState<'foreign-numbers' | 'esim' | 'esim-plans'>('foreign-numbers');
  const [inquiries, setInquiries] = useState<EsimInquiry[]>([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [activationCodeInput, setActivationCodeInput] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const adminEmail = user?.email?.toLowerCase() || 'jeffholland299@gmail.com';

  const loadInquiries = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      
      const res = await fetch('/api/esim/inquiries', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'x-admin-email': adminEmail
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.inquiries) && data.inquiries.length > 0) {
          setInquiries(data.inquiries);
          if (!selectedInquiryId && data.inquiries[0]) {
            setSelectedInquiryId(data.inquiries[0].id);
          }
          return;
        }
      }

      // Check localStorage backup
      const local = localStorage.getItem('noroya_esim_inquiries');
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const real = parsed.filter((i: any) => !['inq-sample-1', 'inq-sample-2'].includes(i?.id));
            setInquiries(real);
            if (!selectedInquiryId && real[0]) {
              setSelectedInquiryId(real[0].id);
            }
            return;
          }
        } catch (_) {}
      }

      setInquiries([]);
    } catch (err: any) {
      console.warn('[AdminEsimMessages] Error loading inquiries:', err);
      setInquiries([]);
    } finally {
      setLoading(false);
    }
  }, [adminEmail, selectedInquiryId]);

  useEffect(() => {
    loadInquiries();
    const interval = setInterval(loadInquiries, 8000);
    return () => clearInterval(interval);
  }, [loadInquiries]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedInquiryId, inquiries]);

  const activeInquiry = inquiries.find(inq => inq.id === selectedInquiryId) || inquiries[0];

  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim() && !activationCodeInput.trim()) return;
    if (!activeInquiry) return;

    setSending(true);
    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: 'admin' as const,
      sender_name: 'eSIM Admin Desk',
      sender_email: adminEmail,
      text: replyText.trim() || (activationCodeInput ? `Here is your official digital eSIM activation profile: ${activationCodeInput.trim()}` : ''),
      created_at: new Date().toISOString(),
      activation_code: activationCodeInput.trim() || undefined,
      has_qr: Boolean(activationCodeInput.trim())
    };

    const updatedInquiries = inquiries.map(inq => {
      if (inq.id === activeInquiry.id) {
        return {
          ...inq,
          messages: [...inq.messages, newMsg],
          last_message: newMsg.text,
          last_message_at: newMsg.created_at,
          status: inq.status === 'pending' ? ('in_progress' as const) : inq.status,
          activation_code: activationCodeInput.trim() || inq.activation_code,
          updated_at: new Date().toISOString()
        };
      }
      return inq;
    });

    setInquiries(updatedInquiries);
    localStorage.setItem('noroya_esim_inquiries', JSON.stringify(updatedInquiries));
    setReplyText('');
    setActivationCodeInput('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      await fetch(`/api/esim/inquiries/${activeInquiry.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'x-admin-email': adminEmail
        },
        body: JSON.stringify({
          sender: 'admin',
          sender_name: 'eSIM Admin Desk',
          sender_email: adminEmail,
          text: newMsg.text,
          activation_code: newMsg.activation_code
        })
      });
      toast.success('Reply sent to customer!');
    } catch (_) {
      toast.success('Reply recorded in live eSIM desk');
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (newStatus: EsimInquiry['status']) => {
    if (!activeInquiry) return;
    setUpdatingStatus(true);

    const updatedInquiries = inquiries.map(inq => {
      if (inq.id === activeInquiry.id) {
        return { ...inq, status: newStatus, updated_at: new Date().toISOString() };
      }
      return inq;
    });

    setInquiries(updatedInquiries);
    localStorage.setItem('noroya_esim_inquiries', JSON.stringify(updatedInquiries));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      await fetch(`/api/esim/inquiries/${activeInquiry.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'x-admin-email': adminEmail
        },
        body: JSON.stringify({ status: newStatus })
      });
      toast.success(`Inquiry marked as ${newStatus.replace('_', ' ').toUpperCase()}`);
    } catch (_) {
      toast.success(`Status updated to ${newStatus.replace('_', ' ').toUpperCase()}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const filteredInquiries = inquiries.filter(inq => {
    const matchesFilter = filterStatus === 'all' || inq.status === filterStatus;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      inq.user_name.toLowerCase().includes(q) || 
      inq.user_email.toLowerCase().includes(q) || 
      (inq.user_phone && inq.user_phone.toLowerCase().includes(q)) ||
      inq.package_label.toLowerCase().includes(q) ||
      inq.destination_country.toLowerCase().includes(q) ||
      inq.device_model.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const pendingCount = inquiries.filter(i => i.status === 'pending').length;
  const inProgressCount = inquiries.filter(i => i.status === 'in_progress').length;
  const completedCount = inquiries.filter(i => i.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* ── Mode Switcher: Foreign Numbers Admin vs eSIM Customer Inquiries ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-2xl border border-emerald-500/30 shadow-lg">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDeskMode('foreign-numbers')}
            className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
              deskMode === 'foreign-numbers'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Phone size={15} />
            <span>📱 Foreign Numbers & Buyer Chats</span>
          </button>
          <button
            type="button"
            onClick={() => setDeskMode('esim')}
            className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
              deskMode === 'esim'
                ? 'bg-teal-600 text-white shadow-lg'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <MessageSquare size={15} />
            <span>📶 eSIM Inquiries ({inquiries.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setDeskMode('esim-plans')}
            className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
              deskMode === 'esim-plans'
                ? 'bg-teal-600 text-white shadow-lg'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Globe size={15} />
            <span>🌐 Manage eSIM Plans</span>
          </button>
        </div>
        <span className="text-xs font-mono text-emerald-400 font-bold px-2">
          Admin: {adminEmail}
        </span>
      </div>

      {deskMode === 'foreign-numbers' ? (
        <ForeignNumbersAdminDesk user={user} adminEmail={adminEmail} />
      ) : deskMode === 'esim-plans' ? (
        <EsimPlansAdminSection adminEmail={adminEmail} />
      ) : (
        <>
          {/* Top Overview Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-3xl p-6 text-white border border-teal-500/30 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-2xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  <MessageSquare size={20} />
                </span>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                  eSIM Customer Messages & Fulfillment Desk
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-teal-400 text-slate-950">
                  Live Hub
                </span>
              </div>
              <p className="text-xs text-teal-100/70 font-medium max-w-2xl leading-relaxed">
                Manage incoming purchase inquiries, reply to users wanting to activate global eSIM profiles, send QR activation strings, and provide real-time fulfillment.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] uppercase font-bold text-teal-300/80">Active Operator</p>
                <p className="text-xs font-mono font-bold text-white truncate max-w-[200px]">{adminEmail}</p>
              </div>
              <button
                type="button"
                onClick={loadInquiries}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-1">
              <p className="text-[10px] uppercase font-bold text-slate-400">Total Inquiries</p>
              <p className="text-2xl font-black text-slate-900">{inquiries.length}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm space-y-1">
              <p className="text-[10px] uppercase font-bold text-amber-600">🟡 Pending Response</p>
              <p className="text-2xl font-black text-amber-600">{pendingCount}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm space-y-1">
              <p className="text-[10px] uppercase font-bold text-blue-600">🔵 In Progress</p>
              <p className="text-2xl font-black text-blue-600">{inProgressCount}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm space-y-1">
              <p className="text-[10px] uppercase font-bold text-emerald-600">🟢 Completed</p>
              <p className="text-2xl font-black text-emerald-600">{completedCount}</p>
            </div>
          </div>

          {/* Main Chat Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900/40 rounded-3xl p-1 md:p-3">
            {/* LEFT COLUMN: Customer Inquiry List (5 cols) */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-col h-[650px]">
              <div className="space-y-3 pb-3 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search name, phone, device..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-teal-500 font-medium text-slate-800"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setFilterStatus('all')}
                    className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                      filterStatus === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    All ({inquiries.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('pending')}
                    className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                      filterStatus === 'pending' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Pending ({pendingCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('in_progress')}
                    className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                      filterStatus === 'in_progress' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Active ({inProgressCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('completed')}
                    className={`flex-1 py-1.5 rounded-lg transition cursor-pointer text-center ${
                      filterStatus === 'completed' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Done ({completedCount})
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pt-3 pr-1">
                {filteredInquiries.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 space-y-2">
                    <MessageSquare className="mx-auto text-slate-300" size={32} />
                    <p className="text-xs font-semibold">No eSIM customer inquiries found</p>
                  </div>
                ) : (
                  filteredInquiries.map(inq => {
                    const isSelected = inq.id === activeInquiry?.id;
                    return (
                      <div
                        key={inq.id}
                        onClick={() => setSelectedInquiryId(inq.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative ${
                          isSelected
                            ? 'bg-teal-50/70 border-teal-400 shadow-sm'
                            : 'bg-white hover:bg-slate-50 border-slate-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {inq.user_name}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${
                            inq.status === 'pending'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : inq.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}>
                            {inq.status.replace('_', ' ')}
                          </span>
                        </div>

                        <p className="text-[11px] font-bold text-teal-700 truncate mb-1">
                          {inq.package_label} ({inq.package_price})
                        </p>

                        <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">
                          {inq.last_message || inq.messages[inq.messages.length - 1]?.text || 'Inquiry initiated'}
                        </p>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                          <span>📱 {inq.device_model || 'Device unspecified'}</span>
                          <span>{new Date(inq.updated_at || inq.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Active Inquiry Thread (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col h-[650px]">
              {activeInquiry ? (
                <>
                  <div className="pb-4 border-b border-slate-100 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                          <span>{activeInquiry.user_name}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            activeInquiry.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : activeInquiry.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {activeInquiry.status.replace('_', ' ')}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <Mail size={12} />
                          <span>{activeInquiry.user_email}</span>
                          {activeInquiry.user_phone && (
                            <>
                              <span>•</span>
                              <Phone size={12} />
                              <span>{activeInquiry.user_phone}</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {activeInquiry.status !== 'completed' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus('completed')}
                            disabled={updatingStatus}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          >
                            <CheckCircle2 size={13} />
                            <span>Mark Completed</span>
                          </button>
                        )}
                        {activeInquiry.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus('in_progress')}
                            disabled={updatingStatus}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          >
                            <Clock size={13} />
                            <span>In Progress</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                        <Globe size={14} className="text-teal-600" />
                        <span>Package: <strong className="text-slate-900">{activeInquiry.package_label}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                        <Smartphone size={14} className="text-teal-600" />
                        <span>Device: <strong className="text-slate-900">{activeInquiry.device_model}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1">
                    {activeInquiry.messages.map(msg => {
                      const isAdmin = msg.sender === 'admin';
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl p-3.5 text-xs ${
                              isAdmin
                                ? 'bg-teal-600 text-white rounded-br-none'
                                : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 mb-1">
                              <span className="font-bold text-[10px] uppercase opacity-75">
                                {isAdmin ? 'eSIM Admin Desk' : activeInquiry.user_name}
                              </span>
                              <span className="text-[10px] opacity-60">
                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                            {msg.activation_code && (
                              <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/80 border border-teal-400/40 text-teal-300 font-mono text-[11px] flex items-center justify-between">
                                <span>{msg.activation_code}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.activation_code || '');
                                    toast.success('Activation code copied');
                                  }}
                                  className="text-white hover:text-teal-200 p-1"
                                >
                                  <Copy size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <form onSubmit={handleSendReply} className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Type reply to customer..."
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-teal-500 font-medium text-slate-800"
                      />
                      <button
                        type="submit"
                        disabled={sending || (!replyText.trim() && !activationCodeInput.trim())}
                        className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-md"
                      >
                        <Send size={14} />
                        <span>Send</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <QrCode size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Attach eSIM Activation string or LPA code (optional)..."
                          value={activationCodeInput}
                          onChange={e => setActivationCodeInput(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:border-teal-500 font-mono text-slate-700"
                        />
                      </div>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400">
                  <div className="text-center space-y-2">
                    <MessageSquare className="mx-auto text-slate-300" size={40} />
                    <p className="text-xs font-semibold">Select an inquiry from the list to view and reply</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
