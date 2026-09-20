import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';

/**
 * How long a tab may sit untouched before the session is ended. A POS terminal
 * on a counter is routinely left signed in while nobody is standing at it, so
 * an idle browser must not stay authenticated indefinitely.
 */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Any of these proves a human is still there. */
const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const;

/** `mousemove` fires continuously — don't rebuild a 30-minute timer on every pixel. */
const RESET_THROTTLE_MS = 1_000;

/**
 * Sign the user out after `timeoutMs` with no interaction.
 *
 * The clock starts when the user signs in and restarts on real activity, so a
 * busy shift never notices it. A hidden tab is treated as untouched: the timer
 * keeps running (browsers throttle `setTimeout` in background tabs, but the
 * deadline is re-checked the moment the tab is shown again), which is exactly
 * the case the user asked about.
 */
export function useIdleLogout(timeoutMs: number = IDLE_TIMEOUT_MS) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const addToast = useToastStore((state) => state.addToast);
  const timerRef = useRef<number | null>(null);
  const lastResetRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    const clear = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const fire = () => {
      clear();
      addToast({
        type: 'info',
        title: 'Signed out due to inactivity',
        message: `You were inactive for ${Math.round(timeoutMs / 60_000)} minutes. Sign in again to continue.`,
      });
      void useAuthStore.getState().logout();
    };

    const schedule = () => {
      lastResetRef.current = Date.now();
      clear();
      timerRef.current = window.setTimeout(fire, timeoutMs);
    };

    /** Throttled restart — activity within the throttle window keeps the timer. */
    const onActivity = () => {
      if (Date.now() - lastResetRef.current < RESET_THROTTLE_MS) return;
      schedule();
    };

    schedule();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    return () => {
      clear();
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, [isAuthenticated, timeoutMs, addToast]);
}
