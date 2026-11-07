import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { marketplaceService, MarketplaceCategory } from '../../lib/marketplaceService';

interface CreateListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: MarketplaceCategory[];
  sellerId: string;
  onSuccess: () => void;
}

export function CreateListingModal({
  isOpen,
  onClose,
  categories,
  sellerId,
  onSuccess
}: CreateListingModalProps) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [identifier, setIdentifier] = useState(''); // e.g., +1 (555) 123-4567 or @username
  const [extraDetail, setExtraDetail] = useState(''); // e.g. followers count or carrier
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const selectedCategory = categories.find(c => c.id === categoryId);
  const isNumber = selectedCategory?.type === 'foreign_number';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !price || !categoryId) {
      toast.error('Please fill in all required fields.');
      return;
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      toast.error('Price must be greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      const productDetails: any = {
        item_identifier: identifier.trim(),
      };
      if (isNumber) {
        productDetails.phone_number = identifier.trim();
        productDetails.country = selectedCategory?.name?.split(' ')[0] || 'Foreign';
        if (extraDetail) productDetails.carrier = extraDetail.trim();
      } else {
        productDetails.username = identifier.trim();
        if (extraDetail) productDetails.followers_or_info = extraDetail.trim();
      }

      await marketplaceService.createListing(sellerId, {
        categoryId,
        title: title.trim(),
        description: description.trim(),
        price: numPrice,
        productDetails
      });

      toast.success('🎉 Listing created and published to the Digital Marketplace!');
      setTitle('');
      setDescription('');
      setPrice('');
      setIdentifier('');
      setExtraDetail('');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create listing.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Plus size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Create Marketplace Listing</h3>
                <p className="text-xs text-slate-500 font-medium">Sell foreign numbers or social accounts</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Category selection */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
                Product Category
              </label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name} ({cat.type === 'foreign_number' ? 'Phone Number' : 'Social Account'})
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
                Listing Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={isNumber ? "e.g. Clean USA +1 Number for WhatsApp & Telegram" : "e.g. 50k Followers Instagram Account (Fashion Niche)"}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Price */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
                Selling Price (₦)
              </label>
              <input
                type="number"
                required
                min="100"
                step="50"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="e.g. 3500"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-base font-black text-emerald-600 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Product Identifier (Number or Handle) */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
                {isNumber ? "Phone Number Preview" : "Handle / Username"}
              </label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder={isNumber ? "e.g. +1 (305) 555-0199" : "e.g. @fashion_trendz"}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-mono font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Extra detail */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
                {isNumber ? "Carrier / Verification Type" : "Followers / Engagement Rate"}
              </label>
              <input
                type="text"
                value={extraDetail}
                onChange={e => setExtraDetail(e.target.value)}
                placeholder={isNumber ? "e.g. T-Mobile VoIP / Supports WhatsApp & SMS" : "e.g. 52,000 active organic followers"}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
                Description & Delivery Terms
              </label>
              <textarea
                required
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe how the buyer will receive access and verification codes after payment..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-2.5 text-xs text-emerald-800 font-semibold">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
              <span>Payments are held securely in escrow until buyer verifies the code.</span>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {submitting ? 'Publishing…' : 'Publish Listing'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
