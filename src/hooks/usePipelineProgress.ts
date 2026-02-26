/**
 * Hook to build pipeline progress callbacks for SearchScreen.
 * Centralizes the mapping from pipeline phases to UI state updates.
 */

import type { PipelineCallbacks } from '../services/pipelineClient';

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
}

/**
 * Returns callbacks for runPipeline that update the given state setters.
 */
export function usePipelineProgressCallbacks({
  gameLimit,
  setScanningStatus,
  setLoadingStage,
  setLoadingProgress,
}: UsePipelineProgressOptions): PipelineCallbacks {
  return {
    onPhase: (phase, status, durationMs, extra) => {
      if (phase === 'identity' && status === 'started') {
        setScanningStatus('Step 1: Resolving player identity...');
        setLoadingStage('identity');
      } else if (phase === 'identity' && status === 'progress' && extra?.message) {
        setScanningStatus(`Step 1: ${extra.message}`);
      } else if (phase === 'identity' && status === 'complete') {
        setScanningStatus(`Step 1 complete (${durationMs ? Math.round(durationMs / 1000) : '?'}s)`);
      } else if (phase === 'games' && status === 'started') {
        setScanningStatus('Step 2: Fetching games...');
        setLoadingStage('fetching');
      } else if (phase === 'games' && status === 'complete') {
        setScanningStatus(`Step 2 complete: ${extra?.gameCount ?? 0} games fetched`);
      } else if (phase === 'parsing' && status === 'started') {
        setScanningStatus('Step 3: Parsing games & analyzing openings...');
        setLoadingStage('analyzing');
      } else if (phase === 'parsing' && status === 'complete') {
        setScanningStatus(`Step 3 complete: ${extra?.gameCount ?? 0} games parsed`);
      } else if (phase === 'engine' && status === 'started') {
        setScanningStatus('Step 4: Running Stockfish engine analysis...');
      } else if (phase === 'engine' && status === 'complete') {
        setScanningStatus(`Step 4 complete: ${gameLimit.toLocaleString()} games analyzed`);
      } else if (phase === 'report' && status === 'started') {
        setScanningStatus('Step 5: Generating AI analysis report...');
        setLoadingStage('generating');
        setLoadingProgress(85);
      } else if (phase === 'report' && status === 'complete') {
        setScanningStatus('Step 5 complete: AI report generated');
        setLoadingProgress(95);
      }
    },
    onProgress: (phase, current, total) => {
      if (phase === 'games') {
        setLoadingProgress(Math.round((current / total) * 30));
      } else if (phase === 'engine') {
        setLoadingProgress(Math.round(50 + (current / total) * 30));
        const displayedCurrent = total > 0 ? Math.round((current / total) * gameLimit) : 0;
        const displayedTotal = gameLimit;
        setScanningStatus(`Step 4: Stockfish analyzing ${displayedCurrent.toLocaleString()}/${displayedTotal.toLocaleString()} games...`);
      }
    },
    onError: (error) => {
      console.error('[Search] Pipeline error:', error);
    },
  };
}
