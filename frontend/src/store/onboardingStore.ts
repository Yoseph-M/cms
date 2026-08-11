import { create } from 'zustand';

interface OnboardingState {
  isOpen: boolean;
  stepIndex: number;
  openWizard: (step?: number) => void;
  closeWizard: () => void;
  setStep: (step: number) => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  isOpen: false,
  stepIndex: 0,
  openWizard: (step) => set((state) => ({ isOpen: true, stepIndex: step ?? state.stepIndex })),
  closeWizard: () => set({ isOpen: false }),
  setStep: (step) => set({ stepIndex: step }),
}));
