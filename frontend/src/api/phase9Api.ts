import { axiosClient } from './axiosClient';

// --- Daily Close ---
export const dailyCloseApi = {
  getCurrentStatus: async (date?: string) => {
    const params = date ? { date } : {};
    const res = await axiosClient.get('/daily-close/current', { params });
    return res.data;
  },
  /**
   * Live figures for the current business day without writing anything. The End
   * of Day screens use this so the numbers are always today's own sales.
   */
  previewDailyClose: async (date?: string) => {
    const params = date ? { date } : {};
    const res = await axiosClient.get('/daily-close/preview', { params });
    return res.data;
  },
  /** Send the End of Day close request — usually the cashier asking a manager. */
  startDailyClose: async (date: string) => {
    const res = await axiosClient.post(`/daily-close/${date}/start`);
    return res.data;
  },
  /** Manager approves the pending request — this locks the day. */
  approveDailyClose: async (date: string, data: { reviewNotes?: string } = {}) => {
    const res = await axiosClient.post(`/daily-close/${date}/approve`, data);
    return res.data;
  },
  /** Manager disapproves the pending request — the day stays open. */
  rejectDailyClose: async (date: string, data: { reviewNotes?: string } = {}) => {
    const res = await axiosClient.post(`/daily-close/${date}/reject`, data);
    return res.data;
  },
  /**
   * Day-by-day revenue history for the End of Day screen. Each row is the
   * server snapshot for one business date, newest first.
   */
  getHistory: async (limit = 30) => {
    const res = await axiosClient.get('/daily-close/history', { params: { limit } });
    return res.data;
  },
};

// --- Integrity Engine ---
export const integrityApi = {
  getIssues: async () => {
    const res = await axiosClient.get('/integrity');
    return res.data;
  },
  runCheck: async () => {
    const res = await axiosClient.post('/integrity/run');
    return res.data;
  },
  resolveIssue: async (id: string, data: { resolutionNotes?: string }) => {
    const res = await axiosClient.post(`/integrity/${id}/resolve`, data);
    return res.data;
  },
};
