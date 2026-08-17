import { useEffect, useState } from 'react';

export type ElapsedTone = 'fresh' | 'warning' | 'danger';

export interface ElapsedState {
  totalSeconds: number;
  minutes: number;
  seconds: number;
  display: string;
  tone: ElapsedTone;
}

const FRESH_THRESHOLD_SECS = 15 * 60; // 15 min
const DANGER_THRESHOLD_SECS = 30 * 60; // 30 min

function compute(createdAt: string): ElapsedState {
  const diffMs = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tone: ElapsedTone =
    totalSeconds >= DANGER_THRESHOLD_SECS
      ? 'danger'
      : totalSeconds >= FRESH_THRESHOLD_SECS
        ? 'warning'
        : 'fresh';
  const display =
    minutes >= 1
      ? `${minutes}m ${seconds.toString().padStart(2, '0')}s`
      : `${seconds}s`;
  return { totalSeconds, minutes, seconds, display, tone };
}

/**
 * Live-ticking elapsed-time hook.
 * Updates every 5s for a "live" feel without thrashing React.
 * Returns a friendly `display` string ("18m 04s") plus a tonal bucket
 * so the UI can drive semantic colors.
 */
export function useElapsedTime(createdAt: string, tickMs = 5_000): ElapsedState {
  const [state, setState] = useState<ElapsedState>(() => compute(createdAt));

  useEffect(() => {
    setState(compute(createdAt));
    const id = setInterval(() => setState(compute(createdAt)), tickMs);
    return () => clearInterval(id);
  }, [createdAt, tickMs]);

  return state;
}
