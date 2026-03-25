/**
 * Hook to build pipeline progress callbacks for SearchScreen.
 * Centralizes the mapping from pipeline phases to UI state updates.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type {
  PipelineCallbacks,
  IdentityEventData,
  ParsingEventData,
} from '../services/pipelineClient';

export interface PipelineProgressState {
  scanningStatus: string;
  loadingStage: 'identity' | 'fetching' | 'analyzing' | 'generating' | null;
  loadingProgress: number;
}

export interface UsePipelineProgressOptions {
  gameLimit: number;
  setScanningStatus: (value: string) => void;
  setLoadingStage: (value: 'identity' | 'fetching' | 'analyzing' | 'generating' | null) => void;
  setLoadingProgress: (value: number) => void;
  onIdentity?: (data: IdentityEventData) => void;
  onParsing?: (data: ParsingEventData) => void;
}

type ParseAnim = {
  displayed: number;
  target: number;
  total: number;
  raf: number | null;
};

/** Step 3 counter easing: multiply legacy per-frame progress (~0.14 of gap) by this for snappier UI */
const PARSE_PUMP_SPEED = 30;
/** Idle creep: was +1 every ~85ms; scale interval and step by this factor */
const IDLE_CREEP_SPEED = 30;

/**
 * Returns callbacks for runPipeline that update the given state setters.
 * Step 3 (parsing / openings) eases the displayed count toward the server value
 * so the label does not jump when many progress events arrive in a burst.
 */
export function usePipelineProgressCallbacks({
  gameLimit,
  setScanningStatus,
  setLoadingStage,
  setLoadingProgress,
  onIdentity,
  onParsing,
}: UsePipelineProgressOptions): PipelineCallbacks {
  void gameLimit;
  const parseAnimRef = useRef<ParseAnim>({
    displayed: 0,
    target: 0,
    total: 1,
    raf: null,
  });

  const idleCreepRafRef = useRef<number | null>(null);

  const setScanningStatusRef = useRef(setScanningStatus);
  useEffect(() => {
    setScanningStatusRef.current = setScanningStatus;
  }, [setScanningStatus]);

  const cancelParseRaf = useCallback(() => {
    const s = parseAnimRef.current;
    if (s.raf != null) {
      cancelAnimationFrame(s.raf);
      s.raf = null;
    }
  }, []);

  const cancelIdleCreep = useCallback(() => {
    if (idleCreepRafRef.current != null) {
      cancelAnimationFrame(idleCreepRafRef.current);
      idleCreepRafRef.current = null;
    }
  }, []);

  const scheduleParsePump = useCallback(() => {
    const s = parseAnimRef.current;
    if (s.raf != null) return;

    const step = () => {
      s.raf = null;
      const total = Math.max(1, s.total);
      if (s.displayed >= s.target) return;

      const gap = s.target - s.displayed;
      const base = Math.ceil(gap * 0.14 * PARSE_PUMP_SPEED);
      const bonus = gap > 35 ? 5 * PARSE_PUMP_SPEED : gap > 12 ? 2 * PARSE_PUMP_SPEED : 0;
      const inc = Math.max(1, Math.min(gap, base + bonus));
      s.displayed = Math.min(s.displayed + inc, s.target);

      setScanningStatusRef.current(`Step 3: Analyzing Openings (${s.displayed}/${total})...`);

      if (s.displayed < s.target) {
        s.raf = requestAnimationFrame(step);
      }
    };

    s.raf = requestAnimationFrame(step);
  }, []);

  /** Slow count-up while server target is still 0 (worker warm-up before first real progress). */
  const scheduleIdleCreep = useCallback(() => {
    cancelIdleCreep();
    let lastBumpMs = 0;

    const step = (ts: number) => {
      idleCreepRafRef.current = null;
      const s = parseAnimRef.current;
      const total = Math.max(1, s.total);

      if (s.target > s.displayed) {
        if (s.raf == null && s.displayed < s.target) scheduleParsePump();
        return;
      }

      const cap = Math.min(Math.max(0, total - 1), Math.max(1, Math.ceil(total * 0.15)));
      if (s.displayed >= cap) {
        return;
      }

      if (ts - lastBumpMs >= 85 / IDLE_CREEP_SPEED) {
        lastBumpMs = ts;
        s.displayed = Math.min(cap, s.displayed + IDLE_CREEP_SPEED);
        setScanningStatusRef.current(`Step 3: Analyzing Openings (${s.displayed}/${total})...`);
      }

      idleCreepRafRef.current = requestAnimationFrame(step);
    };

    idleCreepRafRef.current = requestAnimationFrame(step);
  }, [cancelIdleCreep, scheduleParsePump]);

  useEffect(
    () => () => {
      cancelParseRaf();
      cancelIdleCreep();
    },
    [cancelParseRaf, cancelIdleCreep],
  );

  return useMemo(
    () => ({
      onPhase: (phase: string, status: string, durationMs?: number, extra?: { gameCount?: number; gamesAnalyzed?: number; message?: string }) => {
        if (phase === 'identity' && status === 'started') {
          setScanningStatus(extra?.message ? `Step 1: ${extra.message}` : 'Step 1: Identifying Player...');
          setLoadingStage('identity');
        } else if (phase === 'identity' && status === 'progress' && extra?.message) {
          setScanningStatus(`Step 1: ${extra.message}`);
        } else if (phase === 'identity' && status === 'complete') {
          setScanningStatus('Step 1: Identifying Player...');
        } else if (phase === 'games' && status === 'started') {
          setScanningStatus('Step 2: Fetching Games...');
          setLoadingStage('fetching');
        } else if (phase === 'games' && status === 'complete') {
          setScanningStatus('Step 2: Fetching Games...');
        } else if (phase === 'parsing' && status === 'started') {
          cancelIdleCreep();
          cancelParseRaf();
          const s = parseAnimRef.current;
          s.displayed = 0;
          s.target = 0;
          s.total = 1;
          s.raf = null;
          setScanningStatus('Step 3: Analyzing Openings...');
          setLoadingStage('analyzing');
        } else if (phase === 'parsing' && status === 'complete') {
          cancelIdleCreep();
          const n = extra?.gameCount;
          if (typeof n === 'number' && n > 0) {
            const s = parseAnimRef.current;
            s.total = Math.max(1, n);
            s.target = n;
            if (s.displayed > n) s.displayed = n;
            if (s.displayed < n) {
              if (s.raf == null) scheduleParsePump();
            } else {
              setScanningStatus(`Step 3: Analyzing Openings (${n}/${n})...`);
            }
          } else {
            setScanningStatus('Step 3: Analyzing Openings...');
          }
        } else if (phase === 'report' && status === 'started') {
          setScanningStatus('Step 4: Generating Report...');
          setLoadingStage('generating');
          setLoadingProgress(85);
        } else if (phase === 'report' && status === 'complete') {
          setScanningStatus('Step 4: Generating Report...');
          setLoadingProgress(95);
        }
      },

      onProgress: (phase: string, current: number, total: number) => {
        const safeCurrent = Math.min(current, total);
        if (phase === 'games') {
          setLoadingProgress(Math.round((safeCurrent / Math.max(1, total)) * 30));
          setScanningStatus('Step 2: Fetching Games...');
        } else if (phase === 'parsing') {
          const s = parseAnimRef.current;
          const safeTotal = Math.max(1, total);
          s.total = safeTotal;
          s.target = Math.min(Math.max(0, current), safeTotal);

          if (current === 0) {
            s.displayed = 0;
            cancelParseRaf();
            cancelIdleCreep();
            setScanningStatus(`Step 3: Analyzing Openings (0/${safeTotal})...`);
            scheduleIdleCreep();
            return;
          }

          cancelIdleCreep();
          if (s.displayed > s.target) s.displayed = s.target;
          if (s.displayed < s.target && s.raf == null) {
            scheduleParsePump();
          }
        }
      },

      onError: (error: string) => {
        console.error('[Search] Pipeline error:', error);
      },
      onIdentity,
      onParsing,
    }),
    [
      setScanningStatus,
      setLoadingStage,
      setLoadingProgress,
      cancelParseRaf,
      cancelIdleCreep,
      scheduleParsePump,
      scheduleIdleCreep,
      onIdentity,
      onParsing,
    ],
  );
}
