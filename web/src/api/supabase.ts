// web/src/api/supabase.ts
// Real Supabase implementation

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RideApi, ApiError, CreateRideRequestInput, ActiveRide, HistoryItem, LiveStat } from './types';

let _supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }
    
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

function mapError(error: any): ApiError {
  const err = new Error(error.message) as ApiError;
  err.code = error.message;
  err.detail = error.details;
  return err;
}

export const supabaseApi: RideApi = {
  // Auth
  async sendOtp(email: string) {
    const { error } = await getSupabaseClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });
    return { error: error ? mapError(error) : null };
  },

  async verifyOtp(email: string, token: string) {
    const { error } = await getSupabaseClient().auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    return { error: error ? mapError(error) : null };
  },

  async signOut() {
    await getSupabaseClient().auth.signOut({ scope: 'global' });
  },

  async getSession() {
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    if (!session?.user) return { user: null };
    return { user: { id: session.user.id, email: session.user.email || '' } };
  },

  onAuthStateChange(callback: (user: { id: string; email: string } | null) => void) {
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        callback({ id: session.user.id, email: session.user.email || '' });
      } else {
        callback(null);
      }
    });
    return { unsubscribe: () => subscription.unsubscribe() };
  },

  // Realtime
  subscribeToNotifications(userId: string, callback: () => void) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = getSupabaseClient()
      .channel(`gatepool-user-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            callback();
          }, 300);
        }
      )
      .subscribe();
    
    return { unsubscribe: () => getSupabaseClient().removeChannel(channel) };
  },

  // Profile
  async getProfile() {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) return null;
    
    const { data, error } = await getSupabaseClient()
      .from('profiles')
      .select('full_name, phone, share_phone')
      .eq('id', user.id)
      .single();
    
    if (error) throw mapError(error);
    return data;
  },

  async updateProfile(patch) {
    const { data: { user } } = await getSupabaseClient().auth.getUser();
    if (!user) throw mapError({ message: 'ERR_NOT_AUTHENTICATED' });
    
    const { error } = await getSupabaseClient()
      .from('profiles')
      .update(patch)
      .eq('id', user.id);
    
    return { error: error ? mapError(error) : null };
  },

  // Config
  async getConfig() {
    const { data, error } = await getSupabaseClient().from('app_config').select('key, value');
    if (error) throw mapError(error);
    return Object.fromEntries(data.map((row: any) => [row.key, row.value]));
  },

  // Ride operations
  async createRideRequest(input: CreateRideRequestInput) {
    const { data, error } = await getSupabaseClient().rpc('create_ride_request', {
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
    const { data, error } = await getSupabaseClient().rpc('get_active_ride');
    if (error) throw mapError(error);
    return data as ActiveRide | null;
  },

  async cancelRideRequest(requestId: string) {
    const { data, error } = await getSupabaseClient().rpc('cancel_ride_request', { p_request_id: requestId });
    if (error) throw mapError(error);
    return data as { ok: boolean; strike_added: boolean };
  },

  async claimBooker(poolId: string) {
    const { data, error } = await getSupabaseClient().rpc('claim_booker', { p_pool_id: poolId });
    if (error) throw mapError(error);
    return data as { ok: boolean };
  },

  async markArrived(poolId: string, arrived = true) {
    const { data, error } = await getSupabaseClient().rpc('mark_arrived', { p_pool_id: poolId, p_arrived: arrived });
    if (error) throw mapError(error);
    return data as { ok: boolean };
  },

  async getRideHistory(limit = 20) {
    const { data, error } = await getSupabaseClient().rpc('get_ride_history', { p_limit: limit });
    if (error) throw mapError(error);
    return data as HistoryItem[];
  },

  async getLiveStats() {
    const { data, error } = await getSupabaseClient().rpc('get_live_stats');
    if (error) throw mapError(error);
    return data as LiveStat[];
  },
};