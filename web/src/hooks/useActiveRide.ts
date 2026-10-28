// web/src/hooks/useActiveRide.ts
// Active ride hook with polling and realtime integration

import { useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { api } from '../api';
import type { ActiveRide } from '../types/contract';
import { useAuth } from './useAuth';
import { useRealtime } from './useRealtime';

const POLL_INTERVAL_SEARCHING = 15000; // 15s + jitter
const POLL_INTERVAL_MATCHED = 60000; // 60s + jitter
const MAX_POLL_INTERVAL = 120000; // 2 min max backoff

export function useActiveRide(options?: Partial<UseQueryOptions<ActiveRide | null>>) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pollInterval, setPollInterval] = useState(POLL_INTERVAL_SEARCHING);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  const query = useQuery<ActiveRide | null>({
    queryKey: ['activeRide'],
    queryFn: async () => {
      try {
        const ride = await api.getActiveRide();
        setConsecutiveErrors(0);
        // Reset interval on success
        if (ride?.pool?.status === 'CONFIRMED' || ride?.request?.status === 'MATCHED') {
          setPollInterval(POLL_INTERVAL_MATCHED);
        } else {
          setPollInterval(POLL_INTERVAL_SEARCHING);
        }
        return ride;
      } catch (error: any) {
        setConsecutiveErrors(c => c + 1);
        // Exponential backoff on error
        const newInterval = Math.min(pollInterval * 2, MAX_POLL_INTERVAL);
        setPollInterval(newInterval);
        throw error;
      }
    },
    enabled: !!user,
    refetchInterval: (query) => {
      if (!query.state.data) return false; // Don't poll if no active ride
      const ride = query.state.data;
      if (ride.request.status === 'EXPIRED' || ride.request.status === 'CANCELLED' || ride.request.status === 'COMPLETED') {
        return false;
      }
      // Add jitter
      return pollInterval + Math.random() * (ride.pool?.status === 'CONFIRMED' ? 10000 : 5000);
    },
    refetchOnWindowFocus: false,
    staleTime: 0,
    ...options,
  });

  // Realtime subscription - triggers refetch on notification
  useRealtime(user?.id, query.data?.pool?.id, () => {
    queryClient.invalidateQueries({ queryKey: ['activeRide'] });
  });

  // Stop polling when tab hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        queryClient.cancelQueries({ queryKey: ['activeRide'] });
      } else {
        // Refetch once when visible again with small delay
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['activeRide'] });
        }, Math.random() * 2000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [queryClient]);

  return query;
}

import { useState, useEffect } from 'react';