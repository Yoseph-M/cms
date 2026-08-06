/**
 * Backend currency formatting — matches frontend formatCurrency.
 * Use for CSV exports / receipt payloads that include currency strings.
 * Prefer sending raw numbers to the client when possible.
 */
export function formatCurrency(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${formatted} ETB`;
}
