import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { marketplaceService } from '../../lib/marketplaceService';
import { Send, ArrowLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface ListingDetailProps {
  listingId: string;
  user: any;
  onBack?: () => void;
}

export function ListingDetail({ listingId, user, onBack }: ListingDetailProps) {
  const [listing, setListing] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (listingId) {
      loadListing();
    }
  }, [listingId]);

  useEffect(() => {
    if (order?.id) {
      loadMessages();
      const unsubscribe = marketplaceService.subscribeToMessages(order.id, (msg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [order?.id]);

  const loadListing = async () => {
    try {
      setLoading(true);
      const data = await marketplaceService.getListing(listingId);
      setListing(data);

      // Check if user already has an active order on this listing
      if (user?.id || user?.uid) {
        const uid = user.id || user.uid;
        const purchases = await marketplaceService.getMyPurchases(uid);
        const existing = purchases.find((p: any) => p.listing_id === listingId);
        if (existing) {
          setOrder(existing);
        }
      }
    } catch (error: any) {
      console.error('Failed to load listing:', error);
      toast.error('Failed to load listing details');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    if (!order?.id) return;
    try {
      const data = await marketplaceService.getMessages(order.id);
      setMessages(data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const handleInitiatePurchase = async () => {
    if (!user?.id && !user?.uid) {
      toast.error('Please log in to initiate purchase.');
      return;
    }
    const currentUserId = user.id || user.uid;
    try {
      setSubmitting(true);
      const newOrder = await marketplaceService.initiatePurchase(currentUserId, listingId);
      setOrder(newOrder);
      toast.success('Chat started with seller! You can negotiate or pay now.');
    } catch (error: any) {
      toast.error(error.message || 'Could not initiate purchase');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !order) return;
    const currentUserId = user?.id || user?.uid;

    try {
      await marketplaceService.sendMessage(order.id, currentUserId, newMessage);
      setNewMessage('');
      loadMessages();
    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    }
  };

  const handlePayment = async () => {
    if (!order) return;
    const currentUserId = user?.id || user?.uid;
    try {
      setSubmitting(true);
      await marketplaceService.processPayment(currentUserId, order.id, Number(listing.price));
      setOrder((prev: any) => ({ ...prev, status: 'paid' }));
      toast.success(`✓ Payment complete! ₦${Number(listing.price).toLocaleString()} deducted from wallet.`);
      loadMessages();
    } catch (error: any) {
      toast.error(error.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (!verificationCode.trim() || !order) {
      toast.error('Please enter the verification code provided by seller.');
      return;
    }
    try {
      setSubmitting(true);
      await marketplaceService.verifyAndComplete(order.id, verificationCode.trim());
      setOrder((prev: any) => ({ ...prev, status: 'completed' }));
      toast.success('✓ Purchase verified! Funds released to seller.');
      setShowVerifyForm(false);
      loadMessages();
    } catch (error: any) {
      toast.error(error.message || 'Invalid verification code');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 font-medium">Loading listing details...</p>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-600 font-bold mb-4">Listing not found or removed.</p>
        {onBack && (
          <button onClick={onBack} className="px-5 py-2.5 bg-emerald-700 text-white rounded-xl text-sm font-bold">
            ← Back to Marketplace
          </button>
        )}
      </div>
    );
  }

  const currentUserId = user?.id || user?.uid;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {onBack && (
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:text-emerald-700 transition"
        >
          <ArrowLeft size={16} />
          Back to Listings
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Product Details */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 mb-6 border border-slate-200/80 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{listing.marketplace_categories?.icon || '🛍️'}</span>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                {listing.marketplace_categories?.name || 'Digital Item'}
              </span>
              <span className="text-xs text-slate-400 font-semibold">• {listing.views || 0} views</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-4">{listing.title}</h1>
            <p className="text-slate-700 text-sm sm:text-base leading-relaxed mb-6 whitespace-pre-line">
              {listing.description}
            </p>

            {listing.product_details && Object.keys(listing.product_details).length > 0 && (
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 mb-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Item Specifications:</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(listing.product_details).map(([key, val]) => (
                    <div key={key} className="bg-white p-3 rounded-xl border border-slate-100">
                      <span className="text-xs text-slate-400 capitalize block">{key.replace(/_/g, ' ')}</span>
                      <span className="font-bold text-slate-800">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Seller Card */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-3xl p-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center text-lg">
                {(listing.profiles?.full_name || listing.profiles?.name || 'S')[0]?.toUpperCase()}
              </div>
              <div className="flex-1">
                <h3 className="font-black text-slate-900 text-base sm:text-lg">
                  {listing.profiles?.full_name || listing.profiles?.name || 'Verified Seller'}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-amber-500 font-black text-xs">
                    ★ {(listing.profiles?.marketplace_seller_rating || 5.0).toFixed(1)}
                  </span>
                  <span className="text-xs text-slate-500">
                    ({listing.profiles?.marketplace_seller_reviews || 0} reviews)
                  </span>
                  <span className="text-xs text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-md">
                    Verified Seller
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 sticky top-6 shadow-sm">
            <div className="mb-4">
              <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Purchase Price</span>
              <p className="text-3xl sm:text-4xl font-black text-emerald-700">
                ₦{Number(listing.price).toLocaleString()}
              </p>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                <span>Protected by NORODATA Escrow</span>
              </div>
            </div>

            {!order ? (
              <button
                disabled={submitting || listing.status !== 'available'}
                onClick={handleInitiatePurchase}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Starting...' : '💬 Chat & Buy'}
              </button>
            ) : order.status === 'pending' ? (
              <button
                disabled={submitting}
                onClick={handlePayment}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Processing...' : '💳 Pay Now (Wallet)'}
              </button>
            ) : order.status === 'paid' ? (
              <div className="text-center text-xs text-amber-700 font-bold p-3 bg-amber-50 border border-amber-200 rounded-2xl mb-3">
                ⏳ Payment in Escrow. Waiting for seller to send verification code in chat...
              </div>
            ) : order.status === 'completed' ? (
              <div className="text-center text-xs text-emerald-700 font-black p-3 bg-emerald-50 border border-emerald-200 rounded-2xl mb-3 flex items-center justify-center gap-2">
                <CheckCircle2 size={16} />
                Order Completed & Verified!
              </div>
            ) : null}

            {order?.status === 'paid' && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-2">
                  Once the seller gives you the code in the chat, enter it below to release funds.
                </p>
                {showVerifyForm && (
                  <div className="space-y-2 mb-3">
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="Enter verification code"
                      className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-mono focus:border-emerald-600 focus:outline-none"
                    />
                    <button
                      disabled={submitting}
                      onClick={handleVerify}
                      className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow cursor-pointer"
                    >
                      {submitting ? 'Verifying...' : 'Verify & Complete'}
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setShowVerifyForm(!showVerifyForm)}
                  className="w-full text-xs text-emerald-700 font-black py-2 hover:underline cursor-pointer"
                >
                  {showVerifyForm ? 'Hide Form' : 'Enter Verification Code'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Section */}
      {order && (
        <div className="mt-8 bg-white border-2 border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
              💬 Chat with Seller
            </h3>
            <span className="text-xs px-3 py-1 rounded-full font-black uppercase tracking-wider bg-slate-100 text-slate-700">
              Order #{order.id.slice(0, 8)}
            </span>
          </div>

          {/* Messages Feed */}
          <div className="space-y-3 mb-4 max-h-96 overflow-y-auto bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-100">
            {messages.length === 0 ? (
              <p className="text-center text-slate-400 text-xs py-8">No messages yet. Send a greeting to the seller.</p>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender_id === currentUserId;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-md px-4 py-3 rounded-2xl text-sm ${
                        isMe
                          ? 'bg-emerald-700 text-white rounded-br-none shadow-sm'
                          : 'bg-white text-slate-900 border border-slate-200 rounded-bl-none shadow-sm'
                      }`}
                    >
                      <p className="whitespace-pre-line">{msg.content}</p>
                      {msg.message_type === 'verification_code' && (
                        <div className="mt-2 p-2 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 font-mono font-black text-base text-center">
                          {msg.code_value}
                        </div>
                      )}
                      <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-emerald-200' : 'text-slate-400'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Message Input */}
          {order.status !== 'completed' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message or ask the seller..."
                className="flex-1 px-4 py-3 border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-600 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <button
                onClick={handleSendMessage}
                className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-2xl font-bold transition-all flex items-center justify-center cursor-pointer shadow-md"
              >
                <Send size={18} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
