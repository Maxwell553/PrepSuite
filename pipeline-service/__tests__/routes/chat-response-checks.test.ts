import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
vi.mock('../../src/middleware/rateLimit.js', () => ({ chatRateLimitMiddleware: async (_c:any,next:any)=>next() }));
vi.mock('../../src/lib/logger.js', () => ({ logger: { info:vi.fn(),warn:vi.fn(),error:vi.fn(),debug:vi.fn() } }));
vi.mock('../../src/lib/vertexAuth.js', () => ({ getAccessToken:async()=> 'test', getVertexUrl:(model:string)=>`https://test.invalid/${model}`, invalidateAccessTokenCache:vi.fn() }));
import { chatRoute } from '../../src/routes/chat.js';
import { supportChatRoute } from '../../src/routes/supportChat.js';
import { logger } from '../../src/lib/logger.js';
const app=new Hono();app.route('/api',chatRoute);app.route('/api',supportChatRoute);
const report={player:{name:'Test',platforms:{}},whiteOpenings:[],blackDefenses:[],mostPlayedLines:{white:[],black:[]}};
const response=(parts:unknown[],finishReason='STOP')=>new Response(JSON.stringify({candidates:[{content:{parts},finishReason}]}));
const request=(channel:string)=>app.request(`/api/${channel}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(channel==='chat'?{report,question:'Help me prepare'}:{messages:[{role:'user',content:'Help me prepare'}]})}).then(r=>r.text());
beforeEach(()=>{vi.clearAllMocks();global.fetch=vi.fn();});
describe.each(['chat','support-chat'])('%s response checks',channel=>{
 it('combines text parts, strips thought parts and logs a passed check',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response([{text:'private reasoning',thought:true},{text:'First. '},{text:'Second.'}]));
  const body=await request(channel);expect(body).toContain('First. Second.');expect(body).not.toContain('private reasoning');expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({check:'passed'}),'[ModelResponse] Checked');
 });
 it('rejects truncated answers and uses a distinct fallback',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response([{text:'TRUNCATED'}],'MAX_TOKENS')).mockResolvedValueOnce(response([{text:'Complete answer.'}]));
  const body=await request(channel);expect(body).toContain('Complete answer.');expect(body).not.toContain('TRUNCATED');expect(fetch).toHaveBeenCalledTimes(2);
  expect(vi.mocked(fetch).mock.calls[0][0]).not.toEqual(vi.mocked(fetch).mock.calls[1][0]);
 });
 it('does not expose safety-blocked text or bypass the block with another model',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(response([{text:'BLOCKED TEXT'}],'SAFETY'));
  const body=await request(channel);expect(body).toContain('event: error');expect(body).not.toContain('BLOCKED TEXT');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('fails closed when both models return empty answers',async()=>{
  vi.mocked(fetch).mockImplementation(async()=>response([{text:'   '}]));
  const body=await request(channel);expect(body).toContain('event: error');expect(body).not.toContain('event: chat_text');expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('falls back on a retired model response',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(new Response('Retired',{status:410})).mockResolvedValueOnce(response([{text:'Available model.'}]));
  expect(await request(channel)).toContain('Available model.');expect(fetch).toHaveBeenCalledTimes(2);
 });
});
it('checks every repertoire tool round and preserves the thought signature',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(response([{functionCall:{name:'get_game',args:{gameIndex:1}},thoughtSignature:'signature'}])).mockResolvedValueOnce(response([{text:'BAD FINAL'}],'SAFETY'));
 const body=await request('chat');expect(body).not.toContain('BAD FINAL');expect(body).toContain('event: error');expect(fetch).toHaveBeenCalledTimes(2);
 expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).contents[1].parts[0].thoughtSignature).toBe('signature');
 expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({round:1,check:'failed'}),'[ModelResponse] Checked');
});
it('rejects unknown tools before execution and retries with clean history',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(response([{functionCall:{name:'arbitrary_tool',args:{}}}])).mockResolvedValueOnce(response([{text:'Checked fallback.'}]));
 expect(await request('chat')).toContain('Checked fallback.');
 expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).contents).toHaveLength(1);
});
it('recovers from a retired model mid-tool round without forwarding old signatures',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(response([{functionCall:{name:'get_game',args:{gameIndex:1}},thoughtSignature:'old-signature'}])).mockResolvedValueOnce(new Response('Retired',{status:410})).mockResolvedValueOnce(response([{text:'Recovered.'}]));
 expect(await request('chat')).toContain('Recovered.');
 const call=JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as string);expect(call.contents).toHaveLength(1);expect(call.generationConfig.thinkingConfig.thinkingLevel).toBe('low');
});
