// web/src/lib/__tests__/time.test.ts
import { describe, it, expect } from 'vitest';
import { formatTime, formatDate, formatDateTime, formatCountdown, isToday, isTomorrow, parseLocalToIST, getISTNow } from '../time';

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
  });
});