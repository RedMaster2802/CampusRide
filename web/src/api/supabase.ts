// web/src/api/supabase.ts
// Real Supabase implementation

import { createClient } from '@supabase/supabase-js';
import type { RideApi, ApiError, CreateRideRequestInput, ActiveRide, HistoryItem, LiveStat } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

function mapError(error: any): ApiError {
  const err = new Error(error.message) as ApiError;
  err.code = error.message;
  err.detail = error.details;
  return err;
}

export const supabaseApi: RideApi = {
  // Auth
  async sendOtp(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });
    return { error: error ? mapError(error) : null };
  },

  async verifyOtp(email: string, token: string) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    return { error: error ? mapError(error) : null };
  },

  async signOut() {
    await supabase.auth.signOut({ scope: 'global' });
  },

  // Profile
  async getProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, phone, share_phone')
      .eq('id', user.id)
      .single();
    
    if (error) throw mapError(error);
    return data;
  },

  async updateProfile(patch) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw mapError({ message: 'ERR_NOT_AUTHENTICATED' });
    
    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', user.id);
    
    return { error: error ? mapError(error) : null };
  },

  // Config
  async getConfig() {
    const { data, error } = await supabase.from('app_config').select('key, value');
    if (error) throw mapError(error);
    return Object.fromEntries(data.map((row: any) => [row.key, row.value]));
  },

  // Ride operations
  async createRideRequest(input: CreateRideRequestInput) {
    const { data, error } = await supabase.rpc('create_ride_request', {
      p_origin: input.p_origin,
      p_destination: input.p_destination,
      p_party_size: input.p_party_size,
      p_target: input.p_target,
      p_window_start: input.p_window_start,
      p_window_end: input.p_window_end,
    });
    
    if (error) throw mapError(error);
    return data as ActiveRide;
  },

  async getActiveRide() {
    const { data, error } = await supabase.rpc('get_active_ride');
    if (error) throw mapError(error);
    return data as ActiveRide | null;
  },

  async cancelRideRequest(requestId: string) {
    const { data, error } = await supabase.rpc('cancel_ride_request', { p_request_id: requestId });
    if (error) throw mapError(error);
    return data as { ok: boolean; strike_added: boolean };
  },

  async claimBooker(poolId: string) {
    const { data, error } = await supabase.rpc('claim_booker', { p_pool_id: poolId });
    if (error) throw mapError(error);
    return data as { ok: boolean };
  },

  async markArrived(poolId: string, arrived = true) {
    const { data, error } = await supabase.rpc('mark_arrived', { p_pool_id: poolId, p_arrived: arrived });
    if (error) throw mapError(error);
    return data as { ok: boolean };
  },

  async getRideHistory(limit = 20) {
    const { data, error } = await supabase.rpc('get_ride_history', { p_limit: limit });
    if (error) throw mapError(error);
    return data as HistoryItem[];
  },

  async getLiveStats() {
    const { data, error } = await supabase.rpc('get_live_stats');
    if (error) throw mapError(error);
    return data as LiveStat[];
  },
};