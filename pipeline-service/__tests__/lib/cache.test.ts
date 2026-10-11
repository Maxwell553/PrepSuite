import {describe,it,expect,vi} from 'vitest';
import {AsyncCache} from '../../src/lib/cache.js';
describe('bounded shared cache',()=>{
 it('coalesces work and returns isolated copies',async()=>{
  const cache=new AsyncCache<{x:number}>();const load=vi.fn(async()=>({x:1}));
  const [a,b]=await Promise.all([cache.get('key',load),cache.get('key',load)]);
  a.x=5;expect(b.x).toBe(1);expect(await cache.get('key',load)).toEqual({x:1});expect(load).toHaveBeenCalledTimes(1);
 });
 it('does not retain failures',async()=>{
  const cache=new AsyncCache();const load=vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce('ok');
  await expect(cache.get('key',load)).rejects.toThrow('network');expect(await cache.get('key',load)).toBe('ok');
 });
 it('expires and evicts entries by size',async()=>{
  vi.useFakeTimers();try{
   const cache=new AsyncCache<string>(10,100);const a=vi.fn(async()=>'12345');
   await cache.get('a',a);await cache.get('b',async()=>'67890');await cache.get('a',a);expect(a).toHaveBeenCalledTimes(2);
   vi.advanceTimersByTime(101);await cache.get('a',a);expect(a).toHaveBeenCalledTimes(3);
  }finally{vi.useRealTimers();}
 });
});
