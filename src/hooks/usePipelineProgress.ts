/**
 * Hook to build pipeline progress callbacks for SearchScreen.
 * Centralizes the mapping from pipeline phases to UI state updates.
 */

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

/**
 * Returns callbacks for runPipeline that update the given state setters.
 */
export function usePipelineProgressCallbacks({
  gameLimit,
  setScanningStatus,
  setLoadingStage,
  setLoadingProgress,
  onIdentity,
  onParsing,
}: UsePipelineProgressOptions): PipelineCallbacks {
  return {
    onPhase: (phase, status, durationMs, extra) => {
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
        setScanningStatus('Step 3: Analyzing Openings...');
        setLoadingStage('analyzing');
      } else if (phase === 'parsing' && status === 'complete') {
        setScanningStatus('Step 3: Analyzing Openings...');
      } else if (phase === 'engine' && status === 'started') {
        setScanningStatus('Step 4: Analyzing Games...');
      } else if (phase === 'engine' && status === 'complete') {
        setScanningStatus('Step 4: Analyzing Games...');
      } else if (phase === 'report' && status === 'started') {
        setScanningStatus('Step 5: Generating Report...');
        setLoadingStage('generating');
        setLoadingProgress(85);
      } else if (phase === 'report' && status === 'complete') {
        setScanningStatus('Step 5: Generating Report...');
        setLoadingProgress(95);
      }
    },
    onProgress: (phase, current, total) => {
      if (phase === 'games') {
        setLoadingProgress(Math.round((current / total) * 30));
        setScanningStatus('Step 2: Fetching Games...');
      } else if (phase === 'engine') {
        setLoadingProgress(Math.round(50 + (current / total) * 30));
        setScanningStatus('Step 4: Analyzing Games...');
      }
    },
    onError: (error) => {
      console.error('[Search] Pipeline error:', error);
    },
    onIdentity,
    onParsing,
  };
}
