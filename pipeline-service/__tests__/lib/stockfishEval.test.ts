import {EventEmitter} from 'node:events';
import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({spawn:vi.fn()}));vi.mock('node:child_process',()=>({spawn:mocks.spawn}));
import {evaluateFen} from '../../src/lib/stockfishEval.js';
let proc:any;
beforeEach(()=>{proc=new EventEmitter();proc.stdout=new EventEmitter();proc.stdin=new EventEmitter();proc.stdin.writable=true;proc.stdin.write=vi.fn();proc.kill=vi.fn();mocks.spawn.mockReturnValue(proc);});
describe('practice engine',()=>{
 it('waits for readiness and converts Black-to-move score to White perspective',async()=>{
  const result=evaluateFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',10);
  expect(proc.stdin.write).toHaveBeenCalledWith('uci\n');
  proc.stdout.emit('data',Buffer.from('uciok\nreadyok\ninfo depth 10 score cp 50 pv e7e5\nbestmove e7e5\n'));
  expect((await result).evaluation).toBe(-50);expect(proc.kill).toHaveBeenCalled();
 });
 it('rejects engine exit instead of hanging',async()=>{
  const result=evaluateFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');proc.emit('exit',1);
  await expect(result).rejects.toThrow('exited');
 });
 it('rejects malformed positions before spawning',async()=>{
  await expect(evaluateFen('not a FEN')).rejects.toThrow();expect(mocks.spawn).not.toHaveBeenCalled();
 });
});
