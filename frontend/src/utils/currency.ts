/**
 * Centralized currency formatting for CafeFlow.
 * Amounts are stored as entered (major units / ETB with decimals).
 * Renders as: "1,234.50 ETB"
 */
export function formatCurrency(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${formatted} ETB`;
}

/**
 * Short currency label for chart axes and other tight spaces.
 * Renders as: "1.2k ETB", "3.4M ETB", "450 ETB" — keeps tick labels from
 * wrapping or being clipped on narrow y-axes.
 */
export function formatCurrencyCompact(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ETB`;
  if (abs >= 1_000) {
    const scaled = n / 1_000;
    // Drop the decimal once the rounded value reaches 10k, so 9_999 reads as
    // "10k ETB" instead of "10.0k ETB".
    const decimals = Math.abs(scaled) + 0.05 >= 10 ? 0 : 1;
    return `${scaled.toFixed(decimals)}k ETB`;
  }
  return `${Math.round(n)} ETB`;
}
