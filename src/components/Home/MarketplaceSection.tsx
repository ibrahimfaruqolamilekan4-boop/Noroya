import React from 'react';
import { motion } from 'framer-motion';

interface MarketplaceSectionProps {
  onAuth?: () => void;
  onNavigateMarketplace?: (category?: string) => void;
}

export function MarketplaceSection({ onAuth, onNavigateMarketplace }: MarketplaceSectionProps) {
  const handleClick = (category?: string) => {
    if (onNavigateMarketplace) {
      onNavigateMarketplace(category);
    } else if (onAuth) {
      onAuth();
    } else {
      window.location.href = category ? `/marketplace?category=${category}` : '/marketplace';
    }
  };

  return (
    <div className="py-14 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50/60 border-y border-emerald-100/80">
      <div className="max-w-6xl mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-black uppercase tracking-wider mb-3">
            🛍️ New Feature: Digital Marketplace
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Buy Verified Foreign Numbers & Social Accounts
          </h2>
          <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto mt-2.5">
            Instant wallet payment, protected escrow checkout, and direct in-app verification inside NORODATA.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Foreign Numbers Card */}
          <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl p-8 border-2 border-emerald-200/90 hover:border-emerald-500 cursor-pointer shadow-md hover:shadow-xl transition-all relative overflow-hidden group"
            onClick={() => handleClick('foreign_number')}
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform">
              📱
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-black text-xs uppercase tracking-wider">
                US • UK • Canada
              </span>
              <span className="text-xs text-slate-400 font-semibold">• Instant OTP Delivery</span>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 group-hover:text-emerald-700 transition-colors">
              Buy Foreign Phone Numbers
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Verified international phone numbers for WhatsApp, Telegram, PayPal, banking, and app SMS verifications.
            </p>
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">Starting from ₦1,500</span>
              <span className="text-emerald-700 font-black text-sm group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                Browse Numbers →
              </span>
            </div>
          </motion.div>

          {/* Social Media Accounts Card */}
          <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl p-8 border-2 border-teal-200/90 hover:border-teal-500 cursor-pointer shadow-md hover:shadow-xl transition-all relative overflow-hidden group"
            onClick={() => handleClick('social_account')}
          >
            <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform">
              🌐
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 font-black text-xs uppercase tracking-wider">
                IG • TikTok • X • Snapchat
              </span>
              <span className="text-xs text-slate-400 font-semibold">• Real Followers</span>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 group-hover:text-teal-700 transition-colors">
              Buy Social Media Accounts
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Aged and verified accounts with active followers, monetization status, and escrow-guaranteed transfers.
            </p>
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">Starting from ₦3,000</span>
              <span className="text-teal-700 font-black text-sm group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                Browse Accounts →
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
