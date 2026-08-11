export const ETHIOPIAN_COUNTRY_CODE = '+251';
export const ETHIOPIAN_DIGIT_LIMIT = 9;

/** Strip country code, leading zero, and non-digits. Returns the bare national digits. */
export function normalizeEthiopianPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('251')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, ETHIOPIAN_DIGIT_LIMIT);
}

/** Normalize and prefix with the Ethiopian country code. */
export function formatEthiopianPhone(raw: string): string {
  const digits = normalizeEthiopianPhone(raw);
  return digits ? `${ETHIOPIAN_COUNTRY_CODE}${digits}` : '';
}

export function isValidEthiopianPhone(raw: string): boolean {
  return normalizeEthiopianPhone(raw).length === ETHIOPIAN_DIGIT_LIMIT;
}
