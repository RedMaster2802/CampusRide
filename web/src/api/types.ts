// web/src/api/types.ts
// API interface for both mock and real implementations

import type { ActiveRide, HistoryItem, LiveStat, Place, TargetPref } from '../types/contract';

export interface CreateRideRequestInput {
  p_origin: Place;
  p_destination: Place;
  p_party_size: number;
  p_target: TargetPref;
  p_window_start: string;
  p_window_end: string;
}

export interface ApiError extends Error {
  code: string;
  detail?: string;
}

export interface RideApi {
  // Auth
  sendOtp(email: string): Promise<{ error: ApiError | null }>;
  verifyOtp(email: string, token: string): Promise<{ error: ApiError | null }>;
  signOut(): Promise<void>;
  
  // Profile
  getProfile(): Promise<{ full_name: string; phone: string | null; share_phone: boolean } | null>;
  updateProfile(patch: { full_name?: string; phone?: string | null; share_phone?: boolean }): Promise<{ error: ApiError | null }>;
  
  // Config
  getConfig(): Promise<Record<string, unknown>>;
  
  // Ride operations
  createRideRequest(input: CreateRideRequestInput): Promise<ActiveRide>;
  getActiveRide(): Promise<ActiveRide | null>;
  cancelRideRequest(requestId: string): Promise<{ ok: boolean; strike_added: boolean }>;
  claimBooker(poolId: string): Promise<{ ok: boolean }>;
  markArrived(poolId: string, arrived?: boolean): Promise<{ ok: boolean }>;
  getRideHistory(limit?: number): Promise<HistoryItem[]>;
  getLiveStats(): Promise<LiveStat[]>;
}