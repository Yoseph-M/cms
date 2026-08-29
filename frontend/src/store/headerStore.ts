import { create } from 'zustand';

export interface DateRange {
  from: string;
  to: string;
}

export interface PageTitle {
  /** Large title shown in the global header. */
  title?: string;
  /** Subtitle / breadcrumb-style line under the title. */
  subtitle?: string;
  /** Optional icon (Lucide component) shown to the left of the title. */
  iconKey?: string;
}

interface HeaderState {
  /** Active date range rendered in the global Header (next to the page title). */
  dateRange: DateRange;
  /** True when the current page wants the chip to appear in the header. */
  showDateRange: boolean;
  setDateRange: (range: DateRange) => void;
  setShowDateRange: (show: boolean) => void;

  /** Title / subtitle set by the active page so the global header reflects where you are. */
  pageTitle: PageTitle;
  setPageTitle: (title: PageTitle) => void;
}

/**
 * Lightweight store so the top <Header /> can render:
 *   - a date-range chip owned by whatever page is active
 *   - a page-specific title + subtitle
 *
 * Pages call `setShowDateRange(true)` / `setPageTitle({...})` on mount and
 * reset them on unmount via the returned cleanup.
 */
export const useHeaderStore = create<HeaderState>((set) => ({
  dateRange: { from: '', to: '' },
  showDateRange: false,
  setDateRange: (dateRange) => set({ dateRange }),
  setShowDateRange: (showDateRange) => set({ showDateRange }),

  pageTitle: { title: 'Overview', subtitle: '' },
  setPageTitle: (pageTitle) => set({ pageTitle }),
}));
