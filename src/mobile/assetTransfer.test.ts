import {beforeEach,expect,it,vi} from 'vitest';
import {downloadAsset,sha256,ownerKey,type AssetStore,type CachedAsset} from './assetTransfer';
const mocks=vi.hoisted(()=>({request:vi.fn(),status:vi.fn()}));
vi.mock('./coreClient',()=>({coreRequest:mocks.request,coreStatus:mocks.status}));
const identity={paired:true,endpoint:'https://fixture.invalid:8765',client_id:'fixture'},owner=ownerKey(identity),id='12345678-1234-1234-1234-123456789abc';
let entries:Map<string,CachedAsset>,store:AssetStore,payload:Uint8Array;
beforeEach(async()=>{
 entries=new Map();store={get:async key=>entries.get(key),put:async entry=>{entries.set(entry.key,entry);},clear:async()=>{entries.clear();}};
 payload=new Uint8Array(300000).map((_,i)=>i%251);mocks.status.mockResolvedValue(identity);
 mocks.request.mockImplementation(async(path:string)=>{const query=new URL('https://fixture.invalid'+path).searchParams,offset=Number(query.get('offset')),data=payload.slice(offset,offset+262144);
  return {asset_id:id,revision:1,size:payload.length,sha256:await sha256(payload),offset,length:data.length,chunk_sha256:await sha256(data),encoding:'base64',content:Buffer.from(data).toString('base64'),format:'ply',name:'Fixture',next_offset:offset+data.length===payload.length?null:offset+data.length};
 });
});
it('resumes after a failed request and verifies the full retained revision',async()=>{
 const original=mocks.request.getMockImplementation()!;let calls=0;
 mocks.request.mockImplementation(async(path:string)=>{if(++calls===2)throw Error('Disconnected');return original(path);});
 await expect(downloadAsset(owner,id,1,()=>{},new AbortController().signal,store)).rejects.toThrow('Disconnected');
 expect([...entries.values()][0].data.length).toBe(262144);
 mocks.request.mockImplementation(original);const result=await downloadAsset(owner,id,1,()=>{},new AbortController().signal,store);
 expect(result.complete).toBe(true);expect(result.data).toEqual(payload);
 expect(mocks.request).toHaveBeenLastCalledWith(expect.stringContaining('offset=262144'));
});
it('rejects corrupt chunks, oversize files and invalid continuations before caching',async()=>{
 const original=mocks.request.getMockImplementation()!;
 for(const patch of [{chunk_sha256:'bad'},{size:17*1024*1024},{next_offset:12}]){
  mocks.request.mockImplementation(async(path:string)=>({...await original(path),...patch}));
  await expect(downloadAsset(owner,id,1,()=>{},new AbortController().signal,store)).rejects.toThrow();expect(entries.size).toBe(0);
 }
});
it('discards replies after the paired desktop changes and preserves revocation failures',async()=>{
 const original=mocks.request.getMockImplementation()!;
 mocks.request.mockImplementation(async(path:string)=>{const response=await original(path);mocks.status.mockResolvedValue({...identity,client_id:'other'});return response;});
 await expect(downloadAsset(owner,id,1,()=>{},new AbortController().signal,store)).rejects.toThrow('changed');expect(entries.size).toBe(0);
 mocks.status.mockResolvedValue(identity);mocks.request.mockRejectedValue(Error('Authentication required.'));
 await expect(downloadAsset(owner,id,1,()=>{},new AbortController().signal,store)).rejects.toThrow('Authentication');
});
it('supports pause without discarding verified chunks and rejects concurrent work',async()=>{
 const controller=new AbortController();let denied:Promise<void>|undefined;
 const result=downloadAsset(owner,id,1,()=>{controller.abort();denied=expect(downloadAsset(owner,id,1,()=>{},new AbortController().signal,store)).rejects.toThrow('Another');},controller.signal,store);
 await expect(result).rejects.toThrow('paused');await denied;expect([...entries.values()][0].data.length).toBe(262144);
});
