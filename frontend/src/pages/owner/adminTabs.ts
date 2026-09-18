/**
 * The System Admin tab strip.
 *
 * Kept out of the page component so the URL → tab mapping (including the
 * retired `logins` tab) can be tested without mounting every admin screen.
 */
export type TabId = 'staff' | 'audit' | 'printers' | 'backup';

export const TAB_IDS: readonly TabId[] = ['staff', 'audit', 'printers', 'backup'] as const;

/**
 * Login history used to be its own tab; its rows now appear inside Audit logs.
 * Bookmarks and sidebar links that still carry `?tab=logins` land on the merged
 * screen rather than silently falling back to Staff.
 */
export function resolveAdminTab(raw: string | null): TabId {
  if (raw === 'logins') return 'audit';
  return raw && (TAB_IDS as readonly string[]).includes(raw) ? (raw as TabId) : 'staff';
}
