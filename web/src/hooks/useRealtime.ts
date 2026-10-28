// web/src/hooks/useRealtime.ts
// Realtime subscription to notifications table

import { useEffect, useRef } from 'react';
import { supabase } from '../api/supabase';

export function useRealtime(userId: string | undefined, poolId: string | undefined, onNotification: () => void) {
  const channelRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const isMock = import.meta.env.VITE_USE_MOCK === 'true';
    
    if (isMock) {
      const interval = setInterval(() => {
        onNotification();
      }, 3000);
      return () => clearInterval(interval);
    }

    const channel = supabase
      .channel('gatepool-user')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (_payload) => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            onNotification();
          }, 300);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, poolId, onNotification]);
}

export function useMockPolling(enabled: boolean, callback: () => void, interval = 3000) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(callback, interval);
    return () => clearInterval(id);
  }, [enabled, callback, interval]);
}