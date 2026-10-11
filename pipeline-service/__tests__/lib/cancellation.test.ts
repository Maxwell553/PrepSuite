import {describe,it,expect} from 'vitest';
import {SSEStream} from '../../src/lib/sse.js';
import {workContext,workSignal} from '../../src/lib/workContext.js';
describe('analysis cancellation',()=>{
 it('aborts outbound work when the SSE reader disconnects',async()=>{
  const stream=new SSEStream();const reader=stream.response().body!.getReader();
  const signal=workContext.run(stream.signal,()=>workSignal(10000));
  await reader.cancel();expect(stream.signal.aborted).toBe(true);expect(signal.aborted).toBe(true);
 });
});
