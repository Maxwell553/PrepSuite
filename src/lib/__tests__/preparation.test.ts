import {describe,it,expect} from 'vitest';
import {preparationPriorities,gameSpeed,identityKey} from '../preparation';
import {createEmptyReport} from '../reportUtils';
import type {GameData} from '../../types';
const game=(changes:Partial<GameData>={}):GameData=>({id:'1',white:'Other',black:'chess_handle',source:'chess.com',result:'1/2-1/2',eco:'B20',openingName:'Sicilian Defense',pgn:'1. e4 c5',playedAt:'2026-09-01',timeControl:'180+2',...changes});
describe('round preparation',()=>{
 it('combines distinct verified account aliases and includes draws in score',()=>{
  const report=createEmptyReport('Test Player');report.player.platforms={chessCom:'chess_handle',lichess:'lichess_handle'};
  report.games=[game(),game({id:'2',black:'lichess_handle',source:'lichess',result:'0-1'})];
  const [p]=preparationPriorities(report,'white','','',0);
  expect(p.games).toHaveLength(2);expect(p.score).toBe(.75);expect(p.confidence).toBe('Small sample');
 });
 it('does not match a different player sharing one name',()=>{
  const report=createEmptyReport('John Smith');report.games=[game({black:'Jane Smith'}),game({black:'Smith, John'})];
  expect(preparationPriorities(report,'white','','',0)[0].games).toHaveLength(1);
  expect(identityKey('José Smith')).toBe(identityKey('Smith, Jose'));
 });
 it('filters opponent color, source, and speed without calling OTB automatically classical',()=>{
  const report=createEmptyReport('chess_handle');report.games=[game(),game({id:'2',source:'otb',timeControl:'unknown'}),game({id:'3',white:'chess_handle',black:'Other'})];
  expect(preparationPriorities(report,'white','chess.com','blitz',0)[0].games).toHaveLength(1);
  expect(preparationPriorities(report,'white','otb','classical',0)).toEqual([]);
  expect(gameSpeed(game({timeControl:'60+1'}))).toBe('bullet');
 });
 it('reports rating expectation only with complete ratings',()=>{
  const report=createEmptyReport('chess_handle');report.games=[game({whiteElo:2000,blackElo:2000})];
  expect(preparationPriorities(report,'white','','',0)[0].expected).toBe(.5);
  report.games.push(game());expect(preparationPriorities(report,'white','','',0)[0].expected).toBeNull();
 });
});

it('unifies opening labels across platforms',()=>{
 const report=createEmptyReport('chess_handle');report.games=[game({openingName:'Sicilian: Najdorf'}),game({id:'2',openingName:'Sicilian Defense'})];
 const p=preparationPriorities(report,'white','','',0);expect(p).toHaveLength(1);expect(p[0].games).toHaveLength(2);
});
