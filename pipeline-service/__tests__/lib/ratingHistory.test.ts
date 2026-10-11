import {describe, it, expect} from 'vitest';
import {parseFideRatingHistory} from '../../src/lib/ratingHistory.js';
describe('FIDE published rating history', () => {
  it('reads ratings, not game counts, sorts periods, and excludes unrated values', () => {
    const html = `<table class="profile-table_calc"><tr><th>Period</th></tr>
      <tr><td>&nbsp;2026-Oct&nbsp;</td><td>1957</td><td>4</td><td>2010</td><td>12</td><td>0</td><td>0</td></tr>
      <tr><td>2026-Sep</td><td>1940</td><td>2</td><td>2000</td><td>5</td><td>1980</td><td>6</td></tr>
      <tr><td>2026-Abc</td><td>1950</td><td>3</td><td>2000</td><td>1</td><td>2000</td><td>3</td></tr></table>`;
    expect(parseFideRatingHistory(html)).toEqual([{date:'2026-09',classicalRating:1940,rapidRating:2000,blitzRating:1980},{date:'2026-10',classicalRating:1957,rapidRating:2010}]);
  });
  it('does not invent data for missing or changed upstream markup', () => {
    expect(parseFideRatingHistory('<html>Temporarily unavailable</html>')).toEqual([]);
    expect(parseFideRatingHistory('<table class="profile-table_calc"><tr><td>2026-Oct</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr></table>')).toEqual([]);
  });
});

describe('provider history decoding', () => {
  it('decodes the official chart response without zero/null ratings', async () => {
    const {parseOfficialFideHistory} = await import('../../src/lib/ratingHistory.js');
    expect(parseOfficialFideHistory([{date_2:'2026-Oct',rating:'1450',rapid_rtng:null,blitz_rtng:'0'},{date_2:'invalid',rating:'1800'}])).toEqual([{date:'2026-10',classicalRating:1450}]);
  });
  it('preserves sparse FIDE observations and rejects invalid dates and ratings', async () => {
    const {parseLichessFideHistory} = await import('../../src/lib/ratingHistory.js');
    expect(parseLichessFideHistory({standard:[2026011450,2026101450,2026131450,2026100000,2026109999],rapid:[2026101500],blitz:['2026101500']})).toEqual([{date:'2026-01',classicalRating:1450},{date:'2026-10',classicalRating:1450,rapidRating:1500}]);
  });
});
