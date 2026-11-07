import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import CanonLibrary from './CanonLibrary';
const mocks=vi.hoisted(()=>({request:vi.fn(),download:vi.fn()}));
vi.mock('./coreClient',()=>({coreRequest:mocks.request}));
vi.mock('./assetTransfer',()=>({downloadAsset:mocks.download,ownerKey:()=> 'fixture'}));
let view:ReactTestRenderer|undefined;
const record=(id:string)=>({id,name:id,canonStatus:'Locked',authorityBasis:'Library Assets',identity:'Retained identity '+id,forbiddenDrift:['Do not add limbs'],assetLinks:[{assetId:'IMAGE-'+id,core_asset_id:id,source_sha256:'fixture',role:'Primary Authority'}]});
beforeEach(()=>{vi.useFakeTimers();mocks.request.mockResolvedValue({items:[record('A'),record('B')],total:2,next_offset:null});});
afterEach(()=>{if(view)act(()=>view!.unmount());view=undefined;vi.useRealTimers();vi.clearAllMocks();});
async function open(){await act(async()=>{view=create(<CanonLibrary connection={{client_id:'fixture',endpoint:'https://fixture.invalid'}} scopes={['assets.download']}/>);});await act(async()=>{await vi.advanceTimersByTimeAsync(300);});}
it('shows retained authority levels, rules and explicit image roles',async()=>{
 await open();await act(async()=>{view!.root.findAllByType('button').find(b=>b.props.children==='Read character authority')!.props.onClick();});
 const text=JSON.stringify(view!.toJSON());expect(text).toContain('Locked');expect(text).toContain('Do not add limbs');expect(text).toContain('Primary Authority');expect(text).not.toContain('Production Approved');
});
it('discards an old reference reply after the operator selects another character',async()=>{
 let finish:(value:any)=>void=()=>{};mocks.download.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await open();await act(async()=>{view!.root.findAllByType('button').filter(b=>b.props.children==='Read character authority')[0].props.onClick();});
 await act(async()=>{void view!.root.findAllByType('button').find(b=>b.props.children==='View original reference')!.props.onClick();});
 await act(async()=>{view!.root.findAllByType('button').filter(b=>b.props.children==='Read character authority')[1].props.onClick();});
 await act(async()=>{finish({sha256:'fixture',format:'png',data:new Uint8Array([1])});await Promise.resolve();});
 expect(view!.root.findAllByType('img')).toHaveLength(0);expect(JSON.stringify(view!.toJSON())).toContain('Retained identity B');
});
