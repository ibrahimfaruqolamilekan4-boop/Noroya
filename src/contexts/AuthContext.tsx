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
        const defaultProfile: UserProfile = {
          uid: sbUser.id,
          email: sbUser.email || '',
          fullName: sbProfile?.fullName || sbProfile?.full_name || sbUser.user_metadata?.fullName || sbUser.user_metadata?.full_name || 'User',
          balance: sbProfile?.balance ?? 0,
          role: sbProfile?.role || sbProfile?.user_role || (sbUser.email?.toLowerCase() === 'ibrahimfaruqolamilekan4@gmail.com' ? 'admin' : 'user'),
          referralCode: sbProfile?.referralCode || sbProfile?.referral_code || '',
          phoneNumber: sbProfile?.phoneNumber || sbProfile?.phone_number || '',
          transactionPin: sbProfile?.transactionPin || sbProfile?.transaction_pin || '',
          createdAt: sbProfile?.createdAt || sbProfile?.created_at || new Date().toISOString()
        };

        // Also keep listening to Firestore users collection in real-time as background fallback
        try {
          const userRef = doc(db, 'users', sbUser.id);
          unsubProfile = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              setUserProfile({
                ...defaultProfile,
                ...(docSnap.data() as Partial<UserProfile>)
              });
            } else {
              setUserProfile(defaultProfile);
            }
            setLoading(false);
          }, (error) => {
            console.warn("Firestore Profile Sync warning:", error);
            setUserProfile(defaultProfile);
            setLoading(false);
          });
        } catch (err) {
          console.warn("Could not setup Firestore sync, falling back to database query results:", err);
          setUserProfile(defaultProfile);
          setLoading(false);
        }
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
