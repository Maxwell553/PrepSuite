import { useCallback, useEffect, useState } from 'react';

export interface RatingHistoryPoint {
  date: string;
  classicalRating?: number;
  rapidRating?: number;
  blitzRating?: number;
}

export function useRatingHistory(fideId?: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{id?: string; history: RatingHistoryPoint[]; loading: boolean; error: boolean; checkedAt?: string; source?: string}>({history: [], loading: false, error: false});
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    const id = fideId?.trim();
    if (!id) { setState({history: [], loading: false, error: false}); return; }
    let disposed = false;
    let controller: AbortController | undefined;
    const fetchHistory = async () => {
      if (controller || disposed) return;
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 7000);
      setState(previous => ({...previous, id, history: previous.id === id ? previous.history : [], loading: true, error: false}));
      try {
        const base = (import.meta.env.VITE_PIPELINE_SERVICE_URL || '').replace(/\/$/, '');
        const response = await fetch(`${base}/fide-rating-history/${encodeURIComponent(id)}`, {signal: request.signal, cache: 'no-store'});
        if (!response.ok) throw new Error('History unavailable');
        const data = await response.json();
        if (!Array.isArray(data.history) || !data.history.length) throw new Error('No history returned');
        const history = data.history.filter((point: RatingHistoryPoint) => /^\d{4}-(0[1-9]|1[0-2])$/.test(point.date) && [point.classicalRating, point.rapidRating, point.blitzRating].some(value => typeof value === 'number' && Number.isFinite(value) && value > 0)).sort((a: RatingHistoryPoint,b: RatingHistoryPoint) => a.date.localeCompare(b.date));
        if (!history.length) throw new Error('No dated ratings');
        if (!disposed) setState({id, history, loading: false, error: false, checkedAt: data.checkedAt || new Date().toISOString(), source: data.source === 'FIDE' ? 'FIDE' : data.source === 'FIDE via Lichess' ? 'FIDE via Lichess' : undefined});
      } catch {
        if (!disposed) setState(previous => ({...previous, loading: false, error: true}));
      } finally { window.clearTimeout(timeout); controller = undefined; }
    };
    void fetchHistory();
    // No automatic retry/poll loop. Users can explicitly refresh after a provider failure.
    return () => { disposed = true; controller?.abort(); };

  }, [fideId, revision]);
  return {...state, history: state.id === fideId?.trim() ? state.history : [], refresh};
}
