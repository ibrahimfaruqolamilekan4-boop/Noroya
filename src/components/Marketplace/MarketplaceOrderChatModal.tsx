import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Send, ShieldCheck, CheckCircle2, Lock, CreditCard, 
  Key, Copy, Check, Clock, AlertCircle, RefreshCw, Loader2, Sparkles, User
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { marketplaceService, MarketplaceOrder, MarketplaceMessage } from '../../lib/marketplaceService';
import { supabase } from '../../lib/supabase';

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
  
  const [loading, setLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [processingPay, setProcessingPay] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserId = currentUser?.id || currentUser?.uid;

  // 1. Load initial Order & User Wallet Balance
  useEffect(() => {
    loadOrderDetails();
    loadWalletBalance();
    loadMessages();

    // 2. Set up realtime subscription for new chat messages
    const unsubscribe = marketplaceService.subscribeToMessages(orderId, (newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      scrollToBottom();
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [orderId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadWalletBalance = async () => {
    if (!currentUserId) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('wallet_balance, balance')
        .eq('id', currentUserId)
        .maybeSingle();
      if (data) {
        setWalletBalance(Number(data.wallet_balance !== undefined ? data.wallet_balance : (data.balance ?? 0)));
      }
    } catch (_) {}
  };

  const loadOrderDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('marketplace_orders')
        .select(`
          *,
          marketplace_listings (
            id, title, price, description, product_details, image_url,
            marketplace_categories (name, icon, type)
          ),
          seller:seller_id (id, full_name, name, email, marketplace_seller_rating),
          buyer:buyer_id (id, full_name, name, email)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      setOrder(data);
    } catch (err: any) {
      console.error('[loadOrderDetails] Error:', err);
      toast.error('Failed to load order details.');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const msgs = await marketplaceService.getMessages(orderId);
      setMessages(msgs);
    } catch (err) {
      console.error('[loadMessages] Error:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sendingMsg) return;

    const text = inputText.trim();
    setInputText('');
    setSendingMsg(true);
    try {
      await marketplaceService.sendMessage(orderId, currentUserId, text);
      await loadMessages();
    } catch (err: any) {
      toast.error(`Message failed: ${err.message || err}`);
      setInputText(text); // restore
    } finally {
      setSendingMsg(false);
    }
  };

  // Buyer: Pay from wallet
  const handlePayFromWallet = async () => {
    if (walletBalance < order.price) {
      toast.error(`Insufficient balance. You need ₦${Number(order.price).toLocaleString()} but have ₦${walletBalance.toLocaleString()}.`);
      return;
    }

    setProcessingPay(true);
    try {
      await marketplaceService.processPayment(currentUserId, orderId, Number(order.price));
      toast.success('🎉 Payment successful! Funds held securely in escrow.');
      await loadOrderDetails();
      await loadWalletBalance();
      await loadMessages();
      onOrderUpdated?.();
    } catch (err: any) {
      console.error('[handlePayFromWallet] Error:', err);
      toast.error(err.message || 'Payment failed.');
    } finally {
      setProcessingPay(false);
    }
  };

  // Seller: Send verification code / credentials
  const handleSendCode = async () => {
    if (!sellerCodeInput.trim()) {
      toast.error('Please enter the verification code or credential.');
      return;
    }

    setSendingCode(true);
    try {
      await marketplaceService.sendVerificationCode(orderId, currentUserId, sellerCodeInput.trim());
      toast.success('Verification code posted to chat!');
      setSellerCodeInput('');
      await loadMessages();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send code.');
    } finally {
      setSendingCode(false);
    }
  };

  // Buyer: Verify code and complete
  const handleVerifyCode = async () => {
    if (!verificationInput.trim()) {
      toast.error('Please enter the code to verify.');
      return;
    }

    setVerifying(true);
    try {
      await marketplaceService.verifyAndComplete(orderId, verificationInput.trim());
      toast.success('🎉 Purchase verified and completed! Order closed.');
      setVerificationInput('');
      await loadOrderDetails();
      await loadMessages();
      onOrderUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Verification failed. Code mismatch.');
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
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Connecting to Secure Chat…</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const isBuyer = currentUserId === order.buyer_id;
  const isSeller = currentUserId === order.seller_id;
  const listing = order.marketplace_listings;
  const otherPartyName = isBuyer 
    ? (order.seller?.full_name || order.seller?.name || 'Seller')
    : (order.buyer?.full_name || order.buyer?.name || 'Buyer');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-3xl max-w-2xl w-full h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden"
      >
        {/* ── 1. Header ──────────────────────────────────────────── */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/10 text-emerald-700 flex items-center justify-center text-lg font-bold">
              {listing?.marketplace_categories?.icon || '💬'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-900 line-clamp-1">
                  {listing?.title || 'Marketplace Item'}
                </h3>
                {order.status === 'pending' && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
                    Unpaid
                  </span>
                )}
                {order.status === 'paid' && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider">
                    In Escrow
                  </span>
                )}
                {order.status === 'completed' && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                    Verified
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Chatting with <b className="text-slate-700">{otherPartyName}</b> • Order #{order.id.slice(0, 8)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-200/60 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── 2. Order Action / Payment Bar ─────────────────────── */}
        <div className="px-4 py-3 bg-slate-100/70 border-b border-slate-200/60 text-xs">
          {order.status === 'pending' && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-amber-50 border border-amber-200/80 p-3 rounded-2xl">
              <div>
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <Lock size={14} className="text-amber-600" />
                  Order created: ₦{Number(order.price).toLocaleString()}
                </p>
                <p className="text-[11px] text-amber-700 font-medium">
                  {isBuyer 
                    ? `Pay securely from your wallet (Balance: ₦${walletBalance.toLocaleString()})`
                    : 'Awaiting buyer payment before releasing credentials.'}
                </p>
              </div>
              {isBuyer && (
                <button
                  onClick={handlePayFromWallet}
                  disabled={processingPay || walletBalance < order.price}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {processingPay ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  <span>{walletBalance < order.price ? 'Fund Wallet to Pay' : 'Pay from Wallet'}</span>
                </button>
              )}
            </div>
          )}

          {order.status === 'paid' && (
            <div className="space-y-2 bg-blue-50 border border-blue-200/80 p-3 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-900 font-bold">
                  <ShieldCheck size={16} className="text-blue-600" />
                  <span>Funds Protected in Escrow (₦{Number(order.price).toLocaleString()})</span>
                </div>
                <span className="text-[10px] uppercase font-black tracking-wider text-blue-600">
                  Step 2: Verification
                </span>
              </div>

              {/* If user is SELLER: option to post code */}
              {isSeller && (
                <div className="pt-2 border-t border-blue-200/60 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={sellerCodeInput}
                    onChange={(e) => setSellerCodeInput(e.target.value)}
                    placeholder="Enter phone OTP code or account password to send…"
                    className="flex-1 bg-white border border-blue-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSendCode}
                    disabled={sendingCode || !sellerCodeInput.trim()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {sendingCode ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}
                    <span>Send Code</span>
                  </button>
                </div>
              )}

              {/* If user is BUYER: option to verify code and complete */}
              {isBuyer && (
                <div className="pt-2 border-t border-blue-200/60 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={verificationInput}
                    onChange={(e) => setVerificationInput(e.target.value)}
                    placeholder="Paste the verification code sent by the seller below…"
                    className="flex-1 bg-white border border-blue-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleVerifyCode}
                    disabled={verifying || !verificationInput.trim()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {verifying ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    <span>Confirm & Release Payout</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {order.status === 'completed' && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span className="font-bold text-xs">
                  Order Completed & Verified Successfully!
                </span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                Payout Released
              </span>
            </div>
          )}
        </div>

        {/* ── 3. Chat Message Feed ───────────────────────────────── */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/40">
          {messages.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-xl">
                💬
              </div>
              <p className="text-xs font-bold uppercase tracking-wider">Start the conversation</p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                Discuss delivery details, ask questions, or exchange verification OTPs in complete safety.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.sender_id === currentUserId;
              const isCode = m.message_type === 'verification_code';

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  {isCode ? (
                    // Special Verification Code Card
                    <div className="max-w-sm w-full bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-4 rounded-2xl shadow-xl border border-indigo-500/30 space-y-2 my-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-indigo-300">
                        <span className="flex items-center gap-1.5 uppercase tracking-wider">
                          <Key size={13} className="text-amber-400" />
                          Official Verification Code
                        </span>
                        <span className="text-[10px] opacity-75">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200">{m.content}</p>
                      {m.code_value && (
                        <div className="flex items-center justify-between p-2.5 bg-slate-950/80 rounded-xl border border-indigo-400/20 font-mono">
                          <span className="text-base font-black text-amber-300 tracking-wider">
                            {m.code_value}
                          </span>
                          <button
                            onClick={() => copyToClipboard(m.code_value!)}
                            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs flex items-center gap-1 transition cursor-pointer"
                          >
                            {copiedCode === m.code_value ? <Check size={13} /> : <Copy size={13} />}
                            <span className="text-[10px] font-bold uppercase">
                              {copiedCode === m.code_value ? 'Copied' : 'Copy'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Regular Chat Bubble
                    <div
                      className={`max-w-xs sm:max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                        isMine
                          ? 'bg-emerald-600 text-white rounded-br-none shadow-sm'
                          : 'bg-white text-slate-800 rounded-bl-none border border-slate-200/80 shadow-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <span
                        className={`text-[9px] block text-right mt-1 ${
                          isMine ? 'text-emerald-100' : 'text-slate-400'
                        }`}
                      >
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── 4. Chat Input Bar ──────────────────────────────────── */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 sm:p-4 border-t border-slate-100 bg-white flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message to the seller/buyer…"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={sendingMsg || !inputText.trim()}
            className="w-11 h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition shadow-md cursor-pointer shrink-0"
          >
            {sendingMsg ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
