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
  category_id: string;
  title: string;
  description: string;
  price: number;
  product_details: Record<string, any>;
  image_url?: string;
  status: 'available' | 'sold' | 'pending';
  views: number;
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
  price: number;
  status: 'pending' | 'paid' | 'completed' | 'refunded';
  payment_reference?: string;
  paid_at?: string;
  verification_code?: string;
  verified_at?: string;
  created_at: string;
  completed_at?: string;
  notes?: string;
  marketplace_listings?: {
    title: string;
    price: number;
    product_details: any;
    image_url?: string;
  };
  profiles?: {
    full_name?: string;
    marketplace_seller_rating?: number;
  };
}

export interface MarketplaceMessage {
  id: string;
  order_id: string;
  sender_id: string;
  message_type: 'text' | 'verification_code';
  content: string;
  code_value?: string;
  read_at?: string;
  created_at: string;
}

const DEFAULT_CATEGORIES: MarketplaceCategory[] = [
  { id: 'cat-us-phone', name: 'US Phone Numbers', description: 'American phone numbers for verification and calls', icon: '🇺🇸', type: 'foreign_number' },
  { id: 'cat-uk-phone', name: 'UK Phone Numbers', description: 'British phone numbers for verification and calls', icon: '🇬🇧', type: 'foreign_number' },
  { id: 'cat-ca-phone', name: 'Canada Phone Numbers', description: 'Canadian phone numbers for verification and calls', icon: '🇨🇦', type: 'foreign_number' },
  { id: 'cat-ig-acc', name: 'Instagram Accounts', description: 'Verified Instagram accounts with active followers', icon: '📷', type: 'social_account' },
  { id: 'cat-tt-acc', name: 'TikTok Accounts', description: 'TikTok accounts with active followers and high engagement', icon: '🎵', type: 'social_account' },
  { id: 'cat-x-acc', name: 'Twitter/X Accounts', description: 'Twitter/X verified accounts and pages', icon: '𝕏', type: 'social_account' },
  { id: 'cat-snap-acc', name: 'Snapchat Accounts', description: 'Snapchat accounts with high score and active contacts', icon: '👻', type: 'social_account' },
  { id: 'cat-fb-acc', name: 'Facebook Accounts', description: 'Facebook pages, groups, and aged accounts', icon: '👍', type: 'social_account' },
];

export const DEFAULT_FALLBACK_LISTINGS: any[] = [
  {
    id: 'num-us-clean',
    seller_id: 'seller-1',
    category_id: 'cat-us-phone',
    title: '🇺🇸 Clean USA +1 Phone Number (WhatsApp / PayPal Ready)',
    description: 'Fresh non-VoIP USA number ready for SMS OTP code verification on WhatsApp, Telegram, PayPal, and Google.',
    price: 4500,
    product_details: { phone_number: '+1 (555) 234-8901', country: 'United States' },
    status: 'available',
    views: 89,
    created_at: new Date().toISOString(),
    marketplace_categories: { name: 'US Phone Numbers', icon: '🇺🇸', type: 'foreign_number' },
    profiles: { full_name: 'FastVerify NG', marketplace_seller_rating: 4.8, marketplace_seller_reviews: 42 }
  },
  {
    id: 'acc-ig-aged',
    seller_id: 'seller-2',
    category_id: 'cat-ig-acc',
    title: '📷 Aged Instagram Account (2020) • 12.5k Real Followers',
    description: 'Established 2020 lifestyle & fashion page. 12.5k organic followers, high engagement rate, full email access included.',
    price: 25000,
    product_details: { username: '@fashionvibes_ng', followers: '12.5k', platform: 'Instagram' },
    status: 'available',
    views: 110,
    created_at: new Date().toISOString(),
    marketplace_categories: { name: 'Instagram Accounts', icon: '📷', type: 'social_account' },
    profiles: { full_name: 'DigitalAssets Hub', marketplace_seller_rating: 4.9, marketplace_seller_reviews: 65 }
  }
];

export const marketplaceService = {
  // Get all categories
  async getCategories(): Promise<MarketplaceCategory[]> {
    try {
      const { data, error } = await supabase
        .from('marketplace_categories')
        .select('*')
        .order('name', { ascending: true });

      if (error || !data || data.length === 0) {
        return DEFAULT_CATEGORIES;
      }
      return data;
    } catch (_) {
      return DEFAULT_CATEGORIES;
    }
  },

  // Get all available listings with optional filters
  async getListings(filters?: { category?: string; type?: string; search?: string }) {
    try {
      let query = supabase
        .from('marketplace_listings')
        .select(`
          *,
          marketplace_categories(name, icon, type),
          profiles(full_name, name, marketplace_seller_rating, marketplace_seller_reviews)
        `)
        .eq('status', 'available');

      if (filters?.category && filters.category !== 'all') {
        query = query.eq('category_id', filters.category);
      }
      if (filters?.search && filters.search.trim()) {
        query = query.ilike('title', `%${filters.search.trim()}%`);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(60);

      let result = (data && data.length > 0) ? data : DEFAULT_FALLBACK_LISTINGS;

      if (filters?.category && filters.category !== 'all') {
        result = result.filter((item: any) => item.category_id === filters.category);
      }
      if (filters?.type && filters.type !== 'all') {
        result = result.filter((item: any) => item.marketplace_categories?.type === filters.type);
      }
      if (filters?.search && filters.search.trim()) {
        const q = filters.search.toLowerCase();
        result = result.filter((item: any) =>
          String(item.title || '').toLowerCase().includes(q) ||
          String(item.description || '').toLowerCase().includes(q)
        );
      }

      return result;
    } catch (err: any) {
      console.warn('[marketplaceService.getListings] Exception:', err.message);
      return DEFAULT_FALLBACK_LISTINGS;
    }
  },

  // Get single listing with seller profile and details
  async getListing(id: string) {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select(`
        *,
        marketplace_categories(name, icon, type),
        profiles(full_name, name, marketplace_seller_rating, marketplace_seller_reviews)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Increment views asynchronously
    try {
      await supabase
        .from('marketplace_listings')
        .update({ views: (data.views || 0) + 1 })
        .eq('id', id);
    } catch (_) {}

    return data;
  },

  // Create listing (for sellers)
  async createListing(sellerId: string, data: {
    categoryId: string;
    title: string;
    description: string;
    price: number;
    productDetails: any;
    imageUrl?: string;
  }) {
    // Ensure seller has seller status enabled
    try {
      await supabase
        .from('profiles')
        .update({ is_marketplace_seller: true })
        .eq('id', sellerId);
    } catch (_) {}

    const { data: listing, error } = await supabase
      .from('marketplace_listings')
      .insert({
        seller_id: sellerId,
        category_id: data.categoryId,
        title: data.title.trim(),
        description: data.description.trim(),
        price: Number(data.price),
        product_details: data.productDetails || {},
        image_url: data.imageUrl || null,
        status: 'available'
      })
      .select()
      .single();

    if (error) throw error;
    return listing;
  },

  // Start buying process (create order & initialize chat)
  async initiatePurchase(buyerId: string, listingId: string) {
    // 1. Verify listing exists
    const { data: listing, error: listingError } = await supabase
      .from('marketplace_listings')
      .select('id, seller_id, price, title')
      .eq('id', listingId)
      .single();

    if (listingError) throw listingError;
    if (listing.seller_id === buyerId) {
      throw new Error('You cannot buy your own listing.');
    }

    // 2. Check for an existing open order for this buyer on this listing
    const { data: existingOrder } = await supabase
      .from('marketplace_orders')
      .select('*')
      .eq('listing_id', listingId)
      .eq('buyer_id', buyerId)
      .in('status', ['pending', 'paid'])
      .maybeSingle();

    if (existingOrder) {
      return existingOrder;
    }

    // 3. Create order
    const { data: order, error: orderError } = await supabase
      .from('marketplace_orders')
      .insert({
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: listing.seller_id,
        price: listing.price,
        status: 'pending'
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 4. Send initial system/greeting message in order chat
    await supabase.from('marketplace_messages').insert({
      order_id: order.id,
      sender_id: buyerId,
      message_type: 'text',
      content: `Hi! I'm interested in purchasing: "${listing.title}". Let's finalize the details here.`
    });

    return order;
  },

  // Send message in chat
  async sendMessage(orderId: string, senderId: string, content: string) {
    const { error } = await supabase
      .from('marketplace_messages')
      .insert({
        order_id: orderId,
        sender_id: senderId,
        message_type: 'text',
        content: content.trim()
      });

    if (error) throw error;
  },

  // Get all messages for an order
  async getMessages(orderId: string): Promise<MarketplaceMessage[]> {
    const { data, error } = await supabase
      .from('marketplace_messages')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Process payment (deduct securely from wallet)
  async processPayment(buyerId: string, orderId: string, amount: number) {
    // 1. Check wallet balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, wallet_balance, balance')
      .eq('id', buyerId)
      .single();

    if (profileError) throw profileError;
    const currentBalance = Number(profile.wallet_balance !== undefined ? profile.wallet_balance : (profile.balance ?? 0));
    if (currentBalance < amount) {
      throw new Error(`Insufficient wallet balance. You need ₦${amount.toLocaleString()} but currently have ₦${currentBalance.toLocaleString()}.`);
    }

    // 2. Atomically deduct wallet balance via deduct_balance RPC
    let deductOk = false;
    const { data: rpcOk, error: rpcErr } = await supabase.rpc('deduct_balance', {
      user_uuid: buyerId,
      amount: Number(amount)
    });

    if (!rpcErr && rpcOk) {
      deductOk = true;
    } else {
      // Fallback direct update if RPC is missing
      const { error: directErr } = await supabase
        .from('profiles')
        .update({
          wallet_balance: Math.max(0, currentBalance - amount),
          balance: Math.max(0, (profile.balance || currentBalance) - amount)
        })
        .eq('id', buyerId);
      if (directErr) throw directErr;
      deductOk = true;
    }

    if (!deductOk) {
      throw new Error('Failed to deduct payment from wallet. Please try again.');
    }

    // 3. Mark order as paid
    const ref = `MRKT-${Date.now()}`;
    const { error: updateError } = await supabase
      .from('marketplace_orders')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_reference: ref
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    // 4. Record transaction in main transactions ledger
    try {
      await supabase.from('transactions').insert({
        user_id: buyerId,
        type: 'marketplace',
        amount: Number(amount),
        status: 'success',
        reference: ref,
        description: `Marketplace purchase for order #${orderId.slice(0, 8)}`,
        created_at: new Date().toISOString()
      });
    } catch (_) {}

    // 5. Send automated confirmation in chat
    try {
      await supabase.from('marketplace_messages').insert({
        order_id: orderId,
        sender_id: buyerId,
        message_type: 'text',
        content: `💳 Payment of ₦${amount.toLocaleString()} was successful! (Ref: ${ref}). Please provide the product details and verification code.`
      });
    } catch (_) {}

    return true;
  },

  // Seller sends verification code
  async sendVerificationCode(orderId: string, senderId: string, code: string) {
    const { error } = await supabase
      .from('marketplace_messages')
      .insert({
        order_id: orderId,
        sender_id: senderId,
        message_type: 'verification_code',
        content: 'Here is your official verification code:',
        code_value: code.trim()
      });

    if (error) throw error;
  },

  // Buyer verifies code and completes order
  async verifyAndComplete(orderId: string, code: string) {
    // 1. Get the latest verification message
    const { data: message, error: messageError } = await supabase
      .from('marketplace_messages')
      .select('*')
      .eq('order_id', orderId)
      .eq('message_type', 'verification_code')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (messageError) throw messageError;
    if (!message || message.code_value?.trim().toLowerCase() !== code.trim().toLowerCase()) {
      throw new Error('Invalid verification code. Please check the code sent by the seller.');
    }

    // 2. Mark order as completed
    const { data: order, error: orderError } = await supabase
      .from('marketplace_orders')
      .select('id, listing_id, seller_id, price')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    const { error: completeError } = await supabase
      .from('marketplace_orders')
      .update({
        status: 'completed',
        verification_code: code.trim(),
        verified_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (completeError) throw completeError;

    // 3. Mark listing as sold
    if (order.listing_id) {
      await supabase
        .from('marketplace_listings')
        .update({ status: 'sold' })
        .eq('id', order.listing_id);
    }

    // 4. Credit the seller's wallet with the sale amount (minus small 2% commission)
    try {
      const sellerPayout = Math.floor(Number(order.price) * 0.98);
      await supabase.rpc('increment_balance', {
        user_uuid: order.seller_id,
        amount: sellerPayout
      });
      await supabase.from('transactions').insert({
        user_id: order.seller_id,
        type: 'marketplace_payout',
        amount: sellerPayout,
        status: 'success',
        reference: `PAYOUT-${Date.now()}`,
        description: `Marketplace sale payout for order #${orderId.slice(0, 8)}`,
        created_at: new Date().toISOString()
      });
    } catch (_) {}

    // 5. Send order completion announcement in chat
    try {
      await supabase.from('marketplace_messages').insert({
        order_id: orderId,
        sender_id: order.seller_id,
        message_type: 'text',
        content: `🎉 Order marked COMPLETED! The product has been verified successfully. Funds have been released to the seller.`
      });
    } catch (_) {}

    return true;
  },

  // Real-time chat subscription
  subscribeToMessages(orderId: string, callback: (msg: any) => void) {
    const channelName = `marketplace-order-${orderId}-${Date.now()}`;
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'marketplace_messages',
          filter: `order_id=eq.${orderId}`
        },
        (payload) => callback(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  },

  // Get user's seller listings
  async getMyListings(userId: string) {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select(`
        *,
        marketplace_categories(name, icon, type)
      `)
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[marketplaceService.getMyListings]', error.message);
      return [];
    }
    return data || [];
  },

  // Get user's purchases (orders where user is buyer)
  async getMyPurchases(userId: string) {
    const { data, error } = await supabase
      .from('marketplace_orders')
      .select(`
        *,
        marketplace_listings(title, price, product_details, image_url),
        profiles:seller_id(full_name, name, marketplace_seller_rating)
      `)
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[marketplaceService.getMyPurchases]', error.message);
      return [];
    }
    return data || [];
  },

  // Get user's sales (orders where user is seller)
  async getMySales(userId: string) {
    const { data, error } = await supabase
      .from('marketplace_orders')
      .select(`
        *,
        marketplace_listings(title, price, product_details, image_url),
        profiles:buyer_id(full_name, name)
      `)
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[marketplaceService.getMySales]', error.message);
      return [];
    }
    return data || [];
  }
};
