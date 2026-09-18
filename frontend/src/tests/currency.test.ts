import { describe, expect, it } from 'vitest';
import { formatCurrency, formatCurrencyCompact } from '../utils/currency';

describe('formatCurrency', () => {
  it('renders grouped amounts with no cents', () => {
    expect(formatCurrency(1234.5)).toBe('1,235 ETB');
    expect(formatCurrency(1200)).toBe('1,200 ETB');
    expect(formatCurrency(0)).toBe('0 ETB');
  });
});

describe('formatCurrencyCompact', () => {
  it('keeps small amounts whole', () => {
    expect(formatCurrencyCompact(450)).toBe('450 ETB');
  });

  it('shortens thousands', () => {
    expect(formatCurrencyCompact(1234)).toBe('1.2k ETB');
    expect(formatCurrencyCompact(9500)).toBe('9.5k ETB');
    expect(formatCurrencyCompact(9999)).toBe('10k ETB');
    expect(formatCurrencyCompact(12500)).toBe('13k ETB');
  });

  it('shortens millions', () => {
    expect(formatCurrencyCompact(2_450_000)).toBe('2.5M ETB');
  });
});
