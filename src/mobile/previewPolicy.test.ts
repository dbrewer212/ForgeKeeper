import {expect,it} from 'vitest';
import {checkPreview} from './previewPolicy';
function glb(patch:object={}){const document={asset:{version:'2.0'},buffers:[{byteLength:36}],accessors:[{count:3}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0}],...patch};const json=new TextEncoder().encode(JSON.stringify(document)),padded=Math.ceil(json.length/4)*4,data=new Uint8Array(20+padded);data.fill(32,20);const view=new DataView(data.buffer);[0x46546c67,2,data.length,padded,0x4e4f534a].forEach((value,index)=>view.setUint32(index*4,value,true));data.set(json,20);return data;}
it('allows bounded embedded geometry and rejects references, excessive detail and cyclic hierarchies',()=>{
 expect(()=>checkPreview(glb(),'glb')).not.toThrow();
 for(const patch of [{buffers:[{uri:'https://example.invalid/private'}]},{accessors:[{count:10000000}]},{nodes:[{children:[0]}]},{extensionsUsed:['EXT_mesh_gpu_instancing']}])expect(()=>checkPreview(glb(patch),'glb')).toThrow();
});
it('bounds shared model hierarchy work and rejects nontriangle primitives',()=>{
 const nodes=Array.from({length:64},(_,index)=>index===63?{}:{children:[index+1,index+1]});
 expect(()=>checkPreview(glb({nodes}),'glb')).not.toThrow();nodes.push({});nodes[63]={children:[64]};expect(()=>checkPreview(glb({nodes}),'glb')).toThrow();
 expect(()=>checkPreview(glb({meshes:[{primitives:[{mode:0,attributes:{POSITION:0}}]}]}),'glb')).toThrow();
});
it('requires bounded triangle payloads and valid indices for PLY before parsing',()=>{
 const header=new TextEncoder().encode('ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n'),data=new Uint8Array(header.length+36+13);data.set(header);data[header.length+36]=3;const view=new DataView(data.buffer);[0,1,2].forEach((value,index)=>view.setUint32(header.length+37+4*index,value,true));
 expect(()=>checkPreview(data,'ply')).not.toThrow();data[header.length+36]=255;expect(()=>checkPreview(data,'ply')).toThrow();data[header.length+36]=3;view.setUint32(header.length+37,100,true);expect(()=>checkPreview(data,'ply')).toThrow();
 expect(()=>checkPreview(data.slice(0,-1),'ply')).toThrow();
});
