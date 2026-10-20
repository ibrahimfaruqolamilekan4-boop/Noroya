import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  X, Send, ShieldCheck, CheckCircle2, Key, Copy, Check, 
  Clock, Loader2, Sparkles, BellRing, Wallet, Phone
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { marketplaceService, MarketplaceMessage } from '../../lib/marketplaceService';

interface MarketplaceOrderChatModalProps {
  orderId: string;
  currentUser: any;
  onClose: () => void;
  onOrderUpdated?: () => void;
}

export function MarketplaceOrderChatModal({
  orderId,
  currentUser,
  onClose,
  onOrderUpdated
}: MarketplaceOrderChatModalProps) {
  const [order, setOrder] = useState<any | null>(null);
  const [messages, setMessages] = useState<MarketplaceMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [verificationInput, setVerificationInput] = useState('');
  const [sellerCodeInput, setSellerCodeInput] = useState('');
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserId = currentUser?.id || currentUser?.uid;
  const userRoleIsAdmin = currentUser?.role === 'admin' || ['ibrahimfaruqolamilekan4@gmail.com', 'adewaleogunkeye200@gmail.com', 'jeffholland299@gmail.com'].includes(String(currentUser?.email || '').toLowerCase().trim());

  const refreshOrderAndMessages = async (silent = false) => {
    try {
      const data = await marketplaceService.getOrderDetails(orderId);
      if (data.order) {
        setOrder(data.order);
      }
      if (Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
      if (typeof data.buyerBalance === 'number') {
        setWalletBalance(data.buyerBalance);
      }
      if (typeof data.isAdmin === 'boolean') {
        setIsAdminUser(data.isAdmin || userRoleIsAdmin);
      }
    } catch (err: any) {
      if (!silent) {
        console.error('[refreshOrderAndMessages] Error:', err);
        toast.error(err.message || 'Failed to load chat details.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    refreshOrderAndMessages(false);
    const interval = setInterval(() => {
      refreshOrderAndMessages(true);
    }, 3500);
    return () => clearInterval(interval);
  }, [orderId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sendingMsg) return;

    const text = inputText.trim();
    setInputText('');
    setSendingMsg(true);
    try {
      await marketplaceService.sendMessage(orderId, currentUserId, text);
      await refreshOrderAndMessages(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message.');
      setInputText(text);
    } finally {
      setSendingMsg(false);
    }
  };

  // Buyer clicks "Request Verification Code"
  const handleRequestCode = async () => {
    setRequestingCode(true);
    try {
      await marketplaceService.requestVerificationCode(orderId);
      toast.success('📲 Code request sent to Admin! Admin will send your verification code here.');
      await refreshOrderAndMessages(true);
      onOrderUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to request code.');
    } finally {
      setRequestingCode(false);
    }
  };

  // Admin/Seller sends verification code (optionally completing deal & auto-debiting buyer wallet)
  const handleSendCode = async (autoCompleteDeal: boolean) => {
    if (!sellerCodeInput.trim()) {
      toast.error('Please enter the verification OTP code or credential.');
      return;
    }

    setSendingCode(true);
    try {
      const res = await marketplaceService.sendVerificationCode(
        orderId,
        currentUserId,
        sellerCodeInput.trim(),
        autoCompleteDeal
      );
      if (res.dealCompleted) {
        toast.success(`✅ Code sent & ₦${Number(order.price).toLocaleString()} auto-debited from buyer's wallet!`);
      } else {
        toast.success('🔑 Verification code sent to buyer in chat!');
      }
      setSellerCodeInput('');
      await refreshOrderAndMessages(true);
      onOrderUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send verification code.');
    } finally {
      setSendingCode(false);
    }
  };

  // Complete deal & automatically debit buyer's wallet (callable by Admin or Buyer)
  const handleCompleteDealWithAutoDebit = async () => {
    setVerifying(true);
    try {
      const res = await marketplaceService.verifyAndComplete(orderId, verificationInput.trim());
      toast.success(`🎉 Deal completed! ₦${Number(order.price).toLocaleString()} debited automatically from wallet.`);
      setVerificationInput('');
      await refreshOrderAndMessages(true);
      onOrderUpdated?.();
      if (res.newBuyerBalance !== undefined) {
        window.dispatchEvent(new CustomEvent('wallet-balance-updated', { detail: { balance: res.newBuyerBalance } }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not complete deal.');
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedCode(null), 2500);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
        <div className="bg-white rounded-3xl p-8 flex flex-col items-center gap-3 shadow-2xl">
          <Loader2 size={32} className="animate-spin text-emerald-600" />
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Opening Live Admin Chat…</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const isBuyer = String(currentUserId) === String(order.buyer_id);
  const isSellerOrAdmin = !isBuyer && (isAdminUser || userRoleIsAdmin || String(currentUserId) === String(order.seller_id));
  const listing = order.marketplace_listings;
  const phonePreview = listing?.product_details?.phone_number || listing?.product_details?.item_identifier || '';
  const hasCodeMessage = messages.some((m) => m.message_type === 'verification_code') || Boolean(order.verification_code);

  const otherPartyName = isBuyer
    ? (order.seller?.full_name || order.seller?.name || 'NORODATA Official Admin')
    : `${order.buyer?.full_name || order.buyer?.name || 'Customer'}${order.buyer?.email ? ` (${order.buyer.email})` : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-3xl max-w-2xl w-full h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden"
      >
        {/* ── 1. Header ──────────────────────────────────────────── */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/10 text-emerald-700 flex items-center justify-center text-lg font-bold shrink-0">
              {listing?.marketplace_categories?.icon || '📱'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate">
                  {listing?.title || 'Foreign Number'}
                </h3>
                {order.status !== 'completed' ? (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    order.code_requested
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {hasCodeMessage ? 'Code Sent' : order.code_requested ? 'Code Requested' : 'Live Chat'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                    Deal Completed & Auto-Debited
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium truncate">
                Chatting with <b className="text-slate-800">{otherPartyName}</b>
                {phonePreview ? ` • ${phonePreview}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-200/60 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── 2. Order Action / Request Code / Auto-Debit Bar ─────────────────────── */}
        <div className="px-4 py-3 bg-slate-100/70 border-b border-slate-200/60 text-xs space-y-2.5">
          {order.status !== 'completed' && (
            <>
              {/* Top status strip showing Number, Price, and Wallet Balance */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200/80 px-3.5 py-2.5 rounded-2xl">
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-emerald-600 shrink-0" />
                  <span className="font-mono font-black text-slate-900 text-xs">
                    {phonePreview || listing?.title}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-black font-mono text-xs">
                    ₦{Number(order.price).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                  <Wallet size={13} className="text-emerald-600" />
                  <span>{isBuyer ? 'Your Wallet:' : 'Buyer Wallet:'}</span>
                  <span className={`font-mono font-black ${walletBalance >= Number(order.price) ? 'text-emerald-700' : 'text-rose-600'}`}>
                    ₦{Number(walletBalance || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* BUYER CONTROLS: Request Code & Complete Deal (Auto-Debit Wallet) */}
              {isBuyer && (
                <div className="bg-emerald-50/90 border border-emerald-200/80 p-3 rounded-2xl space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <p className="font-black text-emerald-950 text-xs flex items-center gap-1.5">
                        <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
                        <span>Auto-Wallet Debit on Deal Completion</span>
                      </p>
                      <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
                        Request the verification code from Admin below. Your wallet (₦{Number(order.price).toLocaleString()}) will be debited automatically once the deal is done!
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleRequestCode}
                        disabled={requestingCode}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                      >
                        {requestingCode ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />}
                        <span>{order.code_requested ? 'Request Code Again' : 'Request Code'}</span>
                      </button>

                      {hasCodeMessage && (
                        <button
                          type="button"
                          onClick={handleCompleteDealWithAutoDebit}
                          disabled={verifying}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                        >
                          {verifying ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                          <span>Deal Done (Auto-Debit ₦{Number(order.price).toLocaleString()})</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ADMIN / SELLER CONTROLS: Send Code & Auto-Debit Buyer Wallet */}
              {isSellerOrAdmin && (
                <div className="bg-blue-50 border border-blue-200/80 p-3 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-blue-950 text-xs flex items-center gap-1.5">
                      <Key size={14} className="text-blue-600" />
                      <span>Admin Code Dispatch & Auto-Wallet Debit</span>
                    </span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      Auto-Debit: ₦{Number(order.price).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={sellerCodeInput}
                      onChange={(e) => setSellerCodeInput(e.target.value)}
                      placeholder="Enter OTP verification code (e.g. 582-910) to send to buyer…"
                      className="flex-1 bg-white border border-blue-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendCode(false)}
                      disabled={sendingCode || !sellerCodeInput.trim()}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {sendingCode ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}
                      <span>Send Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendCode(true)}
                      disabled={sendingCode || !sellerCodeInput.trim()}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {sendingCode ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                      <span>Send Code & Complete Deal (Auto-Debit)</span>
                    </button>
                  </div>

                  {hasCodeMessage && (
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={handleCompleteDealWithAutoDebit}
                        disabled={verifying}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow flex items-center gap-1.5 transition cursor-pointer"
                      >
                        {verifying ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        <span>Mark Deal Done & Auto-Debit Buyer Wallet (₦{Number(order.price).toLocaleString()})</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {order.status === 'completed' && (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200/80 p-3 rounded-2xl text-emerald-900">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>
                  Deal Completed! ₦{Number(order.price).toLocaleString()} was automatically debited from wallet.
                </span>
              </div>
              <Sparkles size={16} className="text-emerald-600 shrink-0" />
            </div>
          )}
        </div>

        {/* ── 3. Chat Messages Stream ────────────────────────────── */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3 bg-slate-50/50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Clock size={28} className="mb-2 stroke-[1.5]" />
              <p className="text-xs font-bold uppercase tracking-wider">No messages yet</p>
              <p className="text-[11px] max-w-xs mt-1">
                Click "Request Code" above or send a message to Admin to receive your verification code.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = isBuyer
                ? String(msg.sender_id) === String(currentUserId)
                : (msg.sender_id === 'admin' || msg.sender_role === 'admin' || String(msg.sender_id) === String(currentUserId));
              const isCodeMsg = msg.message_type === 'verification_code';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 shadow-sm ${
                      isCodeMsg
                        ? 'bg-gradient-to-r from-emerald-900 to-teal-900 text-white border border-emerald-500/40'
                        : isMe
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-none'
                    }`}
                  >
                    {isCodeMsg ? (
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-1.5 text-emerald-300 text-[10px] font-black uppercase tracking-widest">
                          <Key size={12} />
                          <span>Official Verification Code / OTP</span>
                        </div>
                        <p className="text-xs text-emerald-100 font-medium">{msg.content}</p>
                        {msg.code_value && (
                          <div className="p-2.5 rounded-xl bg-black/40 border border-white/15 flex items-center justify-between gap-3">
                            <code className="font-mono font-black text-sm text-emerald-300 select-all break-all">
                              {msg.code_value}
                            </code>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(msg.code_value!)}
                              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition shrink-0 cursor-pointer"
                              title="Copy verification code"
                            >
                              {copiedCode === msg.code_value ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words font-medium">
                        {msg.content}
                      </p>
                    )}

                    <div
                      className={`text-[9px] mt-1.5 flex items-center justify-end gap-1 font-semibold ${
                        isCodeMsg || isMe ? 'text-emerald-100/80' : 'text-slate-400'
                      }`}
                    >
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── 4. Chat Input Footer ───────────────────────────────── */}
        <form
          onSubmit={handleSendMessage}
          className="p-3.5 sm:p-4 bg-white border-t border-slate-100 flex items-center gap-2.5"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isBuyer
                ? "Type a message to Admin (e.g. 'I entered the number on WhatsApp, send code')…"
                : "Reply to buyer or guide them on entering the number…"
            }
            className="flex-1 bg-slate-100/80 border border-slate-200/80 rounded-2xl px-4 py-3 text-xs sm:text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || sendingMsg}
            className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-600/10 flex items-center gap-1.5 transition cursor-pointer"
          >
            {sendingMsg ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </motion.div>
    </div>
  );
}
