import {describe,it,expect} from 'vitest';
import {Chess} from 'chess.js';
import {recordedPracticeMove} from '../practiceRepertoire';
import type {ParsedGame} from '../repertoireUtils';
const entries = [
 {game:{white:'Carlsen, Magnus',black:'Opponent'},history:['e4','e5','Nf3']},
 {game:{white:'Magnus Carlsen',black:'Opponent'},history:['e4','c5','Nf3']},
 {game:{white:'Someone else',black:'Opponent'},history:['d4','d5']},
] as ParsedGame[];
describe('recorded practice',()=>{
 it('uses the matched player and the exact played prefix',()=>{
  expect(recordedPracticeMove(entries,['Magnus Carlsen'],'white',[],new Chess().fen())).toBe('e2e4');
  const g=new Chess();g.move('e4');g.move('c5');
  expect(recordedPracticeMove(entries,['Magnus Carlsen'],'white',g.history(),g.fen())).toBe('g1f3');
 });
 it('does not invent a continuation for an unrecorded line or wrong color',()=>{
  const g=new Chess();g.move('a4');g.move('a5');
  expect(recordedPracticeMove(entries,['Magnus Carlsen'],'white',g.history(),g.fen())).toBeNull();
  expect(recordedPracticeMove(entries,['Magnus Carlsen'],'black',[],new Chess().fen())).toBeNull();
 });
 it('ignores invalid notation and preserves promotions',()=>{
  const parsed=[{game:{white:'Player'},history:['bad-move']},{game:{white:'Player'},history:['a8=Q+']}] as ParsedGame[];
  expect(recordedPracticeMove(parsed,['Player'],'white',[],'7k/P7/8/8/8/8/8/7K w - - 0 1')).toBe('a7a8q');
 });
});
