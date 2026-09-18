/**
 * Backend currency formatting — matches frontend formatCurrency.
 * Amounts are whole ETB units (no cents), so nothing after the decimal point
 * is ever rendered. Use for CSV exports / receipt payloads that include
 * currency strings; prefer sending raw numbers to the client when possible.
 */
export function formatCurrency(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
  return `${formatted} ETB`;
}
