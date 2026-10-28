// web/src/api/mock.ts
// Mock implementation for development (follows CONTRACT v1.2 rules)

import type { RideApi, ApiError, CreateRideRequestInput, ActiveRide, HistoryItem, LiveStat, Place, TargetPref } from './types';
import { PLACES } from '../types/contract';

// In-memory state
const users = new Map<string, { 
  id: string; 
  email: string; 
  full_name: string; 
  phone: string | null; 
  share_phone: boolean;
  strikes: number;
  blocked_until: string | null;
}>();

const requests: Map<string, any> = new Map();
const pools: Map<string, any> = new Map();
const poolMembers: Map<string, any> = new Map();
const notifications: Map<string, any> = new Map();

let currentUserId: string | null = null;
let config = {
  min_window_minutes: 30,
  max_window_minutes: 180,
  max_advance_minutes: 1440,
  min_overlap_minutes: 15,
  fallback_lead_minutes: 10,
  fallback_min_seats_cap4: 3,
  fallback_min_seats_cap6: 4,
  lock_minutes_before_meet: 10,
  cancel_grace_minutes: 2,
  strike_block_threshold: 3,
  strike_block_days: 7,
  complete_after_minutes: 180,
  allowed_email_domain: 'xxxxxxxxx',
  meet_point_sector_128: 'Sector 128 Gate',
  meet_point_sector_62: 'Sector 62 Gate',
  meet_point_obs: 'OBS Main Gate',
  meet_point_botanical_metro: 'Botanical Metro Gate 1',
  matcher_batch_size: 100,
  rl_create_per_min: 5,
  rl_cancel_per_min: 5,
  rl_other_per_min: 30,
  maintenance_mode: false,
  stats_min_count: 3,
  history_retention_days: 90,
  audit_retention_days: 180,
};

function genId() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function addMinutes(date: string, minutes: number) { return new Date(new Date(date).getTime() + minutes * 60000).toISOString(); }

function mkError(code: string, detail?: string): ApiError {
  const err = new Error(code) as ApiError;
  err.code = code;
  err.detail = detail;
  return err;
}

function getMeetingPoint(origin: Place): string {
  const key = `meet_point_${origin.toLowerCase()}`;
  return config[key as keyof typeof config] as string;
}

function getFare(origin: Place, destination: Place, capacity: 4 | 6): number {
  // Mock fares for demo
  const fares: Record<string, { cap4: number; cap6: number }> = {
    'SECTOR_128>OBS': { cap4: 200, cap6: 300 },
    'SECTOR_128>BOTANICAL_METRO': { cap4: 250, cap6: 350 },
    'SECTOR_128>SECTOR_62': { cap4: 150, cap6: 220 },
    'SECTOR_62>SECTOR_128': { cap4: 150, cap6: 220 },
    'SECTOR_62>OBS': { cap4: 180, cap6: 270 },
    'SECTOR_62>BOTANICAL_METRO': { cap4: 220, cap6: 320 },
    'OBS>SECTOR_128': { cap4: 200, cap6: 300 },
    'OBS>SECTOR_62': { cap4: 180, cap6: 270 },
    'OBS>BOTANICAL_METRO': { cap4: 120, cap6: 180 },
    'BOTANICAL_METRO>SECTOR_128': { cap4: 250, cap6: 350 },
    'BOTANICAL_METRO>SECTOR_62': { cap4: 220, cap6: 320 },
    'BOTANICAL_METRO>OBS': { cap4: 120, cap6: 180 },
  };
  const key = `${origin}>${destination}`;
  return fares[key]?.[capacity === 4 ? 'cap4' : 'cap6'] || 0;
}

function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime());
  const end = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  return Math.max(0, (end - start) / 60000);
}

function recomputePool(poolId: string) {
  const pool = pools.get(poolId);
  if (!pool) return;
  
  const members = Array.from(poolMembers.values()).filter(m => m.pool_id === poolId && m.status === 'ACTIVE');
  const seatsTaken = members.reduce((sum, m) => sum + m.seats, 0);
  
  if (members.length === 0) {
    pool.status = 'CANCELLED';
    pool.cancel_reason = 'EMPTY';
    pool.booker_user_id = null;
    return;
  }
  
  const memberRequests = members.map(m => requests.get(m.request_id)).filter(Boolean);
  pool.window_start = memberRequests.reduce((max, r) => r.window_start > max ? r.window_start : max, memberRequests[0].window_start);
  pool.window_end = memberRequests.reduce((min, r) => r.window_end < min ? r.window_end : min, memberRequests[0].window_end);
  pool.seats_taken = seatsTaken;
  
  if (pool.booker_user_id && !members.some(m => m.user_id === pool.booker_user_id)) {
    pool.booker_user_id = null;
  }
}

function confirmPool(poolId: string, nowTime = now()) {
  const pool = pools.get(poolId);
  if (!pool) return;
  
  pool.status = 'CONFIRMED';
  pool.confirmed_at = nowTime;
  const meetAt = new Date(Math.min(
    new Date(pool.window_end).getTime(),
    Math.max(new Date(pool.window_start).getTime(), new Date(nowTime).getTime() + 10 * 60000)
  )).toISOString();
  pool.meet_at = meetAt;
  
  const members = Array.from(poolMembers.values()).filter(m => m.pool_id === poolId && m.status === 'ACTIVE');
  members.forEach(m => {
    const req = requests.get(m.request_id);
    if (req) req.status = 'MATCHED';
  });
}

function tryMatchRequest(requestId: string) {
  const req = requests.get(requestId);
  if (!req || req.status !== 'SEARCHING' || req.pool_id) return;
  
  // Find best candidate pool
  let bestPool: any = null;
  let bestSeatsLeft = Infinity;
  
  for (const pool of pools.values()) {
    if (pool.status !== 'OPEN') continue;
    if (pool.origin !== req.origin || pool.destination !== req.destination) continue;
    if (pool.seats_taken + req.party_size > pool.capacity) continue;
    if (req.target !== 'ANY' && pool.capacity !== parseInt(req.target)) continue;
    
    const overlap = overlapMinutes(pool.window_start, pool.window_end, req.window_start, req.window_end);
    if (overlap < config.min_overlap_minutes) continue;
    
    const seatsLeftAfter = pool.capacity - pool.seats_taken - req.party_size;
    if (seatsLeftAfter < bestSeatsLeft || (seatsLeftAfter === bestSeatsLeft && pool.created_at < bestPool?.created_at)) {
      bestPool = pool;
      bestSeatsLeft = seatsLeftAfter;
    }
  }
  
  if (bestPool) {
    // Join existing pool
    const memberId = genId();
    poolMembers.set(memberId, {
      id: memberId,
      pool_id: bestPool.id,
      request_id: req.id,
      user_id: req.user_id,
      seats: req.party_size,
      status: 'ACTIVE',
      arrived: false,
      joined_at: now(),
      left_at: null,
    });
    req.pool_id = bestPool.id;
    recomputePool(bestPool.id);
    
    if (bestPool.seats_taken === bestPool.capacity) {
      confirmPool(bestPool.id);
    }
  } else {
    // Create new pool
    const poolId = genId();
    const capacity = req.target === '6' ? 6 : 4;
    pools.set(poolId, {
      id: poolId,
      origin: req.origin,
      destination: req.destination,
      capacity,
      status: 'OPEN',
      window_start: req.window_start,
      window_end: req.window_end,
      meet_at: null,
      seats_taken: 0,
      booker_user_id: null,
      cancel_reason: null,
      created_at: now(),
      confirmed_at: null,
      completed_at: null,
    });
    
    const memberId = genId();
    poolMembers.set(memberId, {
      id: memberId,
      pool_id: poolId,
      request_id: req.id,
      user_id: req.user_id,
      seats: req.party_size,
      status: 'ACTIVE',
      arrived: false,
      joined_at: now(),
      left_at: null,
    });
    req.pool_id = poolId;
    recomputePool(poolId);
  }
}

function buildActiveRide(userId: string): ActiveRide | null {
  const userRequests = Array.from(requests.values())
    .filter(r => r.user_id === userId && (r.status === 'SEARCHING' || r.status === 'MATCHED' || (r.status === 'EXPIRED' && new Date(r.updated_at || r.created_at).getTime() > Date.now() - 30 * 60000)))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  
  if (userRequests.length === 0) return null;
  const req = userRequests[0];
  
  if (!req.pool_id) {
    return {
      request: {
        id: req.id, origin: req.origin, destination: req.destination,
        party_size: req.party_size, target: req.target,
        window_start: req.window_start, window_end: req.window_end,
        status: req.status, created_at: req.created_at,
      },
      pool: null,
      members: [],
    };
  }
  
  const pool = pools.get(req.pool_id);
  if (!pool) {
    return {
      request: { ...req },
      pool: null,
      members: [],
    };
  }
  
  const fareTotal = getFare(pool.origin, pool.destination, pool.capacity);
  const farePerSeat = fareTotal > 0 && pool.seats_taken > 0 ? Math.ceil(fareTotal / pool.seats_taken) : null;
  const farePerSeatIfFull = fareTotal > 0 ? Math.ceil(fareTotal / pool.capacity) : null;
  const myFare = farePerSeat ? farePerSeat * req.party_size : null;
  
  const members = Array.from(poolMembers.values())
    .filter(m => m.pool_id === pool.id && m.status === 'ACTIVE')
    .map(m => {
      const u = users.get(m.user_id);
      return {
        user_id: m.user_id,
        full_name: u?.full_name || 'Student',
        seats: m.seats,
        is_me: m.user_id === userId,
        arrived: m.arrived,
        phone: (m.user_id === userId || u?.share_phone) ? u?.phone || null : null,
      };
    });
  
  const fallbackAt = addMinutes(pool.window_end, -config.fallback_lead_minutes);
  const fallbackMinSeats = pool.capacity === 4 ? config.fallback_min_seats_cap4 : config.fallback_min_seats_cap6;
  const lockAt = pool.meet_at ? addMinutes(pool.meet_at, -config.lock_minutes_before_meet) : null;
  
  return {
    request: {
      id: req.id, origin: req.origin, destination: req.destination,
      party_size: req.party_size, target: req.target,
      window_start: req.window_start, window_end: req.window_end,
      status: req.status, created_at: req.created_at,
    },
    pool: {
      id: pool.id, origin: pool.origin, destination: pool.destination,
      capacity: pool.capacity, status: pool.status,
      window_start: pool.window_start, window_end: pool.window_end,
      meet_at: pool.meet_at,
      seats_taken: pool.seats_taken,
      seats_left: pool.capacity - pool.seats_taken,
      booker_user_id: pool.booker_user_id,
      lock_at: lockAt,
      fallback_at: fallbackAt,
      fallback_min_seats: fallbackMinSeats,
      fare_total_inr: fareTotal,
      fare_per_seat_inr: farePerSeat,
      fare_per_seat_if_full_inr: farePerSeatIfFull,
      my_fare_inr: myFare,
      meeting_point_name: getMeetingPoint(pool.origin),
    },
    members,
  };
}

export const mockApi: RideApi = {
  async sendOtp(email: string) {
    if (!email.endsWith('@' + config.allowed_email_domain) && config.allowed_email_domain !== 'xxxxxxxxx') {
      return { error: mkError('ERR_EMAIL_DOMAIN') };
    }
    // Simulate sending OTP
    return { error: null };
  },

  async verifyOtp(email: string, token: string) {
    if (token !== '123456') {
      return { error: mkError('ERR_INVALID_OTP', 'Invalid code') };
    }
    let user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      user = { id: genId(), email, full_name: '', phone: null, share_phone: false, strikes: 0, blocked_until: null };
      users.set(user.id, user);
    }
    currentUserId = user.id;
    return { error: null };
  },

  async signOut() {
    currentUserId = null;
  },

  async getProfile() {
    if (!currentUserId) return null;
    const u = users.get(currentUserId);
    if (!u) return null;
    return { full_name: u.full_name, phone: u.phone, share_phone: u.share_phone };
  },

  async updateProfile(patch) {
    if (!currentUserId) throw mkError('ERR_NOT_AUTHENTICATED');
    const u = users.get(currentUserId);
    if (!u) throw mkError('ERR_NOT_FOUND');
    Object.assign(u, patch);
    return { error: null };
  },

  async getConfig() {
    return { ...config };
  },

  async createRideRequest(input: CreateRideRequestInput) {
    if (!currentUserId) throw mkError('ERR_NOT_AUTHENTICATED');
    if (config.maintenance_mode) throw mkError('ERR_MAINTENANCE');
    
    const u = users.get(currentUserId);
    if (u?.blocked_until && new Date(u.blocked_until).getTime() > Date.now()) {
      throw mkError('ERR_BLOCKED', u.blocked_until);
    }
    if (!u?.full_name) throw mkError('ERR_PROFILE_INCOMPLETE');
    
    if (input.p_origin === input.p_destination) throw mkError('ERR_INVALID_ROUTE');
    
    const maxParty = input.p_target === '6' ? 5 : 3;
    if (input.p_party_size < 1 || input.p_party_size > maxParty) throw mkError('ERR_INVALID_PARTY_SIZE');
    
    const start = new Date(input.p_window_start);
    const end = new Date(input.p_window_end);
    const nowTime = new Date();
    
    if (start >= end) throw mkError('ERR_INVALID_WINDOW');
    if (end <= nowTime) throw mkError('ERR_WINDOW_IN_PAST');
    if ((end.getTime() - start.getTime()) / 60000 < config.min_window_minutes) throw mkError('ERR_WINDOW_TOO_SHORT');
    if ((end.getTime() - start.getTime()) / 60000 > config.max_window_minutes) throw mkError('ERR_WINDOW_TOO_LONG');
    if (start.getTime() > nowTime.getTime() + config.max_advance_minutes * 60000) throw mkError('ERR_TOO_FAR_AHEAD');
    
    // Check active request
    const active = Array.from(requests.values()).find(r => r.user_id === currentUserId && (r.status === 'SEARCHING' || r.status === 'MATCHED'));
    if (active) throw mkError('ERR_ACTIVE_REQUEST_EXISTS');
    
    const reqId = genId();
    const req = {
      id: reqId,
      user_id: currentUserId,
      origin: input.p_origin,
      destination: input.p_destination,
      party_size: input.p_party_size,
      target: input.p_target,
      window_start: input.p_window_start,
      window_end: input.p_window_end,
      status: 'SEARCHING',
      pool_id: null,
      created_at: now(),
      updated_at: now(),
    };
    requests.set(reqId, req);
    
    // Try to match immediately
    tryMatchRequest(reqId);
    
    return buildActiveRide(currentUserId)!;
  },

  async getActiveRide() {
    if (!currentUserId) throw mkError('ERR_NOT_AUTHENTICATED');
    return buildActiveRide(currentUserId);
  },

  async cancelRideRequest(requestId: string) {
    if (!currentUserId) throw mkError('ERR_NOT_AUTHENTICATED');
    
    const req = requests.get(requestId);
    if (!req || req.user_id !== currentUserId) throw mkError('ERR_NOT_FOUND');
    if (req.status !== 'SEARCHING' && req.status !== 'MATCHED') throw mkError('ERR_BAD_STATE');
    
    let strikeAdded = false;
    
    if (!req.pool_id) {
      req.status = 'CANCELLED';
      req.updated_at = now();
      return { ok: true, strike_added: false };
    }
    
    const pool = pools.get(req.pool_id);
    if (!pool) throw mkError('ERR_NOT_FOUND');
    
    const member = Array.from(poolMembers.values()).find(m => m.pool_id === pool.id && m.request_id === requestId);
    if (!member) throw mkError('ERR_NOT_MEMBER');
    
    // Check for strike
    if (pool.status === 'CONFIRMED' && pool.meet_at) {
      const lockAt = new Date(new Date(pool.meet_at).getTime() - config.lock_minutes_before_meet * 60000);
      const graceAt = new Date(new Date(pool.confirmed_at).getTime() + config.cancel_grace_minutes * 60000);
      if (new Date() > lockAt && new Date() > graceAt) {
        strikeAdded = true;
        u.strikes += 1;
        if (u.strikes >= config.strike_block_threshold) {
          u.blocked_until = addMinutes(now(), config.strike_block_days * 24 * 60);
          u.strikes = 0;
        }
      }
    }
    
    member.status = 'LEFT';
    member.left_at = now();
    member.arrived = false;
    req.status = 'CANCELLED';
    req.updated_at = now();
    
    recomputePool(pool.id);
    
    if (pool.status === 'CONFIRMED' && !strikeAdded) {
      pool.status = 'OPEN';
      pool.confirmed_at = null;
      pool.meet_at = null;
      // Remaining members back to SEARCHING
      Array.from(poolMembers.values())
        .filter(m => m.pool_id === pool.id && m.status === 'ACTIVE')
        .forEach(m => {
          const r = requests.get(m.request_id);
          if (r) r.status = 'SEARCHING';
        });
    }
    
    return { ok: true, strike_added: strikeAdded };
  },

  async claimBooker(poolId: string) {
    if (!currentUserId) throw mkError('ERR_NOT_AUTHENTICATED');
    const pool = pools.get(poolId);
    if (!pool) throw mkError('ERR_NOT_FOUND');
    if (pool.status !== 'CONFIRMED') throw mkError('ERR_BAD_STATE');
    
    const member = Array.from(poolMembers.values()).find(m => m.pool_id === poolId && m.user_id === currentUserId && m.status === 'ACTIVE');
    if (!member) throw mkError('ERR_NOT_MEMBER');
    if (pool.booker_user_id) throw mkError('ERR_BOOKER_TAKEN');
    
    pool.booker_user_id = currentUserId;
    return { ok: true };
  },

  async markArrived(poolId: string, arrived = true) {
    if (!currentUserId) throw mkError('ERR_NOT_AUTHENTICATED');
    const pool = pools.get(poolId);
    if (!pool) throw mkError('ERR_NOT_FOUND');
    if (pool.status !== 'CONFIRMED') throw mkError('ERR_BAD_STATE');
    
    const member = Array.from(poolMembers.values()).find(m => m.pool_id === poolId && m.user_id === currentUserId && m.status === 'ACTIVE');
    if (!member) throw mkError('ERR_NOT_MEMBER');
    
    member.arrived = arrived;
    return { ok: true };
  },

  async getRideHistory(limit = 20) {
    if (!currentUserId) throw mkError('ERR_NOT_AUTHENTICATED');
    
    return Array.from(requests.values())
      .filter(r => r.user_id === currentUserId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
      .map(r => {
        const pool = r.pool_id ? pools.get(r.pool_id) : null;
        return {
          request_id: r.id,
          origin: r.origin,
          destination: r.destination,
          party_size: r.party_size,
          target: r.target,
          status: r.status,
          window_start: r.window_start,
          window_end: r.window_end,
          created_at: r.created_at,
          pool_capacity: pool?.capacity || null,
          pool_seats_taken: pool?.seats_taken || null,
          meet_at: pool?.meet_at || null,
        };
      });
  },

  async getLiveStats() {
    const stats: LiveStat[] = [];
    for (const origin of PLACES) {
      for (const destination of PLACES) {
        if (origin === destination) continue;
        const searching = Array.from(requests.values())
          .filter(r => r.origin === origin && r.destination === destination && r.status === 'SEARCHING' && !r.pool_id)
          .reduce((sum, r) => sum + r.party_size, 0);
        const openPools = Array.from(pools.values())
          .filter(p => p.origin === origin && p.destination === destination && p.status === 'OPEN')
          .length;
        
        stats.push({
          origin,
          destination,
          searching_people: searching >= config.stats_min_count ? searching : null,
          open_pools: openPools >= config.stats_min_count ? openPools : null,
        });
      }
    }
    return stats;
  },
};

// Dev helpers (only in mock mode)
export function mockDevSetConfig(key: string, value: any) {
  (config as any)[key] = value;
}

export function mockDevGetState() {
  return { users, requests, pools, poolMembers, notifications, currentUserId, config };
}