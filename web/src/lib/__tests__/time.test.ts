// web/src/lib/__tests__/time.test.ts
import { describe, it, expect, vi } from 'vitest';
import { formatTime, formatDate, formatDateTime, formatCountdown, isToday, isTomorrow, parseLocalToIST, getISTNow, getISTDateString, toISOWithOffset, parseCustomWindow } from '../time';

describe('time utilities', () => {
  describe('formatTime', () => {
    it('formats ISO string to IST time', () => {
      const iso = '2026-10-29T10:30:00+05:30';
      const result = formatTime(iso);
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it('formats Date object to IST time', () => {
      const date = new Date('2026-10-29T10:30:00+05:30');
      const result = formatTime(date);
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('formatDate', () => {
    it('formats ISO string to IST date', () => {
      const iso = '2026-10-29T10:30:00+05:30';
      const result = formatDate(iso);
      expect(result).toMatch(/\d{2} \w{3} \d{4}/);
    });
  });

  describe('formatDateTime', () => {
    it('combines date and time', () => {
      const iso = '2026-10-29T10:30:00+05:30';
      const result = formatDateTime(iso);
      expect(result).toContain(' at ');
    });
  });

  describe('formatCountdown', () => {
    it('returns "now" for past dates', () => {
      const past = new Date(Date.now() - 10000).toISOString();
      expect(formatCountdown(past)).toBe('now');
    });

    it('returns minutes for future dates within an hour', () => {
      const future = new Date(Date.now() + 30 * 60000).toISOString();
      const result = formatCountdown(future);
      expect(result).toMatch(/\d+m/);
    });

    it('returns hours for future dates within a day', () => {
      const future = new Date(Date.now() + 2 * 3600000).toISOString();
      const result = formatCountdown(future);
      expect(result).toMatch(/\d+h \d+m/);
    });

    it('returns days for future dates beyond a day', () => {
      const future = new Date(Date.now() + 2 * 86400000).toISOString();
      const result = formatCountdown(future);
      expect(result).toMatch(/\d+d \d+h/);
    });
  });

  describe('isToday', () => {
    it('returns true for today in IST', () => {
      const today = new Date().toISOString();
      expect(isToday(today)).toBe(true);
    });

    it('returns false for tomorrow in IST', () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      expect(isToday(tomorrow)).toBe(false);
    });
  });

  describe('isTomorrow', () => {
    it('returns true for tomorrow in IST', () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      expect(isTomorrow(tomorrow)).toBe(true);
    });

    it('returns false for today in IST', () => {
      const today = new Date().toISOString();
      expect(isTomorrow(today)).toBe(false);
    });
  });

  describe('parseLocalToIST', () => {
    it('converts local date and time to ISO', () => {
      const result = parseLocalToIST('2026-10-29', '10:30');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('getISTNow', () => {
    it('returns a Date object', () => {
      const result = getISTNow();
      expect(result).toBeInstanceOf(Date);
    });

    it('returns the actual current instant (not shifted)', () => {
      const before = Date.now();
      const result = getISTNow();
      const after = Date.now();
      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('getISTDateString', () => {
    it('returns YYYY-MM-DD in IST', () => {
      // 2026-10-29T00:00:00Z is 2026-10-29T05:30:00+05:30 (IST)
      const date = new Date('2026-10-29T00:00:00Z');
      expect(getISTDateString(date)).toBe('2026-10-29');
    });

    it('handles IST midnight edge case (00:00 IST = 18:30 UTC previous day)', () => {
      // 2026-10-28T18:30:00Z is 2026-10-29T00:00:00+05:30 (IST midnight)
      const date = new Date('2026-10-28T18:30:00Z');
      expect(getISTDateString(date)).toBe('2026-10-29');
    });

    it('returns correct date in non-IST timezone (simulated via UTC)', () => {
      // In a browser with non-IST timezone, the UTC instant should still map to correct IST date
      // 2026-10-29T12:00:00Z = 2026-10-29T17:30:00+05:30
      const date = new Date('2026-10-29T12:00:00Z');
      expect(getISTDateString(date)).toBe('2026-10-29');
    });
  });

  describe('toISOWithOffset', () => {
    it('formats Date as ISO with +05:30 offset', () => {
      // 2026-10-29T10:30:00Z = 2026-10-29T16:00:00+05:30
      const date = new Date('2026-10-29T10:30:00Z');
      const result = toISOWithOffset(date);
      expect(result).toBe('2026-10-29T16:00:00.000+05:30');
    });

    it('does not apply offset twice', () => {
      const date = new Date('2026-10-29T10:30:00Z');
      const result = toISOWithOffset(date);
      // Should be exactly 5.5 hours ahead of UTC
      const parsed = new Date(result);
      expect(parsed.getTime()).toBe(date.getTime());
    });
  });

  describe('parseCustomWindow', () => {
    it('parses normal window (end after start)', () => {
      const result = parseCustomWindow('2026-10-29', '10:00', '12:00', 180);
      expect(result).not.toBeNull();
      expect(result!.start).toMatch(/2026-10-29T04:30:00/); // 10:00 IST = 04:30 UTC
      expect(result!.end).toMatch(/2026-10-29T06:30:00/);   // 12:00 IST = 06:30 UTC
    });

    it('parses window crossing midnight (end earlier than start)', () => {
      const result = parseCustomWindow('2026-10-29', '22:00', '00:30', 180); // 2.5 hours
      expect(result).not.toBeNull();
      expect(result!.start).toMatch(/2026-10-29T16:30:00/); // 22:00 IST = 16:30 UTC
      expect(result!.end).toMatch(/2026-10-29T19:00:00/);   // 00:30 IST next day = 19:00 UTC (same UTC day)
    });

    it('rejects window exceeding maxWindowMinutes', () => {
      const result = parseCustomWindow('2026-10-29', '10:00', '14:00', 180); // 4 hours = 240 min
      expect(result).toBeNull();
    });

    it('accepts window exactly at maxWindowMinutes', () => {
      const result = parseCustomWindow('2026-10-29', '10:00', '13:00', 180); // 3 hours = 180 min
      expect(result).not.toBeNull();
    });

    it('handles IST midnight edge case for crossing midnight', () => {
      // Start at 23:30 IST, end at 00:30 IST next day (1 hour window)
      const result = parseCustomWindow('2026-10-29', '23:30', '00:30', 180);
      expect(result).not.toBeNull();
      const diff = (new Date(result!.end).getTime() - new Date(result!.start).getTime()) / 60000;
      expect(diff).toBe(60);
    });
  });
});