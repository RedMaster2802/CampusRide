// web/src/api/index.ts
// Exports the appropriate API implementation based on VITE_USE_MOCK

import type { RideApi } from './types';
import { supabaseApi } from './supabase';

let apiPromise: Promise<RideApi> | null = null;

async function getApi(): Promise<RideApi> {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    if (!apiPromise) {
      apiPromise = import('./mock').then(m => m.mockApi);
    }
    return apiPromise;
  }
  return supabaseApi;
}

// Create a proxy that forwards calls to the actual API
export const api = new Proxy({} as RideApi, {
  get(_, prop) {
    return async (...args: any[]) => {
      const impl = await getApi();
      return (impl as any)[prop](...args);
    };
  },
});

export async function getMockDevTools() {
  if (import.meta.env.VITE_USE_MOCK !== 'true') return null;
  const { mockDevSetConfig, mockDevGetState } = await import('./mock');
  return { mockDevSetConfig, mockDevGetState };
}