// web/src/lib/time.ts
// IST formatters and countdown helpers

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Get the current instant as a Date. This is the real current time (UTC-based).
 * Use Intl.DateTimeFormat with timeZone 'Asia/Kolkata' when you need IST calendar fields.
 */
export function getISTNow(): Date {
  return new Date();
}

/**
 * Get the current IST date as YYYY-MM-DD string.
 */
export function getISTDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { 
    timeZone: IST_TIMEZONE, 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  return `${year}-${month}-${day}`;
}

/**
 * Get the current IST time as HH:mm string (24-hour).
 */
export function getISTTimeString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-IN', { 
    timeZone: IST_TIMEZONE, 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  }).formatToParts(date);
  const hour = parts.find(p => p.type === 'hour')?.value || '';
  const minute = parts.find(p => p.type === 'minute')?.value || '';
  return `${hour}:${minute}`;
}

export function formatTime(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options,
  });
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${formatDate(d)} at ${formatTime(d)}`;
}

export function formatCountdown(target: string | Date): string {
  const targetTime = typeof target === 'string' ? new Date(target).getTime() : target.getTime();
  const now = Date.now();
  const diff = targetTime - now;
  
  if (diff <= 0) return 'now';
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function isToday(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return getISTDateString(d) === getISTDateString();
}

export function isTomorrow(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const tomorrow = new Date(Date.now() + 86400000);
  return getISTDateString(d) === getISTDateString(tomorrow);
}

/**
 * Format a Date as ISO string with +05:30 offset (IST).
 * The input date is treated as an instant (UTC), and we format it with the IST offset.
 */
export function toISOWithOffset(date: Date): string {
  const offsetMinutes = 5.5 * 60; // IST is UTC+5:30
  const offsetMs = offsetMinutes * 60000;
  const istTime = new Date(date.getTime() + offsetMs);
  // Format as YYYY-MM-DDTHH:mm:ss.sss+05:30
  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istTime.getUTCDate()).padStart(2, '0');
  const hours = String(istTime.getUTCHours()).padStart(2, '0');
  const minutes = String(istTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istTime.getUTCSeconds()).padStart(2, '0');
  const ms = String(istTime.getUTCMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}+05:30`;
}

export function parseLocalToIST(dateStr: string, timeStr: string): string {
  // dateStr: YYYY-MM-DD, timeStr: HH:mm (in IST)
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  // Create date as if it were in IST, then convert to UTC
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  // Subtract 5.5 hours to get UTC
  const utc = new Date(date.getTime() - 5.5 * 3600000);
  return utc.toISOString();
}

/**
 * Parse a custom time window where end time may be earlier than start time (meaning next day).
 * Returns { start: ISOString, end: ISOString } or null if invalid.
 */
export function parseCustomWindow(
  dateStr: string, 
  startTimeStr: string, 
  endTimeStr: string,
  maxWindowMinutes: number
): { start: string; end: string } | null {
  const start = parseLocalToIST(dateStr, startTimeStr);
  const end = parseLocalToIST(dateStr, endTimeStr);
  
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  
  // Compare time strings to determine if end is on the next day
  // '02:00' < '22:00' lexicographically for 24-hour format
  const isNextDay = endTimeStr < startTimeStr;
  
  let diff = (endMs - startMs) / 60000;
  
  // If end is earlier than start (next day), add 24 hours
  if (isNextDay) {
    diff += 24 * 60;
  }
  
  // Check if within max window
  if (diff > maxWindowMinutes || diff < 0) {
    return null;
  }
  
  // If end was earlier, add 24 hours to end
  let finalEnd = end;
  if (isNextDay) {
    finalEnd = new Date(new Date(end).getTime() + 24 * 3600000).toISOString();
  }
  
  return { start, end: finalEnd };
}