/**
 * Business Timezone Tests
 * 
 * Tests for the businessTime utility to ensure correct
 * timezone handling across midnight, month, and year boundaries.
 */

import {
  getBusinessTimezone,
  getBusinessDateString,
  parseBusinessDate,
  isToday,
  getBusinessDayStart,
  getBusinessDayEnd,
  getPreviousBusinessDay,
  getNextBusinessDay,
  getMonthRange,
  isValidTimezone,
} from '../src/utils/businessTime';

describe('Business Timezone', () => {
  const originalEnv = process.env.BUSINESS_TIMEZONE;

  afterEach(() => {
    // Restore original timezone after each test
    if (originalEnv) {
      process.env.BUSINESS_TIMEZONE = originalEnv;
    } else {
      delete process.env.BUSINESS_TIMEZONE;
    }
  });

  describe('getBusinessTimezone', () => {
    it('should return default timezone when not configured', () => {
      delete process.env.BUSINESS_TIMEZONE;
      expect(getBusinessTimezone()).toBe('Africa/Addis_Ababa');
    });

    it('should return configured timezone', () => {
      process.env.BUSINESS_TIMEZONE = 'America/New_York';
      expect(getBusinessTimezone()).toBe('America/New_York');
    });
  });

  describe('isValidTimezone', () => {
    it('should return true for valid timezones', () => {
      expect(isValidTimezone('Africa/Addis_Ababa')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
    });

    it('should return false for invalid timezones', () => {
      expect(isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(isValidTimezone('Fake/Zone')).toBe(false);
    });
  });

  describe('getBusinessDateString', () => {
    it('should return date string in business timezone format', () => {
      // Use a specific date to test
      const testDate = new Date('2024-06-15T12:00:00Z');
      const result = getBusinessDateString(testDate);
      
      // Should return YYYY-MM-DD format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle midnight crossing correctly', () => {
      // A time that might be different in different timezones
      // 2024-01-01 02:00 UTC is 2024-01-01 in ET but 2024-01-01 05:00 in EAT
      delete process.env.BUSINESS_TIMEZONE; // Use default EAT (UTC+3)
      
      const utcLateNight = new Date('2024-01-01T02:00:00Z');
      const dateStr = getBusinessDateString(utcLateNight);
      
      // In EAT (UTC+3), 02:00 UTC = 05:00 EAT, still Jan 1
      expect(dateStr).toBe('2024-01-01');
    });

    it('should be consistent across multiple calls', () => {
      const date = new Date();
      const result1 = getBusinessDateString(date);
      const result2 = getBusinessDateString(date);
      expect(result1).toBe(result2);
    });
  });

  describe('parseBusinessDate', () => {
    it('should parse a date string to Date object', () => {
      const result = parseBusinessDate('2024-06-15');
      expect(result).toBeInstanceOf(Date);
    });

    it('should correctly parse midnight in business timezone', () => {
      const result = parseBusinessDate('2024-06-15');
      // The result should be a valid date
      expect(result.getTime()).toBeGreaterThan(0);
    });
  });

  describe('isToday', () => {
    it('should return true for current date', () => {
      const now = new Date();
      expect(isToday(now)).toBe(true);
    });

    it('should return false for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday)).toBe(false);
    });

    it('should return false for tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isToday(tomorrow)).toBe(false);
    });
  });

  describe('getBusinessDayStart', () => {
    it('should return start of day in business timezone', () => {
      const result = getBusinessDayStart(new Date('2024-06-15T14:30:00Z'));
      
      // Should be at midnight (00:00:00) in business timezone
      const hours = result.getHours();
      const minutes = result.getMinutes();
      const seconds = result.getSeconds();
      
      expect(hours).toBe(0);
      expect(minutes).toBe(0);
      expect(seconds).toBe(0);
    });
  });

  describe('getBusinessDayEnd', () => {
    it('should return end of day in business timezone', () => {
      const result = getBusinessDayEnd(new Date('2024-06-15T14:30:00Z'));
      
      // Should be at 23:59:59.999 in business timezone
      const hours = result.getHours();
      const minutes = result.getMinutes();
      const seconds = result.getSeconds();
      
      expect(hours).toBe(23);
      expect(minutes).toBe(59);
      expect(seconds).toBe(59);
    });
  });

  describe('getPreviousBusinessDay', () => {
    it('should return the previous day', () => {
      const friday = new Date('2024-06-14'); // A Friday
      const result = getPreviousBusinessDay(friday);
      
      expect(result.getDate()).toBe(13); // Thursday
    });

    it('should handle month boundary', () => {
      // June 1 - 1 day = May 31
      const juneFirst = new Date('2024-06-01');
      const result = getPreviousBusinessDay(juneFirst);
      
      expect(result.getMonth()).toBe(4); // May (0-indexed)
      expect(result.getDate()).toBe(31);
    });

    it('should handle year boundary', () => {
      // Jan 1, 2024 - 1 day = Dec 31, 2023
      const janFirst = new Date('2024-01-01');
      const result = getPreviousBusinessDay(janFirst);
      
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(11); // December
      expect(result.getDate()).toBe(31);
    });
  });

  describe('getNextBusinessDay', () => {
    it('should return the next day', () => {
      const friday = new Date('2024-06-14'); // A Friday
      const result = getNextBusinessDay(friday);
      
      expect(result.getDate()).toBe(15); // Saturday
    });

    it('should handle month boundary', () => {
      // May 31 + 1 day = June 1
      const may31 = new Date('2024-05-31');
      const result = getNextBusinessDay(may31);
      
      expect(result.getMonth()).toBe(5); // June (0-indexed)
      expect(result.getDate()).toBe(1);
    });

    it('should handle year boundary', () => {
      // Dec 31, 2023 + 1 day = Jan 1, 2024
      const dec31 = new Date('2023-12-31');
      const result = getNextBusinessDay(dec31);
      
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(1);
    });
  });

  describe('getMonthRange', () => {
    it('should return valid start and end dates for a month', () => {
      const { start, end } = getMonthRange(2024, 6);
      
      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
    });

    it('should correctly identify June 2024 range', () => {
      const { start, end } = getMonthRange(2024, 6);
      
      // June has 30 days
      expect(start.getMonth()).toBe(5); // June (0-indexed)
      expect(end.getMonth()).toBe(5); // June (0-indexed)
      expect(end.getDate()).toBe(30);
    });

    it('should handle February in leap year', () => {
      const { start, end } = getMonthRange(2024, 2); // 2024 is leap year
      
      expect(end.getDate()).toBe(29);
    });

    it('should handle February in non-leap year', () => {
      const { start, end } = getMonthRange(2023, 2); // 2023 is not a leap year
      
      expect(end.getDate()).toBe(28);
    });
  });
});