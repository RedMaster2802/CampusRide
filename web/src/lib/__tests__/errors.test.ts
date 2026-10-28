// web/src/lib/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import { getErrorMessage, isRetryableError, isAuthError, type ApiError } from '../errors';

describe('error utilities', () => {
  const createError = (code: string, detail?: string): ApiError => {
    const err = new Error(code) as ApiError;
    err.code = code;
    err.detail = detail;
    return err;
  };

  describe('getErrorMessage', () => {
    it('returns correct message for ERR_BLOCKED', () => {
      const err = createError('ERR_BLOCKED', '2026-10-30T10:00:00+05:30');
      const msg = getErrorMessage(err);
      expect(msg).toContain('blocked');
      expect(msg).toContain('Oct');
    });

    it('returns correct message for ERR_PROFILE_INCOMPLETE', () => {
      const err = createError('ERR_PROFILE_INCOMPLETE');
      expect(getErrorMessage(err)).toBe('Please add your name first.');
    });

    it('returns correct message for ERR_ACTIVE_REQUEST_EXISTS', () => {
      const err = createError('ERR_ACTIVE_REQUEST_EXISTS');
      expect(getErrorMessage(err)).toBe('You already have an active request.');
    });

    it('returns correct message for ERR_INVALID_ROUTE', () => {
      const err = createError('ERR_INVALID_ROUTE');
      expect(getErrorMessage(err)).toBe('Pick two different places.');
    });

    it('returns correct message for ERR_INVALID_PARTY_SIZE', () => {
      const err = createError('ERR_INVALID_PARTY_SIZE');
      expect(getErrorMessage(err)).toBe('Group size is not allowed for this cab size.');
    });

    it('returns correct message for ERR_INVALID_WINDOW', () => {
      const err = createError('ERR_INVALID_WINDOW');
      expect(getErrorMessage(err)).toBe('Pick a valid time window in the future.');
    });

    it('returns correct message for ERR_WINDOW_IN_PAST', () => {
      const err = createError('ERR_WINDOW_IN_PAST');
      expect(getErrorMessage(err)).toBe('Pick a valid time window in the future.');
    });

    it('returns correct message for ERR_WINDOW_TOO_SHORT', () => {
      const err = createError('ERR_WINDOW_TOO_SHORT');
      expect(getErrorMessage(err)).toContain('30 minutes');
    });

    it('returns correct message for ERR_WINDOW_TOO_LONG', () => {
      const err = createError('ERR_WINDOW_TOO_LONG');
      expect(getErrorMessage(err)).toContain('3 hours');
    });

    it('returns correct message for ERR_TOO_FAR_AHEAD', () => {
      const err = createError('ERR_TOO_FAR_AHEAD');
      expect(getErrorMessage(err)).toBe('You can plan at most 24 hours ahead.');
    });

    it('returns correct message for ERR_BAD_STATE', () => {
      const err = createError('ERR_BAD_STATE');
      expect(getErrorMessage(err)).toBe('That ride changed. Refreshing.');
    });

    it('returns correct message for ERR_NOT_FOUND', () => {
      const err = createError('ERR_NOT_FOUND');
      expect(getErrorMessage(err)).toBe('That ride changed. Refreshing.');
    });

    it('returns correct message for ERR_BOOKER_TAKEN', () => {
      const err = createError('ERR_BOOKER_TAKEN');
      expect(getErrorMessage(err)).toBe('Someone else already claimed booking.');
    });

    it('returns correct message for ERR_NOT_MEMBER', () => {
      const err = createError('ERR_NOT_MEMBER');
      expect(getErrorMessage(err)).toBe('You are not part of this pool.');
    });

    it('returns empty string for ERR_NOT_AUTHENTICATED', () => {
      const err = createError('ERR_NOT_AUTHENTICATED');
      expect(getErrorMessage(err)).toBe('');
    });

    it('returns correct message for ERR_RATE_LIMITED', () => {
      const err = createError('ERR_RATE_LIMITED', '30');
      expect(getErrorMessage(err)).toBe("You're going too fast. Try again in 30 seconds.");
    });

    it('returns correct message for ERR_MAINTENANCE', () => {
      const err = createError('ERR_MAINTENANCE');
      expect(getErrorMessage(err)).toBe('GatePool is paused for maintenance. Please try again soon.');
    });

    it('returns default message for unknown codes', () => {
      const err = createError('UNKNOWN_CODE');
      expect(getErrorMessage(err)).toBe('Something went wrong. Try again.');
    });
  });

  describe('isRetryableError', () => {
    it('returns true for ERR_RATE_LIMITED', () => {
      expect(isRetryableError(createError('ERR_RATE_LIMITED'))).toBe(true);
    });

    it('returns true for ERR_BAD_STATE', () => {
      expect(isRetryableError(createError('ERR_BAD_STATE'))).toBe(true);
    });

    it('returns true for ERR_NOT_FOUND', () => {
      expect(isRetryableError(createError('ERR_NOT_FOUND'))).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isRetryableError(createError('ERR_INVALID_ROUTE'))).toBe(false);
    });
  });

  describe('isAuthError', () => {
    it('returns true for ERR_NOT_AUTHENTICATED', () => {
      expect(isAuthError(createError('ERR_NOT_AUTHENTICATED'))).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isAuthError(createError('ERR_INVALID_ROUTE'))).toBe(false);
    });
  });
});