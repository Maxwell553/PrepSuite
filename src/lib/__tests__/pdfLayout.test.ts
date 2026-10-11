import {describe, expect, it} from 'vitest';
import {PDF_PAGE, placePdfSections} from '../pdfLayout';

describe('complete-section PDF pagination', () => {
  it('fills available space without an early blank page', () => {
    const result = placePdfSections([{width:1000,height:230},{width:1000,height:100},{width:1000,height:350},{width:1000,height:450}]);
    expect(result.map(p => p.page)).toEqual([0,0,0,0]);
  });
  it('moves a whole chart to the next page and fits oversized sections', () => {
    const result = placePdfSections([{width:1000,height:1100},{width:1000,height:500},{width:1000,height:2000}]);
    expect(result.map(p => p.page)).toEqual([0,1,2]);
    for (const p of result) {
      expect(p.y).toBeGreaterThanOrEqual(PDF_PAGE.top);
      expect(p.y+p.height).toBeLessThanOrEqual(PDF_PAGE.bottom+0.01);
      expect(p.width).toBeLessThanOrEqual(182);
    }
    expect(result[2].width/result[2].height).toBeCloseTo(.5);
  });
});
