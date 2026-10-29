// web/src/hooks/useRealtime.ts
// Realtime subscription to notifications table

import { useEffect, useRef } from 'react';
import { api } from '../api';

export function useRealtime(userId: string | undefined, poolId: string | undefined, onNotification: () => void) {
  const channelRef = useRef<{ unsubscribe: () => void } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(onNotification);
  const isMock = import.meta.env.VITE_USE_MOCK === 'true';

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    if (!userId) return;

    if (isMock) {
      // In mock mode, use polling
      const interval = setInterval(() => {
        callbackRef.current();
      }, 3000);
      return () => clearInterval(interval);
    }

    const subscription = api.subscribeToNotifications(userId, () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        callbackRef.current();
      }, 300);
    });

    channelRef.current = subscription;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [userId, isMock]);
}

export function useMockPolling(enabled: boolean, callback: () => void, interval = 3000) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(callback, interval);
    return () => clearInterval(id);
  }, [enabled, callback, interval]);
}