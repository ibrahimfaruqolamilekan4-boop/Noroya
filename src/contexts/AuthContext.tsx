import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSupabaseError } from '../hooks/useSupabaseError';
import type { UserProfile } from '../types';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  // Optimistically merges fields into the CURRENT real authenticated user's profile in local
  // state (e.g. right after a wallet top-up succeeds, before the realtime/poll sync catches up).
  // This only ever updates the in-memory profile for the real, currently signed-in Supabase user
  // -- it cannot fabricate a session or impersonate anyone, unlike the old "simulated user" bypass.
  updateLocalProfile: (partial: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapProfileRow(sbUser: any, row: any): UserProfile {
  return {
    uid: sbUser.id,
    email: sbUser.email || '',
    fullName: row?.full_name || sbUser.user_metadata?.name || sbUser.user_metadata?.full_name || 'User',
    balance: row?.wallet_balance ?? 0,
    wallet_balance: row?.wallet_balance ?? 0,
    role: row?.role || 'user',
    referralCode: row?.referral_code || '',
    phoneNumber: row?.phone_number || '',
    transactionPin: row?.transaction_pin || '',
    createdAt: row?.created_at || new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { handleSupabaseError } = useSupabaseError();

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    // Fetches the profile row for a freshly authenticated Supabase user. The row is created
    // server-side (see supabase_migration.sql: handle_new_user trigger on auth.users) the moment
    // the account is created, so this is normally an instant read. We retry briefly in case of
    // replication lag rather than assuming the row exists on the very first tick.
    const fetchProfileWithRetry = async (userId: string, attempts = 4): Promise<any> => {
      for (let i = 0; i < attempts; i++) {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (error) {
          handleSupabaseError(error, { contextName: 'Load Profile', silent: i < attempts - 1 });
        }
        if (data) return data;
        await new Promise((r) => setTimeout(r, 400));
      }
      return null;
    };

    const setupForUser = async (sbUser: any) => {
      const row = await fetchProfileWithRetry(sbUser.id);
      const profile = mapProfileRow(sbUser, row);
      setUserProfile(profile);
      setLoading(false);

      // Realtime sync so wallet balance / profile edits (e.g. from an admin, or a purchase) reflect immediately.
      const channel = supabase
        .channel(`profiles-realtime-${sbUser.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${sbUser.id}` },
          (payload) => {
            if (payload.new) {
              const updated = payload.new as any;
              setUserProfile((prev) => (prev ? { ...prev, ...mapProfileRow(sbUser, updated) } : mapProfileRow(sbUser, updated)));
            }
          }
        )
        .subscribe();

      // Belt-and-braces polling fallback in case Realtime replication is ever disabled on the project.
      const pollInterval = setInterval(async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', sbUser.id).maybeSingle();
        if (data) setUserProfile((prev) => (prev ? { ...prev, ...mapProfileRow(sbUser, data) } : mapProfileRow(sbUser, data)));
      }, 8000);

      unsubProfile = () => {
        channel.unsubscribe();
        clearInterval(pollInterval);
      };
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      if (session?.user) {
        await setupForUser(session.user);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUserProfile(null);
  };

  const updateLocalProfile = (partial: Partial<UserProfile>) => {
    setUserProfile((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  return (
    <AuthContext.Provider value={{ user: userProfile, loading, signInWithGoogle, signOut, updateLocalProfile }}>
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
