import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserProfile } from '../types';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setSimulatedUser: (profile: UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Expose a helper to set a simulated session
  const setSimulatedUser = (profile: UserProfile | null) => {
    if (profile) {
      localStorage.setItem('vtu_simulated_user', JSON.stringify(profile));
      setUserProfile(profile);
    } else {
      localStorage.removeItem('vtu_simulated_user');
      setUserProfile(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    // Check if there is a simulated user first
    const savedUser = localStorage.getItem('vtu_simulated_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUserProfile(parsed);
        setLoading(false);
      } catch (err) {
        localStorage.removeItem('vtu_simulated_user');
      }
    }

    // Set up Supabase Auth Session listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      const isSimulated = localStorage.getItem('vtu_simulated_user') !== null;

      if (session?.user) {
        // Clear any simulated user if a real Supabase user logs in
        localStorage.removeItem('vtu_simulated_user');
        
        const sbUser = session.user;

        // Try to fetch profile from Supabase db first
        let sbProfile: any = null;
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sbUser.id)
            .maybeSingle();
          if (!error && data) {
            sbProfile = data;
          }
        } catch (e) {
          console.warn("Could not load from Supabase profiles:", e);
        }

        if (!sbProfile) {
          try {
            const { data, error } = await supabase
              .from('users')
              .select('*')
              .eq('id', sbUser.id)
              .maybeSingle();
            if (!error && data) {
              sbProfile = data;
            }
          } catch (e) {
            console.warn("Could not load from Supabase users table:", e);
          }
        }

        // Standard User Profile payload
        const initialBalance = sbProfile?.wallet_balance !== undefined ? sbProfile.wallet_balance : (sbProfile?.balance ?? 0);
        const defaultProfile: UserProfile = {
          uid: sbUser.id,
          email: sbUser.email || '',
          fullName: sbProfile?.name || sbProfile?.username || sbUser.user_metadata?.fullName || sbUser.user_metadata?.full_name || 'User',
          balance: initialBalance,
          wallet_balance: initialBalance,
          role: sbProfile?.role || sbProfile?.user_role || (sbUser.email?.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com' ? 'admin' : 'user'),
          referralCode: sbProfile?.referral_code || '',
          phoneNumber: sbProfile?.phone_number || '',
          transactionPin: sbProfile?.transaction_pin || '',
          createdAt: sbProfile?.createdAt || sbProfile?.created_at || new Date().toISOString()
        };

        setUserProfile(defaultProfile);
        setLoading(false);

        // Define a function to reload user profile directly from Supabase to sync balances
        const fetchLatestSupabaseProfile = async () => {
          try {
            const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', sbUser.id)
              .maybeSingle();

            if (!error && data) {
              setUserProfile(prev => {
                const base = prev || defaultProfile;
                const latestBalance = data.wallet_balance !== undefined ? data.wallet_balance : (data.balance ?? base.balance);
                return {
                  ...base,
                  fullName: data.name || data.username || base.fullName,
                  balance: latestBalance,
                  wallet_balance: latestBalance,
                  phoneNumber: data.phone_number || base.phoneNumber,
                  transactionPin: data.transaction_pin || base.transactionPin,
                };
              });
            }
          } catch (err) {
            console.warn("Error background polling user profile from Supabase:", err);
          }
        };

        // 1. Establish a real-time Postgres changes listener in Supabase for immediate balance updates
        const channel = supabase
          .channel(`profiles-realtime-${sbUser.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'profiles',
              filter: `id=eq.${sbUser.id}`
            },
            (payload) => {
              console.log('⚡ [Supabase Realtime Sync]: User profile update received!', payload);
              if (payload.new) {
                const updated = payload.new as any;
                setUserProfile(prev => {
                  const base = prev || defaultProfile;
                  const latestBalance = updated.wallet_balance !== undefined ? updated.wallet_balance : (updated.balance ?? base.balance);
                  return {
                    ...base,
                    fullName: updated.name || updated.username || base.fullName,
                    balance: latestBalance,
                    wallet_balance: latestBalance,
                    phoneNumber: updated.phone_number || base.phoneNumber,
                    transactionPin: updated.transaction_pin || base.transactionPin,
                  };
                });
              }
            }
          )
          .subscribe();

        // 2. Set up a bulletproof background polling interval (every 8 seconds) in case Realtime replication is disabled
        const pollInterval = setInterval(fetchLatestSupabaseProfile, 8000);

        unsubProfile = () => {
          channel.unsubscribe();
          clearInterval(pollInterval);
        };
      } else {
        if (!isSimulated) {
          setUserProfile(null);
          setLoading(false);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, []);

  const signInWithGoogle = async () => {
    localStorage.removeItem('vtu_simulated_user');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    localStorage.removeItem('vtu_simulated_user');
    await supabase.auth.signOut();
    setUserProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user: userProfile, loading, signInWithGoogle, signOut, setSimulatedUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
