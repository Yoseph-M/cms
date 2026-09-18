import { axiosClient } from './axiosClient';

// --- Daily Close ---
export const dailyCloseApi = {
  getCurrentStatus: async (date?: string) => {
    const params = date ? { date } : {};
    const res = await axiosClient.get('/daily-close/current', { params });
    return res.data;
  },
  startDailyClose: async (date: string) => {
    const res = await axiosClient.post(`/daily-close/${date}/start`);
    return res.data;
  },
  finalizeDailyClose: async (date: string, data: { reviewNotes?: string }) => {
    const res = await axiosClient.post(`/daily-close/${date}/finalize`, data);
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
