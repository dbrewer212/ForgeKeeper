import { coreRequest, coreStatus } from './coreClient';

export type CachedAsset={key:string;owner:string;asset_id:string;revision:number;sha256:string;size:number;format:string;name:string;data:Uint8Array;complete:boolean;updated:number};
export interface AssetStore { get(key:string):Promise<CachedAsset|undefined>;put(entry:CachedAsset):Promise<void>;clear():Promise<void>; }
export type CachedSummary=Omit<CachedAsset,'data'>&{downloaded_bytes:number};
const fileLimit=16*1024*1024,cacheLimit=64*1024*1024;
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open('foundry.managed-assets.v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('assets',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Phone asset storage is unavailable.'));});}
async function transaction<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore,done:(value:T)=>void)=>void):Promise<T>{
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('assets',mode);let result:T;
  tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=tx.onabort=()=>{db.close();reject(Error('Phone asset storage could not be updated.'));};
  action(tx.objectStore('assets'),value=>{result=value;});});
}
export const assetStore:AssetStore&{list(owner:string):Promise<CachedSummary[]>}={
 list:owner=>transaction('readonly',(store,done)=>{const rows:CachedSummary[]=[];const request=store.openCursor();request.onsuccess=()=>{
  const cursor=request.result;if(!cursor){done(rows.sort((a,b)=>b.updated-a.updated));return;}
  const {data,...metadata}=cursor.value as CachedAsset;if(metadata.owner===owner)rows.push({...metadata,downloaded_bytes:data.length});cursor.continue();
 };}),
 get:key=>transaction('readonly',(store,done)=>{const request=store.get(key);request.onsuccess=()=>done(request.result);}),
 put:entry=>transaction('readwrite',(store,done)=>{const request=store.getAll();request.onsuccess=()=>{
  const others=(request.result as CachedAsset[]).filter(item=>item.key!==entry.key).sort((a,b)=>a.updated-b.updated);
  let bytes=others.reduce((sum,item)=>sum+item.data.length,entry.data.length);
  while(bytes>cacheLimit&&others.length){const old=others.shift()!;store.delete(old.key);bytes-=old.data.length;}
  if(bytes>cacheLimit){store.transaction.abort();return;}store.put(entry);done(undefined);
 };}),
 clear:()=>transaction('readwrite',(store,done)=>{store.clear();done(undefined);}),
};
export const sha256=async(data:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(data).buffer))).map(b=>b.toString(16).padStart(2,'0')).join('');
export function ownerKey(connection:{endpoint?:string;client_id?:string}){
 if(!connection.endpoint||!connection.client_id)throw Error('Refresh the paired desktop identity first.');
 return JSON.stringify([connection.endpoint,connection.client_id]);
}
export const assetKey=(owner:string,id:string,revision:number)=>JSON.stringify([owner,id,revision]);
let active=false,epoch=0;
export async function clearManagedAssets(){epoch++;await assetStore.clear();}
export async function downloadAsset(owner:string,id:string,revision:number,progress:(text:string)=>void,cancel:AbortSignal,store:AssetStore=assetStore):Promise<CachedAsset>{
 if(active)throw Error('Another asset transfer is running.');
 if(!/^[a-f0-9-]{36}$/i.test(id)||!Number.isInteger(revision)||revision<1)throw Error('Choose a registered asset revision.');
 active=true;
 const begun=epoch;
 const key=assetKey(owner,id,revision);
 try{
  const verifyOwner=async()=>{if(begun!==epoch)throw Error('Cached assets were cleared. Transfer stopped.');if(cancel.aborted)throw Error('Transfer paused. Tap download to resume.');if(ownerKey(await coreStatus())!==owner)throw Error('The paired desktop changed. Transfer discarded.');};
  await verifyOwner();let entry=await store.get(key);
  // Even a completed cache entry is reauthorized online before reuse.
  let offset=entry&&!entry.complete?entry.data.length:0;
  for(;;){
   await verifyOwner();
   const chunk=await coreRequest<any>(`/v1/asset-content?asset_id=${id}&revision=${revision}&offset=${offset}&limit=262144`);
   await verifyOwner();
   if(chunk.asset_id!==id||chunk.revision!==revision||chunk.offset!==offset||!Number.isInteger(chunk.size)||chunk.size<1||chunk.size>fileLimit||!/^[a-f0-9]{64}$/.test(chunk.sha256)||chunk.encoding!=='base64')throw Error('Asset exceeds the 16 MB phone limit or returned an invalid manifest. Use the desktop for large originals.');
   if(entry&&(entry.sha256!==chunk.sha256||entry.size!==chunk.size))throw Error('The asset content changed. Clear cached assets and download again.');
   if(typeof chunk.content!=='string'||chunk.content.length>349528)throw Error('The asset chunk exceeds its limit.');
   const data=Uint8Array.from(atob(chunk.content),c=>c.charCodeAt(0));
   if(data.length!==chunk.length||data.length<1||data.length>262144||offset+data.length>chunk.size||await sha256(data)!==chunk.chunk_sha256)throw Error('Asset chunk failed verification. Retry to resume from the last verified chunk.');
   const next=offset+data.length,complete=next===chunk.size;
   if(chunk.next_offset!==(complete?null:next))throw Error('The asset returned an invalid continuation.');
   const combined=new Uint8Array(next);if(offset)combined.set(entry!.data);combined.set(data,offset);
   if(complete&&await sha256(combined)!==chunk.sha256)throw Error('The complete asset failed verification. Clear cached assets and retry.');
   entry={key,owner,asset_id:id,revision,sha256:chunk.sha256,size:chunk.size,format:chunk.format,name:chunk.name,data:combined,complete,updated:Date.now()};
   await verifyOwner();await store.put(entry);
   if(begun!==epoch){await store.clear();throw Error('Cached assets were cleared. Transfer stopped.');}
   progress(`${complete?'Verified':'Downloading'} ${Math.round(next/chunk.size*100)}% · ${Math.ceil(next/1024)} KB`);
   if(complete)return entry;offset=next;
  }
 }finally{active=false;}
}
