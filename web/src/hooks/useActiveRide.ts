// web/src/hooks/useActiveRide.ts
// Active ride hook with polling and realtime integration

import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '../api';
import type { ActiveRide } from '../types/contract';
import { useAuth } from './useAuth';
import { useRealtime } from './useRealtime';

const POLL_INTERVAL_SEARCHING = 15000;
const POLL_INTERVAL_MATCHED = 60000;
const MAX_POLL_INTERVAL = 120000;

export function useActiveRide(options?: Partial<UseQueryOptions<ActiveRide | null>>) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pollInterval, setPollInterval] = useState(POLL_INTERVAL_SEARCHING);

  const query = useQuery<ActiveRide | null>({
    queryKey: ['activeRide'],
    queryFn: async () => {
      try {
        const ride = await api.getActiveRide();
        if (ride?.pool?.status === 'CONFIRMED' || ride?.request?.status === 'MATCHED') {
          setPollInterval(POLL_INTERVAL_MATCHED);
        } else {
          setPollInterval(POLL_INTERVAL_SEARCHING);
        }
        return ride;
      } catch (error: any) {
        const newInterval = Math.min(pollInterval * 2, MAX_POLL_INTERVAL);
        setPollInterval(newInterval);
        throw error;
      }
    },
    enabled: !!user,
    refetchInterval: (query) => {
      if (!query.state.data) return POLL_INTERVAL_SEARCHING;
      const ride = query.state.data;
      if (ride.request.status === 'EXPIRED' || ride.request.status === 'CANCELLED' || ride.request.status === 'COMPLETED') {
        return false;
      }
      return pollInterval + Math.random() * (ride.pool?.status === 'CONFIRMED' ? 10000 : 5000);
    },
    refetchOnWindowFocus: false,
    staleTime: 0,
    ...options,
  });

  useRealtime(user?.id, query.data?.pool?.id, () => {
    queryClient.invalidateQueries({ queryKey: ['activeRide'] });
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        queryClient.cancelQueries({ queryKey: ['activeRide'] });
      } else {
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