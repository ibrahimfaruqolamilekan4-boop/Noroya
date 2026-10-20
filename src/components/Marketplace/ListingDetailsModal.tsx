import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  X, ShieldCheck, CheckCircle2, Lock, MessageSquare, 
  Sparkles, Star, UserCheck, ArrowRight, Loader2, Phone, Share2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { marketplaceService, MarketplaceListing } from '../../lib/marketplaceService';

interface ListingDetailsModalProps {
  listing: MarketplaceListing | null;
  currentUser: any;
  onClose: () => void;
  onStartOrder: (order: any) => void;
}

export function ListingDetailsModal({
  listing,
  currentUser,
  onClose,
  onStartOrder
}: ListingDetailsModalProps) {
  const [loading, setLoading] = useState(false);

  if (!listing) return null;

  const cat = listing.marketplace_categories;
  const isForeignNumber = cat?.type === 'foreign_number';
  const isOwner = (currentUser?.id || currentUser?.uid) === listing.seller_id;
  const sellerName = listing.profiles?.full_name || listing.profiles?.name || 'Verified Seller';
  const rating = listing.profiles?.marketplace_seller_rating || 5.0;

  const handleBuyNow = async () => {
    if (!currentUser?.id && !currentUser?.uid) {
      toast.error('Please log in to purchase digital items.');
      return;
    }

    if (isOwner) {
      toast.error('You cannot buy your own product listing.');
      return;
    }

    setLoading(true);
    try {
      const buyerId = currentUser.id || currentUser.uid;
      const order = await marketplaceService.initiatePurchase(buyerId, listing.id, listing);
      toast.success('Live chat opened!');
      onStartOrder(order);
    } catch (err: any) {
      console.error('[handleBuyNow] Error:', err);
      toast.error(err.message || 'Failed to initiate purchase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl font-bold">
              {cat?.icon || (isForeignNumber ? '📱' : '🌐')}
            </span>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                {cat?.name || (isForeignNumber ? 'Foreign Number' : 'Social Media Account')}
              </span>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                Product Details
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-200/60 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Main Title & Price */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 leading-snug">
                {listing.title}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/60">
                  <Star size={12} className="fill-amber-400 text-amber-400" />
                  {Number(rating).toFixed(1)} Seller Rating
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  by <b className="text-slate-700">{sellerName}</b>
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block">Price</span>
              <span className="text-2xl font-black text-emerald-600 font-mono">
                ₦{Number(listing.price).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-1.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
              Description & Specifications
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line font-medium">
              {listing.description}
            </p>
          </div>

          {/* Product Specifications / Metadata */}
          {listing.product_details && Object.keys(listing.product_details).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Item Attributes
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(listing.product_details).map(([key, val]) => (
                  <div key={key} className="p-3 bg-white border border-slate-100 rounded-xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className="font-bold text-slate-800 font-mono text-xs truncate block mt-0.5">
                      {String(val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Escrow Guarantee Banner */}
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 font-black text-xs">
              <ShieldCheck size={16} className="text-emerald-600" />
              <span>NORODATA Buyer Protection Guarantee</span>
            </div>
            <ul className="text-[11px] text-slate-600 space-y-1 font-medium">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                <span>Funds held securely in escrow until you verify the product.</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                <span>Instant live chat with seller to receive OTPs & verify credentials.</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                <span>Release payout only when the phone number or account is verified.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Action Button */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/60 flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-2xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-wider transition cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handleBuyNow}
            disabled={loading || isOwner}
            className="flex-1 py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Creating Order…</span>
              </>
            ) : isOwner ? (
              <span>Your Own Listing</span>
            ) : (
              <>
                <span>Buy Now & Chat with Seller</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
