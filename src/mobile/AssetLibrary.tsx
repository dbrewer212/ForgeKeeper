import { lazy,Suspense,useEffect,useRef,useState } from 'react';
import { coreRequest } from './coreClient';
import { assetStore,clearManagedAssets,downloadAsset,ownerKey,sha256,type CachedAsset,type CachedSummary } from './assetTransfer';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile,readFile } from '@tauri-apps/plugin-fs';
type Row=Record<string,any>;
const ModelPreview=lazy(()=>import('./ModelPreview'));
export default function AssetLibrary({connection,scopes}:{connection:{endpoint?:string;client_id?:string};scopes:string[]}){
 const [query,setQuery]=useState(''),[offset,setOffset]=useState(0),[page,setPage]=useState<{items:Row[];total:number;next_offset:number|null}>({items:[],total:0,next_offset:null});
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<Row|null>(null),[cached,setCached]=useState<CachedAsset|null>(null);
 const generation=useRef(0),transfer=useRef<AbortController|null>(null);
 const detailSequence=useRef(0);
 const currentConnection=useRef(connection);currentConnection.current=connection;
 const [saved,setSaved]=useState<CachedSummary[]>([]);
 async function refreshSaved(){try{const owner=ownerKey(currentConnection.current),rows=await assetStore.list(owner);if(ownerKey(currentConnection.current)===owner)setSaved(rows);}catch{setSaved([]);}}
 useEffect(()=>{setSaved([]);void refreshSaved();},[connection.endpoint,connection.client_id]);
 const [image,setImage]=useState('');
 useEffect(()=>{
  if(!cached||!['png','jpg','jpeg','webp'].includes(cached.format)){setImage('');return;}
  const url=URL.createObjectURL(new Blob([new Uint8Array(cached.data).buffer],{type:'image/'+(cached.format==='jpg'?'jpeg':cached.format)}));setImage(url);
  return()=>URL.revokeObjectURL(url);
 },[cached]);
 useEffect(()=>{const current=++generation.current;setPage({items:[],total:0,next_offset:null});setSelected(null);setCached(null);
  const timer=setTimeout(()=>{void coreRequest<typeof page>(`/v1/discovery?resource=assets&query=${encodeURIComponent(query)}&offset=${offset}&limit=30`).then(result=>{
   if(current===generation.current){setPage(result);setStatus('Library updated.');}
  }).catch(error=>{if(current===generation.current)setStatus(String(error));});},250);
  return()=>{clearTimeout(timer);generation.current++;};
 },[query,offset,connection.endpoint,connection.client_id]);
 useEffect(()=>()=>{transfer.current?.abort();},[]);
 useEffect(()=>{transfer.current?.abort();setCached(null);},[connection.endpoint,connection.client_id]);
 async function download(asset:Row){
  const current=generation.current,controller=new AbortController();transfer.current=controller;setBusy(true);setCached(null);
  if(selected?.asset.id!==asset.id)setSelected(null);
  try{const result=await downloadAsset(ownerKey(connection),asset.id,asset.latest_revision,text=>{if(current===generation.current&&!controller.signal.aborted)setStatus(text);},controller.signal);
   if(current===generation.current&&!controller.signal.aborted)setCached(result);
  }catch(error){if(current===generation.current)setStatus(String(error));}finally{setBusy(false);transfer.current=null;void refreshSaved();}
 }
 async function details(asset:Row){const current=generation.current,sequence=++detailSequence.current;transfer.current?.abort();setCached(null);setSelected(null);try{
  const matchesQuery=asset.object_id?`project_id=${asset.project_id}`:`asset_id=${asset.id}`;
  const [result,matches]=await Promise.all([coreRequest<Row>(`/v1/discovery?resource=asset_revisions&asset_id=${asset.id}&limit=1`),coreRequest<Row>(`/v1/discovery?resource=visual_matches&${matchesQuery}&limit=30`)]);
  if(current===generation.current&&sequence===detailSequence.current)setSelected({asset,revision:result.items[0],matches,matchesQuery});
 }catch(error){if(current===generation.current)setStatus(String(error));}}
 async function moreMatches(){if(!selected||selected.matches.next_offset===null)return;const sequence=detailSequence.current,current=generation.current;
  try{const next=await coreRequest<Row>(`/v1/discovery?resource=visual_matches&${selected.matchesQuery}&offset=${selected.matches.next_offset}&limit=30`);
   if(sequence===detailSequence.current&&current===generation.current)setSelected({...selected,matches:{...next,items:[...selected.matches.items,...next.items]}});
  }catch(error){if(sequence===detailSequence.current)setStatus(String(error));}
 }
 async function openSaved(item:CachedSummary){const current=generation.current;try{
  const entry=await assetStore.get(item.key);
  if(!entry||entry.owner!==ownerKey(connection)||!entry.complete||entry.data.length>16*1024*1024||await sha256(entry.data)!==entry.sha256)throw Error('Cached copy failed verification. Resume or download it again.');
  if(current===generation.current){setSelected(null);setCached(entry);setStatus('Showing a previously downloaded copy. Check the desktop for current revisions and readiness.');}
 }catch(error){if(current===generation.current)setStatus(String(error));}}
 async function associated(id:string){const current=generation.current;try{
  const result=await coreRequest<Row>(`/v1/discovery?resource=assets&asset_id=${encodeURIComponent(id)}&limit=1`);
  if(current!==generation.current)return;
  if(!result.items.length)throw Error('The associated source is no longer active.');
  await details(result.items[0]);
 }catch(error){if(current===generation.current)setStatus(String(error));}}
 async function saveFile(){if(!cached)return;const formats=['ply','stl','step','3mf','glb','gltf','obj','fbx','usdz','blend','gcode','png','jpg','jpeg','webp'];
  try{
   if(await sha256(cached.data)!==cached.sha256)throw Error('Cached asset failed verification. Download it again.');
   const format=formats.includes(cached.format)?cached.format:'bin';
   const destination=await save({defaultPath:`Foundry-${cached.asset_id}-r${cached.revision}.${format}`});
   if(!destination)return;
   await writeFile(destination,cached.data);
   if(await sha256(await readFile(destination))!==cached.sha256)throw Error('Saved file failed verification. Try another phone destination.');
   setStatus('Saved and verified the selected phone file.');
  }catch(error){setStatus(String(error));}
 }
 return <section><h3>Model and project assets</h3><label>Search library<input value={query} maxLength={160} onChange={event=>{setQuery(event.target.value);setOffset(0);transfer.current?.abort();}}/></label>
  <p role="status">{status}</p><p>{page.total?`${offset+1}–${offset+page.items.length} of ${page.total}`:'No matching active assets.'}</p>
  {page.items.map(asset=><article key={asset.id}><h3>{asset.name}</h3><p>{asset.type.toUpperCase()} · Revision {asset.latest_revision}</p>
   <div className="actions"><button onClick={()=>void details(asset)}>Details and source revision</button><button disabled={busy||!scopes.includes('assets.download')} onClick={()=>void download(asset)}>Download / resume</button></div>
  </article>)}
  <div className="actions"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-30))}>Previous</button><button disabled={page.next_offset===null} onClick={()=>setOffset(page.next_offset!)}>Next</button></div>
  {saved.length>0&&<details><summary>Saved on this phone ({saved.length})</summary><p className="muted">Previously downloaded copies can be opened offline. Revocation blocks new transfers; clear the cache to remove retained copies from this app.</p>
   {saved.map(item=><p key={item.key}>{item.name} · revision {item.revision} · {item.complete?'Verified copy':'Partial download'} <button disabled={busy} onClick={()=>item.complete?void openSaved(item):void download({id:item.asset_id,latest_revision:item.revision,name:item.name})}>{item.complete?'Open saved copy':'Resume'}</button></p>)}
  </details>}
  {!scopes.includes('assets.download')&&<p className="muted">Downloads need an explicitly approved asset-download permission on the desktop. Existing pairings keep their current permissions.</p>}
  {busy&&<button onClick={()=>transfer.current?.abort()}>Pause download</button>}
  {cached&&<article><h3>Verified asset ready</h3><p>{cached.name} · {cached.size} bytes</p><p className="muted">SHA-256: {cached.sha256}</p><button onClick={()=>void saveFile()}>Save verified file to phone</button></article>}
  {image&&<img src={image} alt={cached?.name||'Downloaded concept'} style={{width:'100%',maxHeight:500,objectFit:'contain'}}/>}
  {cached&&['ply','stl','glb'].includes(cached.format)&&<Suspense fallback={<p>Opening model viewer…</p>}><ModelPreview asset={cached}/></Suspense>}
  {selected&&<article><h3>{selected.asset.name} — source details</h3>
   <p>Retained revision {selected.revision?.revision} · {selected.revision?.created_at}</p>
   <p>Exact CAD: {selected.revision?.metadata?.exact_cad?'Yes':'No retained exact CAD representation'}</p>
   <p>Closed solid: {selected.revision?.metadata?.validation?.watertight===true?'Closed mesh recorded':'Not confirmed — inspect on the desktop'}</p>
   {selected.revision?.metadata?.validation?.extents_mm&&<p>Size: {selected.revision.metadata.validation.extents_mm.map((v:number)=>v.toFixed(2)).join(' × ')} mm</p>}
   {(selected.revision?.metadata?.concept_candidates||[]).filter((candidate:Row)=>candidate.core_asset_id).map((candidate:Row,index:number)=><p key={index}><button onClick={()=>void associated(candidate.core_asset_id)}>Inspect suggested concept {index+1}</button></p>)}
   {selected.matches?.items.map((match:Row)=><article key={match.id}><h3>{match.model_name}</h3><p>Reviewed visual links · original source revision {match.model_revision} · separate from canon</p>
    {match.concepts.map((concept:Row)=><p key={concept.concept_asset_id}>{concept.name}: {concept.status==='confirmed'?'Visual match confirmed':'Link hidden'} {concept.status==='confirmed'&&<button onClick={()=>void associated(concept.concept_asset_id)}>Inspect concept</button>}</p>)}
    {match.model_asset_id!==selected.asset.id&&<button onClick={()=>void associated(match.model_asset_id)}>Inspect associated model source</button>}
   </article>)}
   {selected.matches?.next_offset!==null&&selected.matches?.next_offset!==undefined&&<button onClick={()=>void moreMatches()}>More reviewed matches</button>}
   <button disabled={busy||!scopes.includes('assets.download')} onClick={()=>void download(selected.asset)}>Download this source</button>
   <p className="muted">Suggested concept associations need your review. Downloading or fitting a model does not make it canonical or approve it for printing.</p>
   <details><summary>Source fingerprint</summary><p style={{overflowWrap:'anywhere'}}>{selected.revision?.content_hash}</p></details>
  </article>}
  <p className="muted">Downloads are limited to 16 MB each. The 64 MB cache evicts older assets as needed. Geometry files are not print approval; review native slicer and machine readiness on the desktop.</p>
  <button disabled={busy} onClick={()=>void clearManagedAssets().then(()=>{setCached(null);setSaved([]);setStatus('Cached assets cleared.');}).catch(error=>setStatus(String(error)))}>Clear cached assets</button>
 </section>;
}
