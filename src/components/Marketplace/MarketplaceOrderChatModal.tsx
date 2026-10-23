import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  X, Send, ShieldCheck, CheckCircle2, Key, Copy, Check, 
  Clock, Loader2, Sparkles, BellRing, Wallet, Phone, AlertTriangle, History
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { marketplaceService, MarketplaceOrder, MarketplaceMessage } from '../../lib/marketplaceService';

interface MarketplaceOrderChatModalProps {
  order: MarketplaceOrder;
  currentUser: any;
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: (newBalance: number) => void;
}

export const MarketplaceOrderChatModal: React.FC<MarketplaceOrderChatModalProps> = ({
  order: initialOrder,
  currentUser,
  isOpen,
  onClose,
  onPaymentComplete,
}) => {
  const [order, setOrder] = useState<MarketplaceOrder>(initialOrder);
  const [messages, setMessages] = useState<MarketplaceMessage[]>(initialOrder.messages || []);
  const [newMessage, setNewMessage] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [buyerConfirmCode, setBuyerConfirmCode] = useState('');
  const [sending, setSending] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [completingDeal, setCompletingDeal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [buyerBalance, setBuyerBalance] = useState<number>(
    Number(initialOrder?.buyer?.wallet_balance ?? currentUser?.wallet_balance ?? currentUser?.balance ?? 0)
  );
  const [isAdminServer, setIsAdminServer] = useState<boolean>(false);
  const [insufficientError, setInsufficientError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userRoleIsAdmin =
    currentUser?.role === 'admin' ||
    ['ibrahimfaruqolamilekan4@gmail.com', 'adewaleogunkeye200@gmail.com', 'jeffholland299@gmail.com', 'triumphanttosin@gmail.com'].includes(
      String(currentUser?.email || '').toLowerCase().trim()
    );
  const isAdmin = isAdminServer || userRoleIsAdmin;

  const currentUserId = String(currentUser?.id || currentUser?.uid || '');
  const isBuyer = String(order.buyer_id) === currentUserId && !isAdmin;
  const isSellerOrAdmin = isAdmin || String(order.seller_id) === currentUserId;

  const phoneNumber =
    order.clicked_number ||
    order.marketplace_listings?.product_details?.phone_number ||
    order.marketplace_listings?.product_details?.item_identifier ||
    '';

  useEffect(() => {
    setOrder(initialOrder);
    if (initialOrder.messages?.length) {
      setMessages(initialOrder.messages);
    }
  }, [initialOrder]);

  useEffect(() => {
    if (!isOpen || !order?.id) return;
    let active = true;

    const syncOrder = async () => {
      try {
        const details = await marketplaceService.getOrderDetails(order.id);
        if (!active) return;
        if (details.order) setOrder(details.order);
        if (Array.isArray(details.messages)) setMessages(details.messages);
        if (typeof details.buyerBalance === 'number') setBuyerBalance(details.buyerBalance);
        if (typeof details.isAdmin === 'boolean') setIsAdminServer(details.isAdmin);
      } catch (err) {
        console.warn('[MarketplaceOrderChatModal] poll warning:', err);
      }
    };

    syncOrder();
    const interval = setInterval(syncOrder, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isOpen, order?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      setSending(true);
      await marketplaceService.sendMessage(order.id, currentUserId, newMessage);
      setNewMessage('');
      const details = await marketplaceService.getOrderDetails(order.id);
      setOrder(details.order);
      setMessages(details.messages || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleRequestCode = async () => {
    setInsufficientError(null);
    const price = Number(order.price || 0);
    if (buyerBalance < price && order.status !== 'paid') {
      const msg = `Insufficient Balance! This number requires ₦${price.toLocaleString()}, but your wallet balance is ₦${buyerBalance.toLocaleString()}. Please fund your wallet first.`;
      setInsufficientError(msg);
      toast.error('Insufficient Balance! Please fund your wallet.');
      return;
    }

    try {
      setRequestingCode(true);
      const res = await marketplaceService.requestVerificationCode(order.id);
      setOrder(res.order);
      if (res.order.messages) setMessages(res.order.messages);
      toast.success('Login code request sent to Admin!');
    } catch (error: any) {
      if (error.code === 'INSUFFICIENT_BALANCE' || String(error.message || '').toLowerCase().includes('insufficient')) {
        setInsufficientError(error.message);
      }
      toast.error(error.message || 'Failed to request code');
    } finally {
      setRequestingCode(false);
    }
  };

  const handleSendReady = async () => {
    try {
      setSending(true);
      await marketplaceService.sendMessage(order.id, currentUserId, 'Ready');
      const details = await marketplaceService.getOrderDetails(order.id);
      setOrder(details.order);
      setMessages(details.messages || []);
      toast.success('Sent "Ready" to Admin Desk!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAdminSendCodeAndComplete = async () => {
    if (!verificationCode.trim()) {
      toast.error('Please enter the verification code');
      return;
    }
    const price = Number(order.price || 0);
    if (buyerBalance < price) {
      toast.error('Buyer balance too low');
      return;
    }
    try {
      setSending(true);
      const res = await marketplaceService.sendCodeAndComplete(order.id, verificationCode);
      setVerificationCode('');
      toast.success(`Success! Code delivered and ₦${price.toLocaleString()} debited from buyer wallet.`);
      const details = await marketplaceService.getOrderDetails(order.id);
      setOrder(details.order);
      setMessages(details.messages || []);
      if (typeof details.buyerBalance === 'number') setBuyerBalance(details.buyerBalance);
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete order');
    } finally {
      setSending(false);
    }
  };

  const handleAdminSendCode = async (autoCompleteDeal: boolean) => {
    if (autoCompleteDeal) {
      return handleAdminSendCodeAndComplete();
    }
    if (!verificationCode.trim()) {
      toast.error('Please enter the login/verification OTP code to send');
      return;
    }

    try {
      setSending(true);
      const res = await marketplaceService.sendVerificationCode(
        order.id,
        currentUserId,
        verificationCode,
        autoCompleteDeal
      );
      setVerificationCode('');
      setOrder(res.order);
      if (res.order.messages) setMessages(res.order.messages);
      if (res.dealCompleted) {
        if (typeof res.newBuyerBalance === 'number') {
          setBuyerBalance(res.newBuyerBalance);
        }
        toast.success(`Code sent & ₦${Number(order.price).toLocaleString()} automatically debited from buyer's wallet!`);
      } else {
        toast.success('Verification code sent in chat!');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to send verification code');
    } finally {
      setSending(false);
    }
  };

  const handleCompleteDealAndDebit = async () => {
    setInsufficientError(null);
    const price = Number(order.price || 0);
    if (!isAdmin && buyerBalance < price && order.status !== 'paid') {
      const msg = `Insufficient Balance! Required: ₦${price.toLocaleString()}, Available: ₦${buyerBalance.toLocaleString()}. Please fund your wallet.`;
      setInsufficientError(msg);
      toast.error('Insufficient Balance!');
      return;
    }

    try {
      setCompletingDeal(true);
      const res = await marketplaceService.verifyAndComplete(order.id, buyerConfirmCode);
      setOrder(res.order);
      if (res.order.messages) setMessages(res.order.messages);
      if (typeof res.newBuyerBalance === 'number') {
        setBuyerBalance(res.newBuyerBalance);
        if (isBuyer) {
          onPaymentComplete(res.newBuyerBalance);
        }
      }
      toast.success(`🎉 Deal completed! ₦${Number(order.price).toLocaleString()} has been debited from the wallet.`);
    } catch (error: any) {
      if (error.code === 'INSUFFICIENT_BALANCE' || String(error.message || '').toLowerCase().includes('insufficient')) {
        setInsufficientError(error.message);
      }
      toast.error(error.message || 'Failed to complete deal');
    } finally {
      setCompletingDeal(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success('Login code copied!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyPhoneNumber = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(true);
    toast.success('Foreign number copied!');
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  if (!isOpen) return null;

  const latestCodeMsg = [...messages].reverse().find((m) => m.message_type === 'verification_code');
  const formatTimestamp = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (_) {
      return '';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-slate-900 border border-slate-700/60 rounded-2xl max-w-2xl w-full h-[92vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border-b border-emerald-500/20 p-4 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {order.status === 'completed' ? '✓ Deal Completed & Paid' : '● Live Admin Order Chat'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                <History className="w-3 h-3 text-emerald-400" />
                Permanent Trace ID: {order.id}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-white truncate mt-1">
              {order.marketplace_listings?.title || 'Foreign Number Purchase'}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 mt-1">
              <span className="font-black text-emerald-400">
                Price: ₦{Number(order.price).toLocaleString()}
              </span>
              <span className={`flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md border ${
                buyerBalance >= Number(order.price || 0) || order.status === 'completed'
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                  : 'bg-red-950/80 border-red-500/40 text-red-300'
              }`}>
                <Wallet className="w-3.5 h-3.5" />
                {isSellerOrAdmin ? "Buyer's Wallet:" : 'Your Wallet:'} ₦{Number(buyerBalance).toLocaleString()}
                {buyerBalance < Number(order.price || 0) && order.status !== 'completed' && ' (Insufficient Balance)'}
              </span>
              {isSellerOrAdmin && order.buyer?.email && (
                <span className="text-slate-400 truncate">
                  Buyer: <strong className="text-white">{order.buyer.full_name || order.buyer.email}</strong> ({order.buyer.email})
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-2 rounded-lg hover:bg-slate-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prominent Clicked Foreign Number Banner */}
        {phoneNumber && (
          <div className="bg-emerald-950/70 border-b border-emerald-500/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                  Selected Foreign Number (Use this number to login & receive code)
                </p>
                <p className="font-mono font-black text-white text-base sm:text-lg tracking-wide">
                  {phoneNumber}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyPhoneNumber(phoneNumber)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-1.5 transition shrink-0 shadow"
            >
              {copiedPhone ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedPhone ? 'Number Copied!' : 'Copy Number'}
            </button>
          </div>
        )}

        {/* Buyer Status Banner (per specification) */}
        {!isSellerOrAdmin && order.status !== 'completed' && (
          <div className={`px-4 py-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            buyerBalance >= Number(order.price || 0)
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/95 border-red-500/50 text-red-200'
          }`}>
            <div className="flex items-center gap-2 text-xs font-bold flex-1">
              {buyerBalance >= Number(order.price || 0) ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              )}
              <span className="leading-relaxed">
                {buyerBalance >= Number(order.price || 0)
                  ? "Your wallet is funded. Copy the number, enter it in your app, then send 'Ready' in this chat to request the code."
                  : `Your balance is ₦${buyerBalance.toLocaleString()}. You need ₦${(Number(order.price || 0) - buyerBalance).toLocaleString()} more. Fund your wallet, then come back to this chat.`}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {buyerBalance >= Number(order.price || 0) ? (
                <button
                  type="button"
                  onClick={handleSendReady}
                  disabled={sending}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow cursor-pointer"
                >
                  Send 'Ready'
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent('open-fund-modal'));
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs transition shadow cursor-pointer"
                >
                  Fund Wallet
                </button>
              )}
            </div>
          </div>
        )}

        {/* Permanent Traceability Notice */}
        <div className="bg-slate-800/80 border-b border-slate-700/60 px-4 py-2 flex items-center justify-between text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {order.status === 'completed'
                ? `Deal completed! ₦${Number(order.price).toLocaleString()} was automatically debited from wallet.`
                : `Auto-Debit Protection: ₦${Number(order.price).toLocaleString()} is debited automatically once you receive the code & deal is done.`}
            </span>
          </div>
          <span className="hidden sm:inline text-[10px] text-emerald-400 font-bold shrink-0 ml-2">
            ● Permanent Chat Log Saved
          </span>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/60">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Chat connected! Ask Admin for your login verification code below.</p>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn =
                (isSellerOrAdmin && (msg.sender_id === 'admin' || msg.sender_role === 'admin' || msg.sender_id === currentUserId)) ||
                (!isSellerOrAdmin && msg.sender_id === currentUserId && msg.sender_role !== 'admin');

              const senderLabel =
                msg.sender_name ||
                (msg.sender_role === 'admin' || msg.sender_id === 'admin'
                  ? '👑 NORODATA Official Admin'
                  : order.buyer?.full_name || order.buyer?.email || 'Customer');

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md px-4 py-3 rounded-2xl text-sm ${
                      msg.message_type === 'verification_code'
                        ? 'bg-emerald-950/90 border-2 border-emerald-500/60 text-emerald-100 shadow-lg'
                        : isOwn
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-wider opacity-85">
                        {senderLabel}
                      </span>
                      {msg.sender_email && isSellerOrAdmin && (
                        <span className="text-[9px] opacity-60 font-mono">{msg.sender_email}</span>
                      )}
                    </div>

                    {msg.message_type === 'verification_code' ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 font-black text-emerald-300 text-xs uppercase tracking-wider">
                          <Key className="w-4 h-4" />
                          Official Login Verification Code
                        </div>
                        <p className="text-xs text-slate-300">{msg.content}</p>
                        <div className="flex items-center gap-2 bg-slate-900 p-2.5 rounded-xl font-mono text-lg font-black border border-emerald-500/40">
                          <span className="flex-1 text-emerald-400 tracking-widest">{msg.code_value}</span>
                          <button
                            type="button"
                            onClick={() => copyCode(msg.code_value || '')}
                            className="p-1.5 hover:bg-slate-800 rounded-lg transition text-emerald-300 flex items-center gap-1 text-xs font-sans font-bold"
                          >
                            {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            {copiedCode ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className=" whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                    <span className="text-[10px] opacity-60 mt-1.5 block text-right">
                      {formatTimestamp(msg.created_at)}
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Action & Deal Controls Footer */}
        <div className="border-t border-slate-700/60 bg-slate-900 p-4 space-y-3">
          {/* BUYER CONTROLS */}
          {!isSellerOrAdmin && order.status !== 'completed' && (
            <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-300">
                  <span className="font-bold text-white block">Step 1: Enter Number & Request Login Code</span>
                  <span>
                    Enter <strong className="text-emerald-400 font-mono">{phoneNumber || 'the number'}</strong> in your app, then request the code from Admin.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={requestingCode}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition disabled:opacity-50 shrink-0 shadow"
                >
                  {requestingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />}
                  {order.code_requested ? 'Request Code Again' : 'Request Verification Code'}
                </button>
              </div>

              {/* Step 2: Confirm Code & Auto-Debit */}
              <div className="pt-2 border-t border-slate-700/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <div className="text-xs text-slate-300">
                  <span className="font-bold text-emerald-400 block">
                    Step 2: Logged In? Complete Deal (Auto-Debit ₦{Number(order.price).toLocaleString()})
                  </span>
                  <span>
                    {latestCodeMsg?.code_value
                      ? `Code ${latestCodeMsg.code_value} received! Click to complete & auto-debit your wallet.`
                      : 'Once Admin gives you the login code and you log in, click to finalize & auto-debit your wallet.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCompleteDealAndDebit}
                  disabled={completingDeal}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 shrink-0 shadow-lg"
                >
                  {completingDeal ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Debiting Wallet...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Code Received — Complete Deal (₦{Number(order.price).toLocaleString()})
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ADMIN / SELLER CONTROLS */}
          {isSellerOrAdmin && order.status !== 'completed' && (
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  Admin Verification Code & Auto-Debit Panel
                </span>
                <span className="text-slate-300 font-semibold">
                  Buyer Wallet: <strong className={buyerBalance >= Number(order.price) ? 'text-emerald-400' : 'text-red-400'}>
                    ₦{Number(buyerBalance).toLocaleString()}
                  </strong>
                  {buyerBalance < Number(order.price) && ' (Insufficient)'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Enter OTP / Login verification code (e.g. 849-201)..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleAdminSendCode(false)}
                  disabled={sending || !verificationCode.trim()}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-bold text-xs transition disabled:opacity-50"
                >
                  Send Code Only
                </button>
                <button
                  type="button"
                  onClick={() => handleAdminSendCode(true)}
                  disabled={sending || !verificationCode.trim()}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition disabled:opacity-50 shadow-lg cursor-pointer"
                >
                  Send Code & Complete (debit ₦{Number(order.price).toLocaleString()})
                </button>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20">
                <span className="text-[11px] text-slate-400">
                  Already sent the login code in chat? Click to mark deal done & auto-debit buyer's wallet:
                </span>
                <button
                  type="button"
                  onClick={handleCompleteDealAndDebit}
                  disabled={completingDeal}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition disabled:opacity-50"
                >
                  {completingDeal ? 'Debiting...' : `Complete Deal & Debit ₦${Number(order.price).toLocaleString()}`}
                </button>
              </div>
            </div>
          )}

          {order.status === 'completed' && (
            <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-xl p-3 text-emerald-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Deal Completed! ₦{Number(order.price).toLocaleString()} was automatically debited from wallet. Full chat history is permanently saved.
                </span>
              </div>
              {order.payment_reference && (
                <span className="font-mono text-[10px] bg-slate-900 px-2 py-1 rounded border border-emerald-500/30">
                  {order.payment_reference}
                </span>
              )}
            </div>
          )}

          {/* Message Input */}
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={
                isSellerOrAdmin
                  ? 'Reply to buyer or paste login instructions (permanently saved)...'
                  : 'Type a message to Admin (permanently saved in chat history)...'
              }
              disabled={sending}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50 text-sm"
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 font-bold text-sm"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
};
