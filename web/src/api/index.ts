// web/src/api/index.ts
// Exports the appropriate API implementation based on VITE_USE_MOCK

import type { RideApi } from './types';
import { supabaseApi } from './supabase';
import { mockApi } from './mock';

const useMock = import.meta.env.VITE_USE_MOCK === 'true';

export const api: RideApi = useMock ? mockApi : supabaseApi;

export { mockDevSetConfig, mockDevGetState } from './mock';