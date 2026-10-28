// web/src/lib/__tests__/whatsapp.test.ts
import { describe, it, expect, vi } from 'vitest';
import { chatLink, shareAppLink } from '../whatsapp';

describe('whatsapp utilities', () => {
  describe('chatLink', () => {
    it('returns correct WhatsApp link for valid 10-digit phone', () => {
      const result = chatLink('9876543210');
      expect(result).toBe('https://wa.me/919876543210');
    });

    it('strips non-digits from phone number', () => {
      const result = chatLink('987-654-3210');
      expect(result).toBe('https://wa.me/919876543210');
    });

    it('returns # for invalid phone (too short)', () => {
      const result = chatLink('12345');
      expect(result).toBe('#');
    });

    it('returns # for invalid phone (too long)', () => {
      const result = chatLink('98765432101');
      expect(result).toBe('#');
    });

    it('returns # for non-numeric phone', () => {
      const result = chatLink('abcdefghij');
      expect(result).toBe('#');
    });

    it('returns # for empty string', () => {
      const result = chatLink('');
      expect(result).toBe('#');
    });
  });

  describe('shareAppLink', () => {
    it('returns correct share link with current origin', () => {
      const originalOrigin = window.location.origin;
      
      // Mock window.location.origin
      vi.stubGlobal('location', { origin: 'https://example.com' });
      
      const result = shareAppLink();
      expect(result).toBe('https://wa.me/?text=Pool%20cabs%20with%20GatePool%3A%20https%3A%2F%2Fexample.com');
      
      // Restore
      vi.unstubAllGlobals();
    });
  });
});