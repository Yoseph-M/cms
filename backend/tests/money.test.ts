/**
 * Money Utility Tests
 * 
 * Tests for the money utility to ensure safe financial operations.
 * Amounts are stored as entered (ETB major units).
 */

import {
  toMinor,
  toMajor,
  parseMinor,
  add,
  subtract,
  multiply,
  divide,
  assertPositive,
  assertNonNegative,
  sumAmounts,
  percentage,
  formatMinor,
  isLessThan,
  isGreaterThan,
  equals,
  min,
  max,
  clamp,
} from '../src/utils/money';

describe('Money Utility', () => {
  describe('toMinor', () => {
    it('should return the amount unchanged (stored as entered)', () => {
      expect(toMinor(10.00)).toBe(10);
      expect(toMinor(10.50)).toBe(10.5);
      expect(toMinor(0.99)).toBe(0.99);
    });

    it('should handle zero', () => {
      expect(toMinor(0)).toBe(0);
    });

    it('should throw on NaN', () => {
      expect(() => toMinor(NaN)).toThrow();
    });
  });

  describe('toMajor', () => {
    it('should return the amount unchanged (stored as entered)', () => {
      expect(toMajor(1000)).toBe(1000);
      expect(toMajor(1050)).toBe(1050);
      expect(toMajor(99)).toBe(99);
    });

    it('should handle large numbers', () => {
      expect(toMajor(1000000)).toBe(1000000);
    });
  });

  describe('parseMinor', () => {
    it('should parse string to a number (ETB as entered)', () => {
      expect(parseMinor('10.00')).toBe(10);
      expect(parseMinor('10.50')).toBe(10.5);
    });

    it('should throw on invalid string', () => {
      expect(() => parseMinor('invalid')).toThrow();
    });
  });

  describe('add', () => {
    it('should add two amounts correctly', () => {
      expect(add(1000, 500)).toBe(1500);
    });

    it('should throw on negative amounts', () => {
      expect(() => add(-100, 500)).toThrow();
    });
  });

  describe('subtract', () => {
    it('should subtract amounts correctly', () => {
      expect(subtract(1000, 300)).toBe(700);
    });

    it('should throw on negative result', () => {
      expect(() => subtract(100, 500)).toThrow();
    });
  });

  describe('multiply', () => {
    it('should multiply amounts correctly', () => {
      expect(multiply(1000, 1.1)).toBe(1100); // 10% tax
    });

    it('should handle zero multiplier', () => {
      expect(multiply(1000, 0)).toBe(0);
    });
  });

  describe('divide', () => {
    it('should divide amounts correctly', () => {
      expect(divide(1000, 2)).toBe(500);
    });

    it('should throw on divide by zero', () => {
      expect(() => divide(1000, 0)).toThrow();
    });
  });

  describe('assertPositive', () => {
    it('should not throw for positive amounts', () => {
      expect(() => assertPositive(1)).not.toThrow();
      expect(() => assertPositive(100)).not.toThrow();
    });

    it('should throw for zero', () => {
      expect(() => assertPositive(0)).toThrow();
    });

    it('should throw for negative amounts', () => {
      expect(() => assertPositive(-1)).toThrow();
    });
  });

  describe('assertNonNegative', () => {
    it('should not throw for zero', () => {
      expect(() => assertNonNegative(0)).not.toThrow();
    });

    it('should throw for negative amounts', () => {
      expect(() => assertNonNegative(-1)).toThrow();
    });
  });

  describe('sumAmounts', () => {
    it('should sum array of amounts', () => {
      expect(sumAmounts([100, 200, 300])).toBe(600);
    });

    it('should handle empty array', () => {
      expect(sumAmounts([])).toBe(0);
    });
  });

  describe('percentage', () => {
    it('should calculate percentage correctly', () => {
      expect(percentage(1000, 10)).toBe(100);
      expect(percentage(1000, 15)).toBe(150);
    });

    it('should handle zero percent', () => {
      expect(percentage(1000, 0)).toBe(0);
    });
  });

  describe('formatMinor', () => {
    it('should format amounts for display', () => {
      expect(formatMinor(1000)).toBe('1000.00');
      expect(formatMinor(1050)).toBe('1050.00');
      expect(formatMinor(10.5)).toBe('10.50');
    });

    it('should include currency when provided', () => {
      expect(formatMinor(1000, 2, 'ETB')).toBe('ETB 1000.00');
    });
  });

  describe('comparison functions', () => {
    it('should compare amounts correctly', () => {
      expect(isLessThan(100, 200)).toBe(true);
      expect(isLessThan(200, 100)).toBe(false);
      expect(isGreaterThan(200, 100)).toBe(true);
      expect(equals(100, 100)).toBe(true);
      expect(equals(100, 200)).toBe(false);
    });
  });

  describe('min/max', () => {
    it('should return min/max correctly', () => {
      expect(min(100, 200)).toBe(100);
      expect(max(100, 200)).toBe(200);
    });
  });

  describe('clamp', () => {
    it('should clamp values within range', () => {
      expect(clamp(50, 0, 100)).toBe(50);
      expect(clamp(-10, 0, 100)).toBe(0);
      expect(clamp(150, 0, 100)).toBe(100);
    });
  });

  // Invariant tests - these are the critical ones for financial correctness
  describe('financial invariants', () => {
    it('should maintain invariant: sum(settlements) <= totalAmount', () => {
      const totalAmount = 100; // 100.00 ETB
      const settlements = [30, 20, 40]; // 30.00 + 20.00 + 40.00 = 90.00 ETB
      
      const sum = sumAmounts(settlements);
      expect(sum <= totalAmount).toBe(true);
    });

    it('should detect over-settlement attempt', () => {
      const totalAmount = 50; // 50.00 ETB
      const existingSettlements = [40]; // 40.00 ETB
      const newSettlement = 20; // 20.00 ETB attempt
      
      const existingSum = sumAmounts(existingSettlements);
      const wouldExceed = (existingSum + newSettlement) > totalAmount;
      
      expect(wouldExceed).toBe(true); // 40+20=60 > 50, should be rejected
    });

    it('should correctly calculate remaining amount', () => {
      const totalAmount = 100;
      const settlements = [30, 20];
      
      const totalSettled = sumAmounts(settlements);
      const remaining = subtract(totalAmount, totalSettled);
      
      expect(remaining).toBe(50); // 100 - 30 - 20 = 50
    });
  });
});