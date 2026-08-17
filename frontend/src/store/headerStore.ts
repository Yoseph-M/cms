import { create } from 'zustand';

export interface DateRange {
  from: string;
  to: string;
}

interface HeaderState {
  /** Active date range rendered in the global Header (next to "Analytics Overview"). */
  dateRange: DateRange;
  /** True when the current page wants the chip to appear in the header. */
  showDateRange: boolean;
  setDateRange: (range: DateRange) => void;
  setShowDateRange: (show: boolean) => void;
}

/**
 * Lightweight store so the top <Header /> can render a date-range chip
 * that is owned by whatever page is currently active (e.g. the owner
 * dashboard). Pages call `setShowDateRange(true)` on mount and
 * `setShowDateRange(false)` on unmount.
 */
export const useHeaderStore = create<HeaderState>((set) => ({
  dateRange: { from: '', to: '' },
  showDateRange: false,
  setDateRange: (dateRange) => set({ dateRange }),
  setShowDateRange: (showDateRange) => set({ showDateRange }),
}));
