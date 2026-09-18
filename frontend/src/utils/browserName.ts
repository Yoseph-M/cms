/** Human name for a stored user agent, for security screens. */
export function getBrowserFromUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown';
  // Order matters: Edge and Opera both claim "Chrome", so they are tested first.
  if (userAgent.includes('Edg/')) return 'Edge';
  if (userAgent.includes('OPR/') || userAgent.includes('Opera')) return 'Opera';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Safari')) return 'Safari';
  return 'Other';
}
