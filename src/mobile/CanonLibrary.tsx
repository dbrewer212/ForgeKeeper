import {useEffect,useRef,useState} from 'react';
import {coreRequest} from './coreClient';
import {downloadAsset,ownerKey} from './assetTransfer';
type Row=Record<string,any>;
export default function CanonLibrary({connection,scopes}:{connection:{endpoint?:string;client_id?:string};scopes:string[]}){
 const [query,setQuery]=useState(''),[offset,setOffset]=useState(0),[page,setPage]=useState<{items:Row[];total:number;next_offset:number|null}>({items:[],total:0,next_offset:null}),[selected,setSelected]=useState<Row|null>(null),[status,setStatus]=useState(''),[image,setImage]=useState(''),[busy,setBusy]=useState(false);
 const serial=useRef(0),controller=useRef<AbortController|null>(null),imageUrl=useRef('');
 function clearImage(){if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);imageUrl.current='';setImage('');}
 useEffect(()=>{const current=++serial.current;controller.current?.abort();setSelected(null);clearImage();setPage({items:[],total:0,next_offset:null});
  const timer=setTimeout(()=>{void coreRequest<typeof page>(`/v1/discovery?resource=canon&query=${encodeURIComponent(query)}&offset=${offset}&limit=30`).then(result=>{if(current===serial.current){setPage(result);setStatus('Existing character authority updated.');}}).catch(error=>{if(current===serial.current)setStatus(String(error));});},250);
  return()=>{clearTimeout(timer);serial.current++;controller.current?.abort();};
 },[query,offset,connection.endpoint,connection.client_id]);
 useEffect(()=>()=>{controller.current?.abort();if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);},[]);
 async function viewReference(link:Row){const current=serial.current,cancel=new AbortController();controller.current=cancel;setBusy(true);clearImage();try{
  const result=await downloadAsset(ownerKey(connection),link.core_asset_id,1,text=>{if(current===serial.current)setStatus(text);},cancel.signal);
  if(result.sha256!==link.source_sha256)throw Error('This image differs from the retained canon reference. Review it on the desktop.');
  if(!['png','jpg','jpeg','webp'].includes(result.format))throw Error('The retained source is not a supported image.');
  if(current===serial.current&&!cancel.signal.aborted){imageUrl.current=URL.createObjectURL(new Blob([new Uint8Array(result.data).buffer],{type:'image/'+(result.format==='jpg'?'jpeg':result.format)}));setImage(imageUrl.current);setStatus('Original reference verified against the retained canon hash.');}
 }catch(error){if(current===serial.current)setStatus(String(error));}finally{setBusy(false);controller.current=null;}}
 return <section><h3>Character canon</h3><p className="muted">Authority levels and original reference roles are preserved. New Meshy matches need review; locked character identity is separate from print readiness.</p>
  <label>Find a character or design rule<input value={query} maxLength={160} onChange={event=>{setQuery(event.target.value);setOffset(0);}}/></label><p role="status">{status}</p>
  <p>{page.total} matching character records</p>{page.items.map(record=><article key={record.id}><h3>{record.name}</h3><p>{record.canonStatus} · {record.authorityBasis}</p><button onClick={()=>{serial.current++;controller.current?.abort();clearImage();setSelected(record);}}>Read character authority</button></article>)}
  <div className="actions"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-30))}>Previous</button><button disabled={page.next_offset===null} onClick={()=>setOffset(page.next_offset!)}>Next</button></div>
  {selected&&<article><h3>{selected.name}</h3><p>{selected.canonStatus} · {selected.primaryAuthority}</p>
   {([['Identity','identity'],['Foundry role','foundryRole'],['Character DNA','characterDna'],['Allowed variation','allowedVariation'],['Forbidden drift','forbiddenDrift'],['Current production design','currentProductionDesign'],['Decision evidence','decisionEvidence']] as const).map(([title,key])=>selected[key]&&<div key={key}><h4>{title}</h4><p style={{whiteSpace:'pre-wrap'}}>{Array.isArray(selected[key])?selected[key].join('\n'):selected[key]}</p></div>)}
   {(selected.assetLinks||[]).map((link:Row)=><p key={link.assetId}>{link.role} · {link.assetId} <button disabled={busy||!scopes.includes('assets.download')} onClick={()=>void viewReference(link)}>View original reference</button></p>)}
   {!selected.assetLinks?.length&&<p>No original image is assigned to this record. Its decision authority is preserved.</p>}
   {!scopes.includes('assets.download')&&<p className="muted">Viewing original image contents needs the desktop’s optional asset-download permission.</p>}
   {selected.authority_excerpt_omissions&&<p className="warning">Some authority details are excerpts. Read the complete record on the desktop before making a design decision.</p>}
  </article>}
  {image&&<img src={image} alt={'Original reference for '+selected?.name} style={{width:'100%',maxHeight:600,objectFit:'contain'}}/>}
 </section>;
}
