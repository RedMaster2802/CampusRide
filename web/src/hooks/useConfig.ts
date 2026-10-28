// web/src/hooks/useConfig.ts
// Config hook with caching

import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 3,
  });
}