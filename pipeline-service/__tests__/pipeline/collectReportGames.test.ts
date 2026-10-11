import {describe,it,expect,vi} from 'vitest';
import {collectReportGames} from '../../src/pipeline/collectReportGames.js';
import type {GameData} from '../../src/lib/types.js';
const game=(id:number,source='chess.com')=>({id:String(id),source,playedAt:'2026-10-01',pgn:'valid'} as GameData);
const source=(count:number,quota:number,kind='chess.com')=>({quota,fetch:vi.fn(async(limit:number)=>({games:Array.from({length:Math.min(limit,count)},(_,i)=>game(i,kind)),exhausted:count<limit}))});
describe('report game coverage',()=>{
 it('fills exactly 2500 with online games when OTB has only 100',async()=>{
  const online=source(5000,1250),otb=source(100,1250,'otb');
  const games=await collectReportGames(2500,[online,otb],async games=>games);
  expect(games).toHaveLength(2500);expect(games.filter(g=>g.source==='otb')).toHaveLength(100);
  expect(online.fetch).toHaveBeenLastCalledWith(2400);
 });
 it('replaces invalid notation and keeps unique IDs',async()=>{
  const online=source(5000,2500);
  const games=await collectReportGames(2500,[online],async games=>games.filter(g=>Number(g.id)>3));
  expect(games).toHaveLength(2500);expect(new Set(games.map(g=>g.id)).size).toBe(2500);
 });
 it('preserves the requested mix when both sources have enough',async()=>{
  const games=await collectReportGames(2500,[source(5000,1000),source(5000,1500,'otb')],async games=>games);
  expect(games.filter(g=>g.source==='otb')).toHaveLength(1500);
 });
 it('returns available games when all selected sources are exhausted',async()=>{
  const games=await collectReportGames(2500,[source(300,1250),source(10,1250,'otb')],async games=>games);
  expect(games).toHaveLength(310);
 });
 it('does not fetch a source with a zero allocation',async()=>{
  const excluded=source(100,0,'otb');
  await collectReportGames(500,[source(1000,500),excluded],async games=>games);
  expect(excluded.fetch).not.toHaveBeenCalled();
 });
});
