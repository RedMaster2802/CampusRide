// web/src/types/contract.ts
// COPIED VERBATIM FROM CONTRACT.md section 9 - DO NOT MODIFY

export type Place = 'SECTOR_128' | 'SECTOR_62' | 'OBS' | 'BOTANICAL_METRO';
export const PLACES: Place[] = ['SECTOR_128', 'SECTOR_62', 'OBS', 'BOTANICAL_METRO'];
export const PLACE_LABEL: Record<Place, string> = {
  SECTOR_128: 'Sector 128', SECTOR_62: 'Sector 62', OBS: 'OBS', BOTANICAL_METRO: 'Botanical metro',
};
export type TargetPref = '4' | '6' | 'ANY';
export type RequestStatus = 'SEARCHING' | 'MATCHED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED';
export type PoolStatus = 'OPEN' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface RideRequest {
  id: string; origin: Place; destination: Place; party_size: number; target: TargetPref;
  window_start: string; window_end: string; status: RequestStatus; created_at: string;
}
export interface Pool {
  id: string; origin: Place; destination: Place; capacity: 4 | 6; status: PoolStatus;
  window_start: string; window_end: string; meet_at: string | null;
  seats_taken: number; seats_left: number; booker_user_id: string | null;
  lock_at: string | null; fallback_at: string; fallback_min_seats: number;
  fare_total_inr: number; fare_per_seat_inr: number | null;
  fare_per_seat_if_full_inr: number | null; my_fare_inr: number | null;
  meeting_point_name: string;
}
export interface Member {
  user_id: string; full_name: string; seats: number; is_me: boolean;
  arrived: boolean; phone: string | null;
}
export interface ActiveRide { request: RideRequest; pool: Pool | null; members: Member[]; }
export interface HistoryItem {
  request_id: string; origin: Place; destination: Place; party_size: number; target: TargetPref;
  status: RequestStatus; window_start: string; window_end: string; created_at: string;
  pool_capacity: number | null; pool_seats_taken: number | null; meet_at: string | null;
}
export interface LiveStat { origin: Place; destination: Place; searching_people: number | null; open_pools: number | null; }