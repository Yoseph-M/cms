import { axiosClient } from './axiosClient';

// --- Cashier Shifts ---
export const shiftApi = {
  // Self-service shift open (cashier opens their own shift)
  openShift: async (data: { openingCashMinor: number }) => {
    const res = await axiosClient.post('/shifts', data);
    return res.data;
  },
  // Administrative shift open (manager/owner opens shift for another cashier)
  openShiftAdmin: async (data: { cashierId: string; openingCashMinor: number }) => {
    const res = await axiosClient.post('/shifts/admin', data);
    return res.data;
  },
  // Get current shift (cashiers get their own, managers can specify cashierId)
  getCurrentShift: async (cashierId?: string) => {
    const params = cashierId ? { cashierId } : {};
    const res = await axiosClient.get('/shifts/current', { params });
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
  // Get shift history (cashiers get their own, managers can filter by cashierId)
  getShiftHistory: async (params?: { cashierId?: string; status?: string; limit?: number; offset?: number }) => {
    const res = await axiosClient.get('/shifts/history', { params });
    return res.data;
  },
};

// --- Cash Drawer Ledger ---
export const cashDrawerApi = {
  // Record cash payout (money leaving drawer)
  recordPayout: async (data: { shiftId: string; amountMinor: number; reason: string; reference?: string }) => {
    const res = await axiosClient.post('/cash-drawer/payout', data);
    return res.data;
  },
  // Record petty cash (small operational expenses) - Manager/Owner only
  recordPettyCash: async (data: { shiftId: string; amountMinor: number; reason: string; category?: string }) => {
    const res = await axiosClient.post('/cash-drawer/petty-cash', data);
    return res.data;
  },
  // Record cash adjustment (corrections) - Owner only
  recordAdjustment: async (data: { shiftId: string; amountMinor: number; reason: string }) => {
    const res = await axiosClient.post('/cash-drawer/adjustment', data);
    return res.data;
  },
  // Get ledger for a shift
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
