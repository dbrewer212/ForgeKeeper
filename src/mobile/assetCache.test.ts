import 'fake-indexeddb/auto';
import {beforeEach,expect,it} from 'vitest';
import {assetStore,clearManagedAssets,type CachedAsset} from './assetTransfer';
beforeEach(async()=>{await clearManagedAssets();});
function entry(key:string,mb:number,updated:number):CachedAsset{return {key,owner:'fixture',asset_id:key,revision:1,sha256:'fixture',size:mb*1024*1024,format:'ply',name:key,data:new Uint8Array(mb*1024*1024),complete:true,updated};}
it('persists independent identities and clears all cached private content',async()=>{
 await assetStore.put(entry('owner-a',1,1));await assetStore.put(entry('owner-b',1,2));
 expect((await assetStore.get('owner-a'))?.data.length).toBe(1024*1024);
 const listed=await assetStore.list('fixture');expect(listed).toHaveLength(2);expect(listed[0].downloaded_bytes).toBe(1024*1024);expect(listed[0]).not.toHaveProperty('data');
 await clearManagedAssets();expect(await assetStore.get('owner-a')).toBeUndefined();expect(await assetStore.get('owner-b')).toBeUndefined();
});
it('evicts the oldest entries to stay within the 64 MB bound',async()=>{
 for(let index=0;index<5;index++)await assetStore.put(entry(String(index),16,index));
 expect(await assetStore.get('0')).toBeUndefined();
 for(let index=1;index<5;index++)expect((await assetStore.get(String(index)))?.data.length).toBe(16*1024*1024);
});
it('replacing a partial entry counts its replacement once',async()=>{
 for(let index=0;index<4;index++)await assetStore.put(entry(String(index),16,index));
 await assetStore.put(entry('0',16,10));expect(await assetStore.get('1')).toBeDefined();
 await assetStore.put(entry('4',16,11));expect(await assetStore.get('1')).toBeUndefined();expect(await assetStore.get('0')).toBeDefined();
});
