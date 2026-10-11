import {describe,it,expect} from 'vitest';
import {clientIp} from '../../src/lib/clientIp.js';
describe('trusted proxy boundary',()=>{
 it('ignores forwarded headers by default',()=>expect(clientIp('1.2.3.4','127.0.0.1')).toBe('127.0.0.1'));
 it('ignores a forged prefix with a configured proxy chain',()=>expect(clientIp('1.2.3.4, 5.6.7.8','10.0.0.1',1)).toBe('5.6.7.8'));
 it('falls back to the peer for malformed headers',()=>expect(clientIp('garbage','127.0.0.1',1)).toBe('127.0.0.1'));
});
