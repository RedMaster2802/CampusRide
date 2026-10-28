# GatePool RPC Reference

Generated from live backend. Update after `supabase db reset` and testing.

## create_ride_request

**Call:**
```javascript
supabase.rpc('create_ride_request', {
  p_origin: 'SECTOR_128',
  p_destination: 'OBS',
  p_party_size: 1,
  p_target: '4',
  p_window_start: '2026-10-29T10:00:00+05:30',
  p_window_end: '2026-10-29T10:30:00+05:30'
})
```

**Success Response (queued):**
```json
{
  "request": {
    "id": "uuid",
    "origin": "SECTOR_128",
    "destination": "OBS",
    "party_size": 1,
    "target": "4",
    "window_start": "2026-10-29T10:00:00+05:30",
    "window_end": "2026-10-29T10:30:00+05:30",
    "status": "SEARCHING",
    "created_at": "2026-10-29T09:55:00+05:30"
  },
  "pool": null,
  "members": []
}
```

**Success Response (matched to pool):**
```json
{
  "request": { ... },
  "pool": {
    "id": "uuid",
    "origin": "SECTOR_128",
    "destination": "OBS",
    "capacity": 4,
    "status": "OPEN",
    "window_start": "2026-10-29T10:00:00+05:30",
    "window_end": "2026-10-29T10:30:00+05:30",
    "meet_at": null,
    "seats_taken": 2,
    "seats_left": 2,
    "booker_user_id": null,
    "lock_at": null,
    "fallback_at": "2026-10-29T10:20:00+05:30",
    "fallback_min_seats": 3,
    "fare_total_inr": 0,
    "fare_per_seat_inr": null,
    "fare_per_seat_if_full_inr": null,
    "my_fare_inr": null,
    "meeting_point_name": "Gate 1"
  },
  "members": [
    { "user_id": "uuid", "full_name": "Alice", "seats": 1, "is_me": true, "arrived": false, "phone": "9876543210" },
    { "user_id": "uuid", "full_name": "Bob", "seats": 1, "is_me": false, "arrived": false, "phone": null }
  ]
}
```

**Error Responses:**
- `ERR_NOT_AUTHENTICATED` - No valid session
- `ERR_MAINTENANCE` - `maintenance_mode = true`
- `ERR_RATE_LIMITED` (detail: seconds) - Rate limit exceeded
- `ERR_BLOCKED` (detail: blocked_until ISO) - User blocked
- `ERR_PROFILE_INCOMPLETE` - Empty full_name
- `ERR_INVALID_ROUTE` - Origin = destination or null
- `ERR_INVALID_PARTY_SIZE` - Outside 1-3 (target 4) or 1-5 (target 6)
- `ERR_INVALID_WINDOW` - start >= end
- `ERR_WINDOW_IN_PAST` - end <= now
- `ERR_WINDOW_TOO_SHORT` - < min_window_minutes
- `ERR_WINDOW_TOO_LONG` - > max_window_minutes
- `ERR_TOO_FAR_AHEAD` - start > now + max_advance_minutes
- `ERR_ACTIVE_REQUEST_EXISTS` - User already has SEARCHING/MATCHED request

---

## get_active_ride

**Call:**
```javascript
supabase.rpc('get_active_ride', {})
```

**Response:** Same as `create_ride_request` success, or `null` if no active ride.

---

## cancel_ride_request

**Call:**
```javascript
supabase.rpc('cancel_ride_request', { p_request_id: 'uuid' })
```

**Success Response:**
```json
{ "ok": true, "strike_added": false }
```

**Error Responses:**
- `ERR_NOT_AUTHENTICATED`
- `ERR_RATE_LIMITED`
- `ERR_NOT_FOUND` - Request not found or not owned
- `ERR_BAD_STATE` - Request not in SEARCHING/MATCHED

---

## claim_booker

**Call:**
```javascript
supabase.rpc('claim_booker', { p_pool_id: 'uuid' })
```

**Success Response:**
```json
{ "ok": true }
```

**Error Responses:**
- `ERR_NOT_AUTHENTICATED`
- `ERR_RATE_LIMITED`
- `ERR_NOT_MEMBER` - Caller not in pool
- `ERR_BAD_STATE` - Pool not CONFIRMED
- `ERR_BOOKER_TAKEN` - Already claimed

---

## mark_arrived

**Call:**
```javascript
supabase.rpc('mark_arrived', { p_pool_id: 'uuid', p_arrived: true })
```

**Success Response:**
```json
{ "ok": true }
```

**Error Responses:**
- `ERR_NOT_AUTHENTICATED`
- `ERR_RATE_LIMITED`
- `ERR_NOT_MEMBER`
- `ERR_BAD_STATE` - Pool not CONFIRMED

---

## get_ride_history

**Call:**
```javascript
supabase.rpc('get_ride_history', { p_limit: 20 })
```

**Response:**
```json
[
  {
    "request_id": "uuid",
    "origin": "SECTOR_128",
    "destination": "OBS",
    "party_size": 1,
    "target": "4",
    "status": "COMPLETED",
    "window_start": "2026-10-29T10:00:00+05:30",
    "window_end": "2026-10-29T10:30:00+05:30",
    "created_at": "2026-10-29T09:55:00+05:30",
    "pool_capacity": 4,
    "pool_seats_taken": 4,
    "meet_at": "2026-10-29T10:05:00+05:30"
  }
]
```

---

## get_live_stats

**Call:**
```javascript
supabase.rpc('get_live_stats', {})
```

**Response (12 rows, one per route):**
```json
[
  { "origin": "SECTOR_128", "destination": "OBS", "searching_people": 5, "open_pools": 2 },
  { "origin": "SECTOR_128", "destination": "BOTANICAL_METRO", "searching_people": null, "open_pools": null },
  ...
]
```
Counts below `stats_min_count` (default 3) are `null`.

---

## Notification Types (for realtime)

Subscribe to `notifications` table filtered by `user_id`. On any INSERT, call `get_active_ride()` (debounced 300ms).

Types:
- `POOL_UPDATED` - Pool seats changed, member joined/left
- `POOL_CONFIRMED` - Pool reached capacity or fallback confirmed
- `POOL_EXPIRED` - Pool expired at fallback
- `BOOKER_CLAIMED` - Someone claimed booker role
- `STRIKE_ADDED` - User got a strike
- `BLOCKED` - User blocked (3 strikes)

Payload always includes `pool_id`.