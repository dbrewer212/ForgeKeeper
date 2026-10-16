import { useCallback, useEffect, useRef, useState } from 'react';
import { coreRequest, coreStatus, forgetCore, pairCore, readLabel, scanCode } from './coreClient';
import { blankFields, complete, extractLabel, materials, scanIdentity, type ScanFields } from './spoolScan';
import './coreFoundry.css';

type Row = Record<string, any>;
type Receipt = ScanFields & {request_id:string; spool_id:string; barcode:string; condition:string; confidence:string; remaining_grams:number|null; location:string; source_text:string};
const tabs = ['Forgekeeper','Bastion','Materials','Production','Alerts','OpenClaw','Assets','Connect'];
const queueKey = 'foundry.core.receipts.v1';
const productsKey = 'foundry.core.products.v1';
function stored<T,>(key:string, fallback:T):T { try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } }
function save(key:string, value:unknown) { localStorage.setItem(key, JSON.stringify(value)); }
const id = () => crypto.randomUUID();

export default function CoreFoundry({onLegacy}:{onLegacy:()=>void}) {
  const [page,setPage] = useState('Forgekeeper');
  const [connection,setConnection] = useState<{paired:boolean;endpoint?:string}>({paired:false});
  const [scopes,setScopes] = useState<string[]>([]);
  const [online,setOnline] = useState(false);
  const [status,setStatus] = useState('Pair with your desktop to bring the workshop into view.');
  const [busy,setBusy] = useState(false);
  const [state,setState] = useState<Row|null>(null);
  const [rows,setRows] = useState<Row[]>([]);
  const [projects,setProjects] = useState<Row[]>([]);
  const [brief,setBrief] = useState<Row|null>(null);
  const [fields,setFields] = useState<ScanFields>(blankFields);
  const [barcode,setBarcode] = useState('');
  const [sourceText,setSourceText] = useState('');
  const [condition,setCondition] = useState('Sealed');
  const [weight,setWeight] = useState('');
  const [location,setLocation] = useState('');
  const [queue,setQueue] = useState<Receipt[]>(()=>stored(queueKey,[]));
  const [action,setAction] = useState<{path:string;title:string;summary:string}|null>(null);
  const [actionNote,setActionNote] = useState('');
  const [pairText,setPairText] = useState('');
  const [proposal,setProposal] = useState(false);
  const [proposalTarget,setProposalTarget] = useState('');
  const [proposalNote,setProposalNote] = useState('');
  const [proposalReason,setProposalReason] = useState('');
  const [spoolLabel,setSpoolLabel] = useState<{code:string;image:string}|null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const serial = useRef(0);

  useEffect(()=>{ void coreStatus().then(setConnection).catch(()=>setStatus('Android app preview · local drafts are available.')); },[]);
  const refresh = useCallback(async()=>{
    if (!connection.paired) return;
    const request = ++serial.current;
    try {
      const [snapshot,who,projectList] = await Promise.all([
        coreRequest<Row>('/v1/state'),coreRequest<{scopes:string[]}>('/v1/me'),coreRequest<Row[]>('/v1/projects')]);
      const route:Record<string,string> = {Bastion:'/v1/machines',Materials:'/v1/spools',Production:'/v1/production',Alerts:'/v1/persistent-alerts',OpenClaw:'/v1/proposals',Assets:'/v1/assets'};
      const records = route[page] ? await coreRequest<Row[]>(route[page]) : [];
      if (request!==serial.current) return;
      setState(snapshot); setScopes(who.scopes); setProjects(projectList); setRows(records); setOnline(true);
      setStatus('Updated '+new Date().toLocaleTimeString());
    } catch(error) { if(request===serial.current) {setOnline(false);setStatus(String(error)+' · displayed records may be stale.');} }
  },[connection.paired,page]);
  useEffect(()=>{setRows([]);void refresh();const timer=setInterval(()=>void refresh(),7000);return()=>{clearInterval(timer);serial.current++;};},[refresh]);
  async function run(operation:()=>Promise<void>) {setBusy(true);try{await operation();}catch(error){setStatus(String(error));}finally{setBusy(false);}}
  async function connect(text:string) {
    await pairCore(text); setConnection(await coreStatus()); setPairText(''); setStatus('Desktop paired.');
  }
  async function captureCode(pairing=false) {
    await run(async()=>{
      const text=await scanCode();
      if(pairing){await connect(text);return;}
      const identity=scanIdentity(text);
      if(identity.kind==='spool') {
        const spools=connection.paired ? await coreRequest<Row[]>('/v1/spools') : [];
        const found=spools.find(item=>item.name===identity.value);
        setPage('Materials');
        if(found){setStatus(`${found.name} · ${found.remaining_grams===null?'remainder unknown':found.remaining_grams+' g'} · ${found.location||'no location recorded'}`);}
        else setStatus('This spool is not in the connected desktop inventory. Refresh or check the selected desktop.');
        return;
      }
      if(identity.kind!=='product') {setStatus('This code has no recognized product details. Photograph the printed spool label.');return;}
      setBarcode(identity.value); setPage('Materials');
      const catalog=stored<Record<string,ScanFields>>(productsKey,{});
      if(catalog[identity.value]){setFields(catalog[identity.value]);setStatus('Known product found. Confirm the physical spool condition and save.');}
      else {
        const library=connection.paired?await coreRequest<Row[]>('/v1/materials'):[];
        const product=library.find(item=>item.barcode===identity.value);
        setFields(product?{brand:product.brand,material:product.material,color:product.color,diameter_mm:product.diameter_mm,nominal_grams:product.nominal_grams}:blankFields());
        setStatus(product?'Product matched from your desktop. Confirm before saving.':'New product barcode. Photograph its label to identify the filament.');
      }
    });
  }
  async function capturePhoto(file?:File) {
    if(!file)return;
    await run(async()=>{
      if(!connection.paired)throw Error('Pair with your desktop to read a label photo.');
      const text=await readLabel(file,setStatus);setSourceText(text);setFields(current=>({...current,...extractLabel(text)}));
      setStatus('Label read locally on your desktop. Confirm detected fields; retake the photo if anything is unclear.');
    });
  }
  function keepReceipt() {
    try {
      if(!complete(fields))throw Error('Confirm the missing label fields, or retake a clearer photo.');
      const knownWeight=weight.trim()===''?null:Number(weight);
      if(condition==='Used'&&knownWeight!==null&&(!Number.isFinite(knownWeight)||knownWeight<0))throw Error('Use a nonnegative estimated weight or leave it unknown.');
      const receipt:Receipt={...fields,request_id:id(),spool_id:id(),barcode,condition,
        confidence:condition==='Sealed'?'Nominal':condition==='Empty'?'Exact':knownWeight===null?'Unknown':'Estimated',
        remaining_grams:condition==='Sealed'?fields.nominal_grams:condition==='Empty'?0:knownWeight,location,source_text:sourceText};
      const next=[...queue,receipt];save(queueKey,next);setQueue(next);
      if(barcode){const catalog=stored<Record<string,ScanFields>>(productsKey,{});catalog[barcode]=fields;save(productsKey,catalog);}
      setFields(blankFields());setBarcode('');setSourceText('');setWeight('');
      setStatus('Spool saved as a local draft. Send it to the desktop when connected.');
    }catch(error){setStatus(String(error));}
  }
  async function sendReceipt(receipt:Receipt) {
    await run(async()=>{
      await coreRequest('/v1/inventory/receive',receipt);
      const next=queue.filter(item=>item.request_id!==receipt.request_id);save(queueKey,next);setQueue(next);
      setStatus('Spool received by the desktop.');await refresh();
    });
  }
  function ask(path:string,title:string,summary:string) {setAction({path,title,summary});setActionNote('');}
  async function labelFor(spool:Row) {
    await run(async()=>{const {default:QRCode}=await import('qrcode');setSpoolLabel({code:spool.name,image:await QRCode.toDataURL(spool.name,{width:360,margin:4})});});
  }
  const button=(title:string,handler:()=>void,primary=false,disabled=false)=><button type="button" className={primary?'primary':''} disabled={busy||disabled} onClick={handler}>{title}</button>;
  return <div className="core-foundry">
    <header><img src="/assets/foundry-mark.png" alt="Foundry forge mark"/><div><small>FENRIR FORGEWORKS</small><h1>Foundry <span>Mobile</span></h1></div><span className={'connection '+(online?'online':'')}>{online?'Connected':connection.paired?'Offline':'Local'}</span></header>
    <nav aria-label="Foundry workspaces">{tabs.map(tab=><button key={tab} aria-current={page===tab?'page':undefined} className={page===tab?'active':''} onClick={()=>setPage(tab)}>{tab}</button>)}</nav>
    <main><div className="page-heading"><div><small>YOUR WORKSHOP, IN REACH</small><h2>{page}</h2></div>{button('Refresh',()=>void refresh(),false,!connection.paired)}</div>
      <p className="status" role="status">{busy?'Working… ':''}{status}</p>
      {page==='Forgekeeper'&&<>
        <section className="hero"><small>THE CONTEXT BEHIND EVERY BUILD</small><h3>Keep the forge moving.</h3><p>Project context, workshop health and materials connected to your Foundry desktop.</p><div className="actions">{button('Scan a spool',()=>void captureCode(),true)}{button(connection.paired?'Connection settings':'Connect desktop',()=>setPage('Connect'))}</div></section>
        <div className="metrics"><article><span>Saved projects</span><strong>{online?projects.length:'—'}</strong></article><article><span>Active jobs</span><strong>{online?state?.jobs?.filter((j:Row)=>j.state==='running').length:'—'}</strong></article><article><span>Local spool drafts</span><strong>{queue.length}</strong></article></div>
        <section><h3>Project briefing</h3><p className="muted">Select a registered project to read its saved context and operator notes.</p>{projects.map(project=><button className="project" key={project.id} onClick={()=>void run(async()=>setBrief(await coreRequest<Row>('/v1/context?project_id='+project.id)))}>{project.name}<span>Revision {project.latest_revision}</span></button>)}
          {brief&&<article><h3>{brief.project.name}</h3><p>{brief.project.notes||'No project notes recorded.'}</p><p>{brief.assets.length} retained assets · {brief.jobs.length} job records</p>{brief.annotations.slice(-5).map((item:Row)=><p key={item.id}>{item.note}</p>)}</article>}
          {!connection.paired&&<p>Pair with your desktop to view retained projects. Local spool drafts remain on this phone.</p>}</section>
        <p className="muted">Grounded project context · conversational AI is not connected.</p>
      </>}
      {page==='Bastion'&&<><div className="metrics"><article><span>CPU</span><strong>{!online||state?.resources?.cpu===undefined?'—':Math.round(state.resources.cpu)+'%'}</strong></article><article><span>Memory</span><strong>{!online||state?.resources?.ram===undefined?'—':Math.round(state.resources.ram)+'%'}</strong></article><article><span>Telemetry</span><strong className="small-value">{state?.telemetry_state||'Unknown'}</strong></article></div><section><h3>Printer fleet</h3>{rows.map(machine=><article key={machine.id}><h3>{machine.name}</h3><p>Expected: {machine.expected_state.replaceAll('_',' ')}</p><p>Observed: {machine.observed_state} · {machine.observed_at||'No telemetry received'}</p><p className="muted">{machine.notes}</p></article>)}</section><section><h3>Workshop actions</h3><div className="actions">{button('Scan filament',()=>void captureCode(),true)}{button('Review alerts',()=>setPage('Alerts'))}{button('Review production',()=>setPage('Production'))}</div></section></>}
      {page==='Materials'&&<>
        <section><h3>Receive a spool</h3><p className="muted">Scan a known product, or photograph the label and confirm the suggested details.</p><div className="actions">{button('Scan barcode / QR',()=>void captureCode(),true)}{button('Photograph label',()=>photo.current?.click(),false,!connection.paired)}</div>
          <input ref={photo} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={event=>{void capturePhoto(event.target.files?.[0]);event.target.value='';}}/>
          {barcode&&<p>Product barcode: {barcode}</p>}
          <div className="field-grid"><label>Brand<input value={fields.brand} onChange={e=>setFields({...fields,brand:e.target.value})}/></label><label>Material<select value={fields.material} onChange={e=>setFields({...fields,material:e.target.value})}><option value="">Confirm material</option>{materials.map(v=><option key={v}>{v}</option>)}</select></label><label>Color<input value={fields.color} onChange={e=>setFields({...fields,color:e.target.value})}/></label><label>Diameter (mm)<input type="number" min="0.5" max="5" step="0.01" value={fields.diameter_mm??''} onChange={e=>setFields({...fields,diameter_mm:e.target.value?Number(e.target.value):null})}/></label><label>Labeled filament weight (g)<input type="number" min="1" max="100000" value={fields.nominal_grams??''} onChange={e=>setFields({...fields,nominal_grams:e.target.value?Number(e.target.value):null})}/></label><label>Condition<select value={condition} onChange={e=>setCondition(e.target.value)}><option>Sealed</option><option>Used</option><option>Empty</option></select></label>{condition==='Used'&&<label>Estimated remaining grams (optional)<input type="number" min="0" value={weight} placeholder="Leave blank for unknown" onChange={e=>setWeight(e.target.value)}/></label>}<label>Storage location (optional)<input value={location} onChange={e=>setLocation(e.target.value)}/></label></div>
          <p className="muted">{condition==='Sealed'?'Sealed spool: labeled weight is recorded as nominal, not measured.':condition==='Used'?'Used spool: remaining weight stays unknown unless you supply an estimate.':'Empty spool: zero remaining filament.'}</p>
          {button('Confirm and save spool draft',keepReceipt,true,!complete(fields))}
          {sourceText&&<details><summary>Recognized label text</summary><pre>{sourceText}</pre></details>}
        </section>
        <section><h3>Pending receipts · {queue.length}</h3>{queue.map(item=><article key={item.request_id}><h3>{item.brand} {item.material} · {item.color}</h3><p>{item.confidence} · {item.remaining_grams===null?'remaining weight unknown':item.remaining_grams+' g'}</p>{button('Send to desktop',()=>void sendReceipt(item),true,!connection.paired||!scopes.includes('inventory.receive'))}</article>)}{!queue.length&&<p className="muted">No pending receipts.</p>}</section>
        <section><h3>Desktop spools</h3>{rows.map(spool=><article key={spool.id}><h3>{spool.name}</h3><p>{spool.remaining_grams===null?'Remaining weight unknown':spool.remaining_grams+' g remaining'} · {spool.quantity_confidence||'Recorded'}</p><p>{spool.location||'No location recorded'}</p>{button('Show spool QR label',()=>void labelFor(spool))}</article>)}</section>
      </>}
      {page==='Production'&&<section><h3>Production queue</h3>{rows.map(value=><article key={value.job.id}><h3>{value.job.state.toUpperCase()} · {value.job.material}</h3><p>{value.job.profile}</p><p>{value.job.machine_id} · Quantity {value.job.quantity||1}</p>{value.checks.map((check:string)=><p key={check} className="warning">{check}</p>)}{value.job.state==='queued'&&scopes.includes('approve.production')&&button('Review approval',()=>ask('/v1/jobs/'+value.job.id+'/approve','Approve production',value.job.material+' · '+value.job.profile))}<p className="muted">Printer execution remains in its native control path.</p></article>)}</section>}
      {page==='Alerts'&&<section><h3>Watcher conditions</h3>{rows.map(alert=><article key={alert.id} className={alert.severity==='critical'?'critical':''}><h3>{alert.message}</h3><p>{alert.severity} · {alert.resolved_at?'Resolved':alert.acknowledged_at?'Acknowledged':'Active'}</p><div className="actions">{!alert.resolved_at&&!alert.acknowledged_at&&scopes.includes('alerts.acknowledge')&&button('Acknowledge',()=>ask('/v1/alerts/'+alert.id+'/acknowledge','Acknowledge alert',alert.message))}{!alert.resolved_at&&scopes.includes('alerts.resolve')&&button('Resolve',()=>ask('/v1/alerts/'+alert.id+'/resolve','Resolve alert',alert.message))}</div></article>)}</section>}
      {page==='OpenClaw'&&<section><h3>Reviewed Core actions</h3>{scopes.includes('proposals.create')&&button('Propose a project note',()=>{setProposal(true);setProposalTarget(projects[0]?.id||'');},true)}{rows.map(item=><article key={item.id}><h3>{item.action}</h3><p>{item.state} · {item.target.name||item.target.message||item.target_id}</p><p>{item.arguments.note}</p><p className="muted">{item.reason}</p><p>Review: {item.review_note||'Awaiting review'}</p><div className="actions">{item.state==='pending'&&scopes.includes('proposals.review')&&button('Approve',()=>ask('/v1/proposals/'+item.id+'/approve','Approve proposal',item.arguments.note))}{['pending','approved'].includes(item.state)&&scopes.includes('proposals.review')&&button('Reject',()=>ask('/v1/proposals/'+item.id+'/reject','Reject proposal',item.arguments.note))}{item.state==='approved'&&scopes.includes('proposals.execute')&&button('Execute approved change',()=>ask('/v1/proposals/'+item.id+'/execute','Execute approved change',item.arguments.note),true)}</div></article>)}</section>}
      {page==='Assets'&&<section><h3>Retained design assets</h3>{rows.map(asset=><article key={asset.id}><h3>{asset.name}</h3><p>{asset.type.toUpperCase()} · Revision {asset.latest_revision}</p><p>{asset.active?'Active':'Archived'}</p></article>)}<p className="muted">Full CAD editing and native file operations remain in the desktop Engine.</p></section>}
      {page==='Connect'&&<><section><h3>Pair your Foundry desktop</h3><p>On the updated desktop, open Bastion → Connect Pixel / Mobile Foundry. Scan its pairing code here.</p>{button('Scan desktop pairing code',()=>void captureCode(true),true)}<details><summary>Paste a pairing code instead</summary><textarea value={pairText} onChange={e=>setPairText(e.target.value)} maxLength={12000} autoComplete="off"/><div>{button('Pair desktop',()=>void run(async()=>connect(pairText)))}</div></details>{connection.paired&&<><p className="muted">{connection.endpoint}</p>{button('Forget this desktop',()=>void run(async()=>{await forgetCore();setConnection({paired:false});setOnline(false);setState(null);setRows([]);setScopes([]);} ))}</>}<p className="muted">The code includes the desktop’s certificate and a scoped credential. Photos are read on your own desktop and are not retained by the scanner.</p></section><section><h3>Existing Forgekeeper workspace</h3><p>Keep using the original local workspace, material ledger, Foundry Link pairing and Bastion controls.</p>{button('Open legacy workspace',onLegacy)}</section></>}
      {connection.paired&&rows.length===0&&['Production','Alerts','OpenClaw','Assets'].includes(page)&&<p className="muted">No matching records received.</p>}
    </main>
    <footer>{button('Forgekeeper',()=>setPage('Forgekeeper'))}{button('Bastion',()=>setPage('Bastion'))}{button('Scan',()=>void captureCode(),true)}{button('Materials',()=>setPage('Materials'))}</footer>
    {action&&<div className="sheet" role="dialog" aria-modal="true" aria-label={action.title}><section><h2>{action.title}</h2><p>{action.summary}</p><label>Operator note<textarea value={actionNote} onChange={e=>setActionNote(e.target.value)} maxLength={2000}/></label><div className="actions">{button('Cancel',()=>setAction(null))}{button('Confirm action',()=>void run(async()=>{await coreRequest(action.path,{note:actionNote});setAction(null);await refresh();}),true,!actionNote.trim()&&!action.path.endsWith('/execute'))}</div></section></div>}
    {proposal&&<div className="sheet" role="dialog" aria-modal="true" aria-label="Propose project note"><section><h2>Propose a project note</h2><label>Registered project<select value={proposalTarget} onChange={e=>setProposalTarget(e.target.value)}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Exact proposed note<textarea value={proposalNote} onChange={e=>setProposalNote(e.target.value)} maxLength={8000}/></label><label>Reason<input value={proposalReason} onChange={e=>setProposalReason(e.target.value)} maxLength={2000}/></label><div className="actions">{button('Cancel',()=>setProposal(false))}{button('Create proposal',()=>void run(async()=>{await coreRequest('/v1/proposals',{action:'project.annotate',target_id:proposalTarget,arguments:{note:proposalNote},reason:proposalReason});setProposal(false);setProposalNote('');setProposalReason('');await refresh();}),true,!proposalTarget||!proposalNote.trim()||!proposalReason.trim())}</div></section></div>}
    {spoolLabel&&<div className="sheet" role="dialog" aria-modal="true" aria-label="Spool QR label"><section><h2>{spoolLabel.code}</h2><img className="spool-qr" src={spoolLabel.image} alt={'QR label for '+spoolLabel.code}/><p>Scan this code to identify this physical spool. Save or print it using your phone’s image controls.</p>{button('Close',()=>setSpoolLabel(null))}</section></div>}
  </div>;
}

