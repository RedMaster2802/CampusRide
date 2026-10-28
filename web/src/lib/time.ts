// web/src/lib/time.ts
// IST formatters and countdown helpers

const IST_TIMEZONE = 'Asia/Kolkata';

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
  const today = new Date();
  return d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE }) === 
         today.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
}

export function isTomorrow(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const tomorrow = new Date(Date.now() + 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE }) === 
         tomorrow.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
}

export function toISOWithOffset(date: Date): string {
  // Convert to IST and format as ISO with +05:30 offset
  const istTime = new Date(date.toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
  const offset = 5.5 * 60; // IST is UTC+5:30
  const localTime = new Date(istTime.getTime() + offset * 60000);
  return localTime.toISOString().replace('Z', '+05:30');
}

export function parseLocalToIST(dateStr: string, timeStr: string): string {
  // dateStr: YYYY-MM-DD, timeStr: HH:mm (in IST)
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  // Subtract 5.5 hours to get UTC, then format as ISO
  const utc = new Date(date.getTime() - 5.5 * 3600000);
  return utc.toISOString();
}

export function getISTNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
}