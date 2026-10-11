import {renderHook, waitFor, act} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useRatingHistory} from './useRatingHistory';
afterEach(() => vi.unstubAllGlobals());
describe('rating history freshness', () => {
  it('clears previous-player data and exposes upstream failures without fabricating a current point', async () => {
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({history:[{date:'2026-09',classicalRating:1950}]}))).mockResolvedValueOnce(new Response('{}',{status:503}));
    vi.stubGlobal('fetch', fetchMock);
    const {result,rerender}=renderHook(({id})=>useRatingHistory(id),{initialProps:{id:'1'}});
    await waitFor(()=>expect(result.current.history).toHaveLength(1));
    rerender({id:'2'});
    expect(result.current.history).toEqual([]);
    await waitFor(()=>expect(result.current.error).toBe(true));
    expect(result.current.history).toEqual([]);
  });
  it('refreshes uncached data and keeps the last successful history when refresh fails', async () => {
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({history:[{date:'2026-09',classicalRating:1950}]}))).mockResolvedValueOnce(new Response(JSON.stringify({history:[{date:'2026-10',classicalRating:1957}]}))).mockResolvedValueOnce(new Response('{}',{status:503}));
    vi.stubGlobal('fetch',fetchMock);
    const {result}=renderHook(()=>useRatingHistory('1'));
    await waitFor(()=>expect(result.current.history[0]?.date).toBe('2026-09'));
    act(()=>result.current.refresh());
    await waitFor(()=>expect(result.current.history[0]?.date).toBe('2026-10'));
    expect(fetchMock.mock.calls[1][1].cache).toBe('no-store');
    act(()=>result.current.refresh());
    await waitFor(()=>expect(result.current.error).toBe(true));
    expect(result.current.history[0].classicalRating).toBe(1957);
  });
});
