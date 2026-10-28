// web/src/lib/errors.ts
// Error code to user message mapping (CONTRACT section 6)

export interface ApiError extends Error {
  code: string;
  detail?: string;
}

function getConfigValue(key: string): number {
  // Fallback defaults matching CONTRACT.md
  const defaults: Record<string, number> = {
    min_window_minutes: 30,
    max_window_minutes: 180,
  };
  return defaults[key] ?? 0;
}

export function getErrorMessage(error: ApiError): string {
  const { code, detail } = error;
  
  switch (code) {
    case 'ERR_BLOCKED':
      return `You are blocked from new requests until ${detail ? formatIST(detail) : 'the block expires'}.`;
    
    case 'ERR_PROFILE_INCOMPLETE':
      return 'Please add your name first.';
    
    case 'ERR_ACTIVE_REQUEST_EXISTS':
      return 'You already have an active request.';
    
    case 'ERR_INVALID_ROUTE':
      return 'Pick two different places.';
    
    case 'ERR_INVALID_PARTY_SIZE':
      return 'Group size is not allowed for this cab size.';
    
    case 'ERR_INVALID_WINDOW':
    case 'ERR_WINDOW_IN_PAST':
      return 'Pick a valid time window in the future.';
    
    case 'ERR_WINDOW_TOO_SHORT':
      return `Window must be at least ${getConfigValue('min_window_minutes')} minutes.`;
    
    case 'ERR_WINDOW_TOO_LONG':
      return `Window can be at most ${Math.round(getConfigValue('max_window_minutes') / 60)} hours.`;
    
    case 'ERR_TOO_FAR_AHEAD':
      return 'You can plan at most 24 hours ahead.';
    
    case 'ERR_BAD_STATE':
    case 'ERR_NOT_FOUND':
      return 'That ride changed. Refreshing.';
    
    case 'ERR_BOOKER_TAKEN':
      return 'Someone else already claimed booking.';
    
    case 'ERR_NOT_MEMBER':
      return 'You are not part of this pool.';
    
    case 'ERR_NOT_AUTHENTICATED':
      return ''; // Handled by auth flow
    
    case 'ERR_RATE_LIMITED':
      return `You're going too fast. Try again in ${detail || 'a few'} seconds.`;
    
    case 'ERR_MAINTENANCE':
      return 'GatePool is paused for maintenance. Please try again soon.';
    
    default:
      return 'Something went wrong. Try again.';
  }
}

function formatIST(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function isRetryableError(error: ApiError): boolean {
  return ['ERR_RATE_LIMITED', 'ERR_BAD_STATE', 'ERR_NOT_FOUND'].includes(error.code);
}

export function isAuthError(error: ApiError): boolean {
  return error.code === 'ERR_NOT_AUTHENTICATED';
}