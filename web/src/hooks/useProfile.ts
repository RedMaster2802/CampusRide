// web/src/hooks/useProfile.ts
// Profile hook with caching

import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api.getProfile(),
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });
}