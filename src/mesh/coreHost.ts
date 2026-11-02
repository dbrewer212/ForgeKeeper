/** Foundry Core's private, transactional worker host for the existing Mesh runtime.
 * No network listener, shell dispatch, in-memory persistence fallback or printer authority.
 */
import { createInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import { FoundryMeshRuntime } from './runtime';
import type { MeshPersistence, MeshSnapshot } from './persistence';
import type { FoundryEvent, ActionResult, ActionRisk, WorkerIdentity } from './types';
import { createFoundryEvent } from './eventBus';
import { MeshEvents } from './events';
import { MeshCapabilities } from './catalog';

type Json = Record<string, unknown>;
interface Start {
  kind: 'start'; protocol: 'foundry-mesh-core/1';
  principal: { name: string; permissions: string[] };
  proposal: {
    id: string; action: string; state: string; fingerprint: string; reason: string;
    reviewed_by: string; reviewed_at: string; review_note: string; expires_at: string;
  };
}
const actions: Record<string, { permission: string; capability: string; risk: ActionRisk }> = {
  'project.annotate': { permission: 'annotate', capability: MeshCapabilities.foundryProjectWrite, risk:'moderate' },
  'alert.acknowledge': { permission: 'record', capability: MeshCapabilities.watcherAcknowledgeFinding, risk:'low' },
  'alert.resolve': { permission: 'record', capability: MeshCapabilities.watcherResolveFinding, risk:'moderate' },
};
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
let sequence=0, receivedStart=false;
let start!: (value: Start) => void;
const started = new Promise<Start>(resolve => { start=resolve; });
const lines=createInterface({input:stdin,crlfDelay:Infinity});
function send(value: unknown) { stdout.write(JSON.stringify(value)+'\n'); }
function rpc<T>(operation: string, payload: Json): Promise<T> {
  const id=++sequence;
  return new Promise<T>((resolve,reject)=>{
    pending.set(id,{resolve:value=>resolve(value as T),reject});
    send({kind:'rpc',id,operation,payload});
  });
}
lines.on('line',line=>{
  if(Buffer.byteLength(line,'utf8')>8*1024*1024) throw Error('Core transaction frame exceeds its bound.');
  const message=JSON.parse(line) as Json;
  if(message.kind==='start'&&!receivedStart) { receivedStart=true;start(message as unknown as Start);return; }
  if(message.kind!=='reply'||typeof message.id!=='number') throw Error('Invalid Core transaction reply.');
  const call=pending.get(message.id);
  if(!call) throw Error('Unexpected Core transaction reply.');
  pending.delete(message.id);
  if(message.ok===true)call.resolve(message.value);
  else call.reject(Error(typeof message.error==='string'?message.error:'Core worker operation failed.'));
});
lines.on('close',()=>{
  for(const call of pending.values())call.reject(Error('Core transaction closed before a verified result.'));
});
class CoreTransactionPersistence implements MeshPersistence {
  loadSnapshot(): Promise<MeshSnapshot|null> { return rpc('state.load',{}); }
  async saveSnapshot(snapshot: MeshSnapshot): Promise<void> { await rpc('state.save',{snapshot}); }
  async appendEvent(event: FoundryEvent): Promise<void> { await rpc('event.append',{event}); }
  readRecentEvents(limit=250): Promise<FoundryEvent[]> { return rpc('events.read',{limit}); }
}
async function main() {
  const input=await started;
  const proposal=input.proposal, principal=input.principal;
  if(input.protocol!=='foundry-mesh-core/1'||!proposal||!principal||
      typeof principal.name!=='string'||!principal.name||principal.name.length>200||
      !Array.isArray(principal.permissions)||!principal.permissions.includes('execute_action')) {
    throw Error('Invalid authenticated Core execution context.');
  }
  const action=actions[proposal.action];
  if(!action||!principal.permissions.includes(action.permission)||proposal.state!=='approved'||
      !proposal.reviewed_by||!proposal.reviewed_at||!proposal.review_note||
      !/^[0-9a-f-]{36}$/i.test(proposal.id)||!/^[0-9a-f]{64}$/i.test(proposal.fingerprint)||
      !Number.isFinite(Date.parse(proposal.expires_at))||Date.parse(proposal.expires_at)<=Date.now()) {
    throw Error('A current, explicitly reviewed Core action is required.');
  }
  const runtime=new FoundryMeshRuntime(new CoreTransactionPersistence());
  await runtime.initialize();
  const workerId='core-link:'+principal.name;
  const existing=runtime.workers.get(workerId);
  const identity: WorkerIdentity=existing ? {
    ...existing.identity,
    capabilities:[action.capability],
  } : {
    id:workerId,name:'Authenticated Core client '+principal.name,kind:'service',
    version:'foundry-mesh-core/1',capabilities:[action.capability],enabled:true,commissioningState:'active',
  };
  if(existing)runtime.workers.updateIdentity(identity);
  else {
    runtime.workers.register(identity);
    await runtime.events.publish(createFoundryEvent({
      type:MeshEvents.workerRegistered,sourceWorkerId:'foundry-core',subjectId:workerId,
      correlationId:proposal.id,payload:{capabilities:identity.capabilities,authenticatedBy:'foundry-core'},
    }));
  }
  if(!runtime.permissions.listRules().some(rule=>rule.capabilityId===action.capability)) {
    runtime.permissions.addRule({
      id:'core-human-review:'+action.capability,capabilityId:action.capability,
      effect:'approval-required',reason:'Core commands require explicit human review through Mesh.',
    });
  }
  const toolName='core.reviewed.'+proposal.action;
  runtime.tools.register<{proposalId:string;fingerprint:string},Json>({
    name:toolName,capabilityId:action.capability,risk:action.risk,
    description:'Apply one immutable, human-reviewed Core action and verify its durable result.',
    inputSchema:{type:'object',required:['proposalId','fingerprint'],additionalProperties:false,
      properties:{proposalId:{type:'string'},fingerprint:{type:'string'}}},
  },async(payload,request,worker)=>{
    if(Object.keys(payload).sort().join(',')!=='fingerprint,proposalId'||
        payload.proposalId!==proposal.id||payload.fingerprint!==proposal.fingerprint||
        worker.id!==workerId||request.correlationId!==proposal.id) {
      throw Error('Mesh worker request does not match the reviewed Core target.');
    }
    const result=await rpc<Json>('worker.execute',{
      proposalId:payload.proposalId,fingerprint:payload.fingerprint,requestId:request.id,workerId:worker.id,
    });
    if(result.verified!==true||result.fingerprint!==proposal.fingerprint||
        (result.proposal as Json)?.id!==proposal.id||(result.proposal as Json)?.state!=='executed') {
      throw Error('Core did not return a verified durable worker result.');
    }
    return result;
  });
  const invocation=await runtime.tools.invoke({
    toolName,requesterWorkerId:workerId,correlationId:proposal.id,
    reason:proposal.reason,payload:{proposalId:proposal.id,fingerprint:proposal.fingerprint},
  });
  let result: ActionResult|undefined=invocation.result;
  if(invocation.approvalId) {
    // Evidence comes from Core's locked, previously authorized review record,
    // never from an execution request body or an AI-generated approval claim.
    result=await runtime.coordinator.approve(invocation.approvalId,
      'Core review by '+proposal.reviewed_by+' at '+proposal.reviewed_at+': '+proposal.review_note);
  }
  if(!result)throw Error('Mesh did not produce an execution result.');
  send({
    kind:'done',protocol:'foundry-mesh-core/1',requestId:invocation.evaluation.request.id,
    approvalId:invocation.approvalId??null,workerId,toolName,result,
  });
}
main().catch(error=>{
  stderr.write('Foundry Mesh host failed: '+(error instanceof Error?error.message:'Unknown failure')+'\n');
  send({kind:'failure',error:'The Mesh runtime could not produce a verified execution result.'});
  process.exitCode=1;
}).finally(()=>{lines.close();stdin.pause();});
