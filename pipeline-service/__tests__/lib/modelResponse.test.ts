import {describe,it,expect,vi} from 'vitest';
vi.mock('../../src/lib/logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn()}}));
import {checkModelResponse} from '../../src/lib/modelResponse.js';
const context={requestId:'test',model:'test',channel:'repertoire' as const};
describe('model response contract',()=>{
 it.each([null,{}, {promptFeedback:{blockReason:'SAFETY'}}, {candidates:[{finishReason:'STOP',content:{parts:[{functionCall:{name:'get_game',args:{gameIndex:-1}}}]}}]}, {candidates:[{finishReason:'STOP',content:{parts:[{text:'bad\u0000text'}]}}]}])('rejects invalid or blocked output %#',raw=>expect(()=>checkModelResponse(raw,context)).toThrow());
 it('rejects tool calls in support',()=>expect(()=>checkModelResponse({candidates:[{finishReason:'STOP',content:{parts:[{functionCall:{name:'get_game',args:{gameIndex:1}}}]}}]},{...context,channel:'support'})).toThrow());
});
