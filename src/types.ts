export type UserRole = 'user' | 'reseller' | 'agent' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  balance: number;
  role: UserRole;
  referralCode: string;
  referredBy?: string;
  phoneNumber?: string;
  createdAt: string;
  monnifyBankName?: string;
  monnifyAccountNumber?: string;
  monnifyAccountName?: string;
}

export type TransactionType = 'data' | 'airtime' | 'funding' | 'transfer' | 'bill';
export type TransactionStatus = 'pending' | 'completed' | 'failed';

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  description: string;
  details?: any;
  reference: string;
  createdAt: string;
  cashbackEarned?: number;
}

export type NetworkType = 'MTN' | 'Airtel' | 'Glo' | '9mobile';

export interface ServicePlan {
  id: string;
  network: string;
  type: 'data' | 'airtime';
  name: string;
  price: number;
  resellerPrice?: number;
  agentPrice?: number;
  duration?: string;
  
  // Custom schema compatibility fields
  planType?: string;
  planName?: string;
  amount?: number;
  validity?: string;
  apiPlanId?: string;

  // Fully dynamic & data-driven literal keys
  plan_category?: string;
  plan_name?: string;
  retail_price?: number;
  network_type?: string;
  validity_days?: string;
  peyflex_variation_id?: string;
  peyflex_id?: string;
  badge?: string;
  expiresAt?: any;
}
