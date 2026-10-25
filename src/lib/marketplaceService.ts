import { supabase } from './supabase';

export interface MarketplaceCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  type: 'foreign_number' | 'social_account' | 'esim';
  created_at?: string;
}

export interface MarketplaceListing {
  id: string;
  seller_id: string;
  created_by_id?: string;
  created_by_email?: string;
  category_id: string;
  title: string;
  description: string;
  price: number;
  product_details: Record<string, any>;
  image_url?: string;
  status: 'available' | 'sold' | 'pending';
  views: number;
  is_admin_listing?: boolean;
  created_at: string;
  updated_at?: string;
  marketplace_categories?: {
    name: string;
    icon: string;
    type: string;
  };
  profiles?: {
    full_name?: string;
    name?: string;
    marketplace_seller_rating?: number;
    marketplace_seller_reviews?: number;
  };
}

export interface MarketplaceOrder {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  clicked_number?: string;
  phone_number?: string;
  price: number;
  status: 'open' | 'pending' | 'code_requested' | 'code_sent' | 'paid' | 'completed' | 'refunded';
  is_foreign_number?: boolean;
  code_requested?: boolean;
  payment_reference?: string;
  paid_at?: string;
  verification_code?: string;
  verified_at?: string;
  last_message?: string;
  last_message_at?: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  notes?: string;
  marketplace_listings?: {
    id?: string;
    title: string;
    price: number;
    description?: string;
    product_details: any;
    image_url?: string;
    marketplace_categories?: {
      name: string;
      icon: string;
      type: string;
    };
  };
  seller?: {
    id?: string;
    full_name?: string;
    name?: string;
    marketplace_seller_rating?: number;
  };
  buyer?: {
    id?: string;
    full_name?: string;
    name?: string;
    email?: string;
    phone_number?: string;
    wallet_balance?: number;
  };
  profiles?: {
    full_name?: string;
    marketplace_seller_rating?: number;
  };
  messages?: MarketplaceMessage[];
}

export interface MarketplaceMessage {
  id: string;
  order_id: string;
  sender_id: string;
  sender_name?: string;
  sender_email?: string;
  sender_role?: 'buyer' | 'admin' | 'seller' | 'operator';
  message_type: 'text' | 'verification_code';
  content: string;
  body?: string;
  code_value?: string;
  read_at?: string;
  created_at: string;
}

export const DEFAULT_CATEGORIES: MarketplaceCategory[] = [
  { id: 'cat-us-phone', name: 'US Phone Numbers', description: 'American phone numbers for verification and calls', icon: '🇺🇸', type: 'foreign_number' },
  { id: 'cat-uk-phone', name: 'UK Phone Numbers', description: 'British phone numbers for verification and calls', icon: '🇬🇧', type: 'foreign_number' },
  { id: 'cat-ca-phone', name: 'Canada Phone Numbers', description: 'Canadian phone numbers for verification and calls', icon: '🇨🇦', type: 'foreign_number' },
  { id: 'cat-ig-acc', name: 'Instagram Accounts', description: 'Verified Instagram accounts with active followers', icon: '📷', type: 'social_account' },
  { id: 'cat-tt-acc', name: 'TikTok Accounts', description: 'TikTok accounts with active followers and high engagement', icon: '🎵', type: 'social_account' },
  { id: 'cat-x-acc', name: 'Twitter/X Accounts', description: 'Twitter/X verified accounts and pages', icon: '𝕏', type: 'social_account' },
  { id: 'cat-snap-acc', name: 'Snapchat Accounts', description: 'Snapchat accounts with high score and active contacts', icon: '👻', type: 'social_account' },
  { id: 'cat-fb-acc', name: 'Facebook Accounts', description: 'Facebook pages, groups, and aged accounts', icon: '👍', type: 'social_account' },
];

export const DEFAULT_FALLBACK_LISTINGS: MarketplaceListing[] = [];

async function marketplaceFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const email = session?.user?.email || '';
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(email ? { 'x-admin-email': email } : {}),
      ...(options?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(json?.error || json?.message || `Request failed (${res.status})`);
    err.code = json?.code;
    err.required = json?.required;
    err.balance = json?.balance;
    throw err;
  }
  return json as T;
}

export const marketplaceService = {
  async getMarketplaceAdmins(): Promise<{ admins: string[]; isCallerAdmin: boolean }> {
    try {
      return await marketplaceFetch<{ admins: string[]; isCallerAdmin: boolean }>('/api/marketplace/admins');
    } catch (_) {
      return {
        admins: ['ibrahimfaruqolamilekan4@gmail.com', 'adewaleogunkeye200@gmail.com', 'jeffholland299@gmail.com', 'triumphanttosin@gmail.com'],
        isCallerAdmin: false,
      };
    }
  },

  async promoteAdminEmail(email: string): Promise<{ success: boolean; email: string; admins: string[]; message: string }> {
    return marketplaceFetch('/api/marketplace/admins/promote', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  },

  async removeAdminEmail(email: string): Promise<{ success: boolean; admins: string[] }> {
    return marketplaceFetch(`/api/marketplace/admins/${encodeURIComponent(email.trim().toLowerCase())}`, {
      method: 'DELETE',
    });
  },

  async getCategories(): Promise<MarketplaceCategory[]> {
    try {
      const data = await marketplaceFetch<{ categories: MarketplaceCategory[] }>('/api/marketplace/categories');
      return data.categories?.length ? data.categories : DEFAULT_CATEGORIES;
    } catch (_) {
      return DEFAULT_CATEGORIES;
    }
  },

  async getListings(filters?: { category?: string; type?: string; search?: string }): Promise<MarketplaceListing[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.category) params.set('category', filters.category);
      if (filters?.type) params.set('type', filters.type);
      if (filters?.search) params.set('search', filters.search);
      const data = await marketplaceFetch<{ listings: MarketplaceListing[] }>(`/api/marketplace/listings?${params.toString()}`);
      return data.listings || [];
    } catch (err: any) {
      console.warn('[marketplaceService.getListings] Fallback:', err.message);
      let result = [...DEFAULT_FALLBACK_LISTINGS];
      if (filters?.category && filters.category !== 'all') {
        result = result.filter((item) => item.category_id === filters.category);
      }
      if (filters?.type && filters.type !== 'all') {
        result = result.filter((item) => item.marketplace_categories?.type === filters.type);
      }
      return result;
    }
  },

  async getListing(id: string): Promise<MarketplaceListing> {
    const listings = await this.getListings();
    const found = listings.find((l) => l.id === id);
    if (!found) throw new Error('Listing not found');
    return found;
  },

  async createListing(_sellerId: string, data: {
    categoryId: string;
    title: string;
    description: string;
    price: number;
    productDetails: any;
    imageUrl?: string;
  }): Promise<MarketplaceListing> {
    const res = await marketplaceFetch<{ listing: MarketplaceListing }>('/api/marketplace/listings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.listing;
  },

  async deleteListing(listingId: string): Promise<void> {
    await marketplaceFetch(`/api/marketplace/listings/${encodeURIComponent(listingId)}`, {
      method: 'DELETE',
    });
  },

  // Start buying process (validates wallet balance, then immediately opens order & permanent chat with Admin)
  async initiatePurchase(_buyerId: string, listingId: string, listingSnapshot?: MarketplaceListing): Promise<MarketplaceOrder> {
    const res = await marketplaceFetch<{ order: MarketplaceOrder }>('/api/marketplace/orders/initiate', {
      method: 'POST',
      body: JSON.stringify({ listingId, listingSnapshot }),
    });
    return res.order;
  },

  async getOrderDetails(orderId: string): Promise<{ order: MarketplaceOrder; messages: MarketplaceMessage[]; buyerBalance: number; isAdmin: boolean }> {
    return marketplaceFetch(`/api/marketplace/orders/${encodeURIComponent(orderId)}`);
  },

  async sendMessage(orderId: string, _senderId: string, content: string): Promise<void> {
    await marketplaceFetch(`/api/marketplace/orders/${encodeURIComponent(orderId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: content.trim() }),
    });
  },

  async getMessages(orderId: string): Promise<MarketplaceMessage[]> {
    const data = await this.getOrderDetails(orderId);
    return data.messages || [];
  },

  // Buyer clicks "Request Verification Code" in chat
  async requestVerificationCode(orderId: string): Promise<{ order: MarketplaceOrder; message: MarketplaceMessage }> {
    return marketplaceFetch(`/api/marketplace/orders/${encodeURIComponent(orderId)}/request-code`, {
      method: 'POST',
    });
  },

  // Admin/Seller sends verification code in chat (optionally completing the deal & auto-debiting buyer wallet)
  async sendVerificationCode(orderId: string, _senderId: string, code: string, autoCompleteDeal = false): Promise<{ order: MarketplaceOrder; dealCompleted: boolean; newBuyerBalance?: number }> {
    return marketplaceFetch(`/api/marketplace/orders/${encodeURIComponent(orderId)}/send-code`, {
      method: 'POST',
      body: JSON.stringify({ code: code.trim(), autoCompleteDeal }),
    });
  },

  // Admin clicks "Send Code & Complete (debit ₦PRICE)"
  async sendCodeAndComplete(orderId: string, code: string): Promise<{ success: boolean; order?: MarketplaceOrder; newBuyerBalance?: number; reference?: string; message?: any }> {
    return marketplaceFetch(`/api/marketplace/orders/${encodeURIComponent(orderId)}/send-code-and-complete`, {
      method: 'POST',
      body: JSON.stringify({ code: code.trim() }),
    });
  },

  // Complete deal & automatically debit buyer's wallet
  async verifyAndComplete(orderId: string, code?: string): Promise<{ order: MarketplaceOrder; newBuyerBalance?: number; reference?: string }> {
    return marketplaceFetch(`/api/marketplace/orders/${encodeURIComponent(orderId)}/complete-deal`, {
      method: 'POST',
      body: JSON.stringify({ code: code?.trim() || '' }),
    });
  },

  async processPayment(_buyerId: string, orderId: string, _amount?: number): Promise<MarketplaceOrder> {
    const res = await this.verifyAndComplete(orderId);
    return res.order;
  },

  // Poll chat updates (works across all serverless & browser sessions)
  subscribeToMessages(orderId: string, callback: (msg: any) => void) {
    let active = true;
    const interval = setInterval(async () => {
      if (!active) return;
      try {
        const data = await marketplaceService.getOrderDetails(orderId);
        if (data.messages) {
          data.messages.forEach((m) => callback(m));
        }
      } catch (_) {}
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  },

  async getMyListings(userId: string): Promise<MarketplaceListing[]> {
    try {
      const data = await marketplaceFetch<{ listings: MarketplaceListing[] }>('/api/marketplace/listings?includeSold=true');
      return (data.listings || []).filter((l) => l.seller_id === userId || l.created_by_id === userId || l.is_admin_listing);
    } catch (_) {
      return [];
    }
  },

  async getMyPurchases(_userId: string): Promise<MarketplaceOrder[]> {
    try {
      const data = await marketplaceFetch<{ orders: MarketplaceOrder[] }>('/api/marketplace/orders?role=buyer');
      return data.orders || [];
    } catch (_) {
      return [];
    }
  },

  async getMySales(_userId: string): Promise<MarketplaceOrder[]> {
    try {
      const data = await marketplaceFetch<{ orders: MarketplaceOrder[] }>('/api/marketplace/orders?role=seller');
      return data.orders || [];
    } catch (_) {
      return [];
    }
  },

  async getAdminOrders(): Promise<MarketplaceOrder[]> {
    try {
      const data = await marketplaceFetch<{ orders: MarketplaceOrder[] }>('/api/marketplace/orders?role=admin');
      return data.orders || [];
    } catch (_) {
      return [];
    }
  },

  async getEsimPlans(): Promise<EsimPlan[]> {
    try {
      const data = await marketplaceFetch<{ plans: EsimPlan[] }>('/api/esim/plans');
      return Array.isArray(data.plans) ? data.plans : [];
    } catch (err: any) {
      console.warn('[marketplaceService.getEsimPlans] Error:', err.message);
      return [];
    }
  },

  async createEsimPlan(planData: Partial<EsimPlan>): Promise<{ success: boolean; plan: EsimPlan }> {
    return marketplaceFetch('/api/esim/plans', {
      method: 'POST',
      body: JSON.stringify(planData),
    });
  },

  async deleteEsimPlan(id: string): Promise<{ success: boolean; plans: EsimPlan[] }> {
    return marketplaceFetch(`/api/esim/plans/${id}`, {
      method: 'DELETE',
    });
  }
};

export interface EsimPlan {
  id: string;
  title: string;
  country: string;
  flag: string;
  data_amount: string;
  duration: string;
  numericPrice: number;
  price: string;
  carrier: string;
  desc: string;
  status?: string;
  created_at?: string;
}

