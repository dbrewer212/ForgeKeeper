import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CoreFoundry from './CoreFoundry';

const mocks=vi.hoisted(()=>({request:vi.fn(),status:vi.fn()}));
vi.mock('./coreClient',()=>({
 coreRequest:mocks.request,coreStatus:mocks.status,forgetCore:vi.fn(),pairCore:vi.fn(),readLabel:vi.fn(),scanCode:vi.fn(),
}));
let view:ReactTestRenderer|undefined;
beforeEach(()=>{
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});
 mocks.status.mockResolvedValue({paired:true,endpoint:'https://desktop.invalid:8765'});
 mocks.request.mockImplementation(async(path:string)=>{
  if(path==='/v1/state')return {resources:{},jobs:[]};
  if(path==='/v1/me')return {id:'client-fixture',scopes:['read.proposals','proposals.create']};
  if(path==='/v1/projects')return [{id:'project',name:'Fixture project',latest_revision:1}];
  if(path==='/v1/machines')return [{id:'printer',name:'Fixture printer',expected_state:'AVAILABLE',observed_state:'unknown'}];
  if(path==='/v1/production')return [{job:{id:'job',state:'queued',material:'PLA',profile:'Fixture profile',machine_id:'printer'},checks:[]}];
  return [];
 });
});
afterEach(()=>{if(view)act(()=>view!.unmount());view=undefined;vi.clearAllMocks();vi.unstubAllGlobals();});
async function navigate(page:string){
 const button=view!.root.findByType('nav').findAllByType('button').find(button=>button.props.children===page);
 expect(button).toBeDefined();
 await act(async()=>{button!.props.onClick();});
}
describe('mobile workspace navigation',()=>{
 it.each(['Production','OpenClaw'])('does not render printer records in the %s workspace',async destination=>{
  await act(async()=>{view=create(<CoreFoundry onLegacy={()=>{}}/>);});
  await navigate('Bastion');
  expect(mocks.request).toHaveBeenCalledWith('/v1/machines');
  expect(JSON.stringify(view!.toJSON())).toContain('Fixture printer');
  await navigate(destination);
  expect(view!.root.findByType('nav')).toBeDefined();
  expect(JSON.stringify(view!.toJSON())).not.toContain('Fixture printer');
  expect(mocks.request).toHaveBeenCalledWith(destination==='Production'?'/v1/production':'/v1/proposals');
 });
});

it('explains intentional gaming pause instead of suggesting a broken telemetry connection',async()=>{
 const previous=mocks.request.getMockImplementation()!;
 mocks.request.mockImplementation(async(path:string)=>path==='/v1/state'?{resources:{},jobs:[],monitoring_paused:true,telemetry_state:'stale'}:previous(path));
 await act(async()=>{view=create(<CoreFoundry onLegacy={()=>{}}/>);});
 await navigate('Bastion');
 const rendered=JSON.stringify(view!.toJSON());
 expect(rendered).toContain('Desktop gaming mode has paused host monitoring.');
 expect(rendered).toContain('Paused');
 expect(rendered).not.toContain('stale');
});

it('shows the authenticated public client identity for targeted revocation',async()=>{
 await act(async()=>{view=create(<CoreFoundry onLegacy={()=>{}}/>);});
 await navigate('Connect');
 expect(JSON.stringify(view!.toJSON())).toContain('client-fixture');
});
