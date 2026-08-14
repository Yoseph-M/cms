/**
 * Money Utility
 * 
 * Provides safe financial operations using integer minor units.
 * All monetary values are stored and calculated in minor units (e.g., cents)
 * to avoid floating-point precision issues.
 */

import { ValidationError } from './errors';

/**
 * Convert a major unit amount (e.g., 10.00) to minor units (e.g., 1000)
 */
export function toMinor(amountMajor: number, decimals: number = 2): number {
  if (isNaN(amountMajor)) {
    throw new ValidationError('Invalid amount', 'amount');
  }
  
  const multiplier = Math.pow(10, decimals);
  return Math.round(amountMajor * multiplier);
}

/**
 * Convert minor units to major unit amount
 */
export function toMajor(amountMinor: number, decimals: number = 2): number {
  if (isNaN(amountMinor)) {
    throw new ValidationError('Invalid amount', 'amount');
  }
  
  const divisor = Math.pow(10, decimals);
  return amountMinor / divisor;
}

/**
 * Parse a string amount and convert to minor units
 */
export function parseMinor(amountString: string, decimals: number = 2): number {
  const parsed = parseFloat(amountString);
  
  if (isNaN(parsed)) {
    throw new ValidationError('Invalid amount format', 'amount');
  }
  
  return toMinor(parsed, decimals);
}

/**
 * Add two minor amounts
 */
export function add(amountA: number, amountB: number): number {
  assertNonNegative(amountA, 'amountA');
  assertNonNegative(amountB, 'amountB');
  return amountA + amountB;
}

/**
 * Subtract two minor amounts (result cannot go negative)
 */
export function subtract(amountA: number, amountB: number): number {
  assertNonNegative(amountA, 'amountA');
  assertNonNegative(amountB, 'amountB');
  
  const result = amountA - amountB;
  if (result < 0) {
    throw new ValidationError('Result would be negative', 'amount');
  }
  
  return result;
}

/**
 * Multiply a minor amount by a factor (e.g., for tax calculation)
 */
export function multiply(amount: number, factor: number): number {
  assertNonNegative(amount, 'amount');
  
  if (isNaN(factor) || !isFinite(factor)) {
    throw new ValidationError('Invalid multiplier', 'factor');
  }
  
  return Math.round(amount * factor);
}

/**
 * Divide a minor amount (for equal split calculations)
 */
export function divide(amount: number, divisor: number): number {
  assertNonNegative(amount, 'amount');
  
  if (divisor === 0) {
    throw new ValidationError('Cannot divide by zero', 'divisor');
  }
  
  return Math.round(amount / divisor);
}

/**
 * Assert that an amount is positive (> 0)
 */
export function assertPositive(amount: number, fieldName: string = 'amount'): void {
  if (amount <= 0) {
    throw new ValidationError(`Amount must be positive`, fieldName);
  }
}

/**
 * Assert that an amount is non-negative (>= 0)
 */
export function assertNonNegative(amount: number, fieldName: string = 'amount'): void {
  if (amount < 0) {
    throw new ValidationError(`Amount cannot be negative`, fieldName);
  }
}

/**
 * Calculate the sum of an array of amounts
 */
export function sumAmounts(amounts: number[]): number {
  return amounts.reduce((total, amount) => add(total, amount), 0);
}

/**
 * Calculate percentage of amount
 */
export function percentage(amount: number, percent: number): number {
  assertNonNegative(amount, 'amount');
  
  if (isNaN(percent) || !isFinite(percent)) {
    throw new ValidationError('Invalid percentage', 'percent');
  }
  
  return Math.round(amount * (percent / 100));
}

/**
 * Format minor units as a display string
 */
export function formatMinor(amountMinor: number, decimals: number = 2, currency: string = ''): string {
  const amountMajor = toMajor(amountMinor, decimals);
  const formatted = amountMajor.toFixed(decimals);
  return currency ? `${currency} ${formatted}` : formatted;
}

/**
 * Check if amount A is less than amount B
 */
export function isLessThan(amountA: number, amountB: number): boolean {
  return amountA < amountB;
}

/**
 * Check if amount A is greater than amount B
 */
export function isGreaterThan(amountA: number, amountB: number): boolean {
  return amountA > amountB;
}

/**
 * Check if amount A equals amount B
 */
export function equals(amountA: number, amountB: number): boolean {
  return amountA === amountB;
}

/**
 * Get the minimum of two amounts
 */
export function min(amountA: number, amountB: number): number {
  return Math.min(amountA, amountB);
}

/**
 * Get the maximum of two amounts
 */
export function max(amountA: number, amountB: number): number {
  return Math.max(amountA, amountB);
}

/**
 * Clamp an amount between min and max
 */
export function clamp(amount: number, minAmount: number, maxAmount: number): number {
  return Math.max(minAmount, Math.min(amount, maxAmount));
}