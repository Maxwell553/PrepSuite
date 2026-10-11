import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../src/lib/ratingProvider.js',()=>({fetchRatingJson:vi.fn()}));
import {fetchRatingJson} from '../../src/lib/ratingProvider.js';
import {getUscfProfile,searchUscfByName,parseUscfMember} from '../../src/pipeline/uscfProfile.js';
const member={id:'12345678',firstName:'JOHN',lastName:'SMITH',stateRep:'CA',fideId:'12345',ratings:[{ratingSystem:'B',rating:1800},{ratingSystem:'R',rating:1850}]};
beforeEach(()=>vi.resetAllMocks());
describe('US Chess public member API',()=>{
 it('rejects invalid IDs without a network request',async()=>{
  expect(await getUscfProfile('')).toBeNull();expect(await getUscfProfile('../members')).toBeNull();expect(fetchRatingJson).not.toHaveBeenCalled();
 });
 it('selects the regular rating and linked FIDE ID',async()=>{
  vi.mocked(fetchRatingJson).mockResolvedValue(member);
  expect(await getUscfProfile('12345678')).toMatchObject({id:'12345678',name:'JOHN SMITH',rating:1850,state:'CA',fideId:'12345'});
 });
 it('parses dynamic search results',async()=>{
  vi.mocked(fetchRatingJson).mockResolvedValue({items:[member,{id:'bad'}]});
  expect(await searchUscfByName('John Smith')).toEqual([{uscfId:'12345678',name:'JOHN SMITH',rating:1850,state:'CA'}]);
 });
 it('does not retry outages or substitute an old MSA rating',async()=>{
  vi.mocked(fetchRatingJson).mockRejectedValue(new Error('unavailable'));
  expect(await getUscfProfile('12345678')).toBeNull();expect(fetchRatingJson).toHaveBeenCalledTimes(1);
 });
 it('rejects a mismatched player and does not interpret blitz as regular',async()=>{
  vi.mocked(fetchRatingJson).mockResolvedValue(member);
  expect(await getUscfProfile('87654321')).toBeNull();
  expect(parseUscfMember({...member,ratings:[{ratingSystem:'B',rating:1800}]})).toMatchObject({rating:0});
 });
});
