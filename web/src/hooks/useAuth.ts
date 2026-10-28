// web/src/hooks/useAuth.ts
// Authentication hook

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '../api';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string) => Promise<{ error: any }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    api.supabase?.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = api.supabase?.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string) => {
    return api.sendOtp(email);
  };

  const verifyOtp = async (email: string, token: string) => {
    const result = await api.verifyOtp(email, token);
    if (!result.error) {
      await refreshUser();
    }
    return result;
  };

  const signOut = async () => {
    await api.signOut();
    setUser(null);
  };

  const refreshUser = async () => {
    const { data: { session } } = await api.supabase?.auth.getSession();
    setUser(session?.user || null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, verifyOtp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}