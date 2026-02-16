import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFideSearchResults, scoreFideMatch, pickBestFideMatch } from '../../src/pipeline/fideSearch.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');

describe('parseFideSearchResults', () => {
  it('parses HTML with multiple results', () => {
    const html = readFileSync(join(fixturesDir, 'fide-search-results.html'), 'utf-8');
    const results = parseFideSearchResults(html);
    expect(results.length).toBe(2);
    expect(results[0]).toEqual({
      fideId: '1503014',
      name: 'Carlsen, Magnus',
      federation: 'NOR',
      title: 'GM',
    });
    expect(results[1].fideId).toBe('4800028');
  });

  it('returns empty array for no results', () => {
    const html = '<html><body>No results found</body></html>';
    const results = parseFideSearchResults(html);
    expect(results).toEqual([]);
  });

  it('handles rows without profile links', () => {
    const html = '<table><tr><td>Header</td></tr></table>';
    const results = parseFideSearchResults(html);
    expect(results).toEqual([]);
  });
});

describe('scoreFideMatch', () => {
  it('scores exact match highest', () => {
    const result = { fideId: '1', name: 'Magnus Carlsen', federation: 'NOR', title: 'GM' };
    const score = scoreFideMatch('Magnus Carlsen', result);
    expect(score).toBeGreaterThan(1.0); // exact match bonus + title bonus
  });

  it('scores partial match', () => {
    const result = { fideId: '1', name: 'Carlsen, Magnus', federation: 'NOR', title: 'GM' };
    const score = scoreFideMatch('Magnus Carlsen', result);
    expect(score).toBeGreaterThan(0.5);
  });

  it('scores no match as zero', () => {
    const result = { fideId: '1', name: 'John Smith', federation: 'USA', title: '' };
    const score = scoreFideMatch('Magnus Carlsen', result);
    expect(score).toBe(0);
  });

  it('gives bonus for titled players', () => {
    const titled = { fideId: '1', name: 'Magnus Carlsen', federation: 'NOR', title: 'GM' };
    const untitled = { fideId: '2', name: 'Magnus Carlsen', federation: 'NOR', title: '' };
    expect(scoreFideMatch('Magnus Carlsen', titled)).toBeGreaterThan(
      scoreFideMatch('Magnus Carlsen', untitled),
    );
  });
});

describe('pickBestFideMatch', () => {
  it('picks the best match above threshold', () => {
    const results = [
      { fideId: '1503014', name: 'Carlsen, Magnus', federation: 'NOR', title: 'GM' },
      { fideId: '4800028', name: 'Carlsen, Marcus', federation: 'DEN', title: '' },
    ];
    const best = pickBestFideMatch('Magnus Carlsen', results);
    expect(best?.fideId).toBe('1503014');
  });

  it('returns null when no match above threshold', () => {
    const results = [
      { fideId: '1', name: 'John Smith', federation: 'USA', title: '' },
    ];
    const best = pickBestFideMatch('Magnus Carlsen', results);
    expect(best).toBeNull();
  });

  it('returns null for empty results', () => {
    expect(pickBestFideMatch('Magnus Carlsen', [])).toBeNull();
  });
});
