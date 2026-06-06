import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
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

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      // If we have a local simulated user, we don't overwrite it with null
      const isSimulated = localStorage.getItem('vtu_simulated_user') !== null;

      if (firebaseUser) {
        // Clear any simulated user if a real Firebase user logs in
        localStorage.removeItem('vtu_simulated_user');
        
        // Sync profile from Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Use real-time listener for profile (especially balance)
        unsubProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            setUserProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Firestore Profile Sync Error:", error);
          setLoading(false);
        });
      } else {
        if (!isSimulated) {
          setUserProfile(null);
          setLoading(false);
        }
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, []);

  const signInWithGoogle = async () => {
    localStorage.removeItem('vtu_simulated_user');
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    localStorage.removeItem('vtu_simulated_user');
    await firebaseSignOut(auth);
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
