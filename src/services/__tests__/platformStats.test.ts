import {describe,it,expect} from 'vitest';
import {computeGamesAnalyzedCount} from '../platformStats';
describe('marketing integrity',()=>{it('does not manufacture usage over time',()=>{expect(computeGamesAnalyzedCount(0)).toBe(0);expect(computeGamesAnalyzedCount(Date.now()+365*86400000)).toBe(0);});});
