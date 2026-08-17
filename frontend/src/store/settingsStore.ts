import { create } from 'zustand';
import { axiosClient } from '../api/axiosClient';

interface SettingsState {
  settings: Record<string, string>;
  isLoading: boolean;
  fetchSettings: () => Promise<void>;
  updateSettingLocally: (key: string, value: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: {},
  isLoading: true,
  
  fetchSettings: async () => {
    try {
      set({ isLoading: true });
      const response = await axiosClient.get('/settings/system');
      set({ settings: response.data, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch settings', error);
      set({ isLoading: false });
    }
  },

  updateSettingLocally: (key, value) => {
    set((state) => ({
      settings: {
        ...state.settings,
        [key]: value,
      }
    }));
  }
}));
