// web/src/hooks/useAuth.ts
// Authentication hook

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { clearConfigCache } from '../lib/config';

interface User {
  id: string;
  email: string;
}

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
  const queryClient = useQueryClient();

  useEffect(() => {
    // Get initial session
    api.getSession().then(({ user }) => {
      setUser(user);
      setLoading(false);
    });

    // Listen for auth changes
    const { unsubscribe } = api.onAuthStateChange((user) => {
      setUser(user);
    });

    return () => unsubscribe();
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
    queryClient.clear();
    clearConfigCache();
    setUser(null);
  };

  const refreshUser = async () => {
    const { user } = await api.getSession();
    setUser(user);
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