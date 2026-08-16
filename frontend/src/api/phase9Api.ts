import { axiosClient } from './axiosClient';

// --- Cashier Shifts ---
export const shiftApi = {
  openShift: async (data: { openingCashMinor: number }) => {
    const res = await axiosClient.post('/shifts', data);
    return res.data;
  },
  getCurrentShift: async () => {
    const res = await axiosClient.get('/shifts/current');
    return res.data;
  },
  getOpenShifts: async () => {
    const res = await axiosClient.get('/shifts/open');
    return res.data;
  },
  closeShift: async (id: string, data: { declaredCashMinor: number; notes?: string; reason?: string }) => {
    const res = await axiosClient.post(`/shifts/${id}/close`, data);
    return res.data;
  },
};

// --- Cash Drawer Ledger ---
export const cashDrawerApi = {
  createEntry: async (shiftId: string, data: { type: string; amountMinor: number; notes?: string }) => {
    const res = await axiosClient.post(`/cash-drawer/${shiftId}/entries`, data);
    return res.data;
  },
  getLedger: async (shiftId: string) => {
    const res = await axiosClient.get(`/cash-drawer/${shiftId}`);
    return res.data;
  },
};

// --- Variance Review ---
export const varianceApi = {
  getPendingReviews: async () => {
    const res = await axiosClient.get('/variance/pending');
    return res.data;
  },
  reviewVariance: async (id: string, data: { status: 'APPROVED' | 'REJECTED'; managerNotes: string }) => {
    const res = await axiosClient.post(`/variance/${id}/review`, data);
    return res.data;
  },
};

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
};
