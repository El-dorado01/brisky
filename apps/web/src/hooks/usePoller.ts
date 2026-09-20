import { useEffect, useRef, useCallback } from 'react';
import { ActiveTab } from '../types';

interface PollerOptions {
  enabled: boolean;
  isBusy: boolean;
  activeTab: ActiveTab;
  fetchAssets: () => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchJobs: () => Promise<void>;
}

export function usePoller({
  enabled,
  isBusy,
  activeTab,
  fetchAssets,
  fetchStats,
  fetchJobs,
}: PollerOptions) {
  const failureCountRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBusyRef = useRef<boolean>(isBusy);

  const pollCycle = useCallback(async () => {
    // If the browser tab is hidden in background, pause polling
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    try {
      // 1. Always poll assets and status bar stats for factual live metrics
      const tasks: Promise<void>[] = [fetchAssets(), fetchStats()];

      // 2. Job history list is only needed if pipeline is active or on observability tab
      if (isBusy || activeTab === 'observability') {
        tasks.push(fetchJobs());
      }

      await Promise.all(tasks);
      failureCountRef.current = 0;
    } catch (err) {
      failureCountRef.current += 1;
      console.warn('Poller encountered transient network error:', err);
    }
  }, [isBusy, activeTab, fetchAssets, fetchStats, fetchJobs]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // If indexing just finished, immediately refresh so slots and queue clear without waiting for next idle timer
    if (prevBusyRef.current && !isBusy) {
      pollCycle();
    }
    prevBusyRef.current = isBusy;

    // Adaptive interval computation
    // Busy: 2.5s. Idle: 20s. On failure: exponential backoff up to 30s.
    const baseInterval = isBusy ? 2500 : 20000;
    const backoffMultiplier = Math.min(Math.pow(1.5, failureCountRef.current), 3);
    const intervalMs = Math.round(baseInterval * backoffMultiplier);

    const scheduleNext = () => {
      timerRef.current = setTimeout(async () => {
        await pollCycle();
        scheduleNext();
      }, intervalMs);
    };

    scheduleNext();

    // Visibility listener: pause when tab hidden; immediate refresh on resume
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        pollCycle();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, isBusy, activeTab, pollCycle]);
}
