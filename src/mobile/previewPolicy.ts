const faces=250000,vertices=750000;
export function checkPreview(data:Uint8Array,format:string){
 if(data.byteLength>16*1024*1024)throw Error('Use the desktop for models larger than 16 MB.');
 if(format==='ply'){
  const header=new TextDecoder().decode(data.slice(0,16384)),end=header.indexOf('end_header');
  if(!header.startsWith('ply')||end<0)throw Error('Invalid or oversized PLY header.');
  const text=header.slice(0,end),counts:Record<string,number>={};
  for(const [kind,max] of [['vertex',vertices],['face',faces]] as const){const matches=[...text.matchAll(new RegExp(`element ${kind} (\\d+)`,'g'))],count=Number(matches[0]?.[1]);if(matches.length!==1||!Number.isInteger(count)||count<1||count>max)throw Error('Use the desktop for this model’s detail level.');counts[kind]=count;}
  const format=/format (binary_little_endian|binary_big_endian) 1\.0/.exec(text)?.[1];
  if(!format||[...text.matchAll(/^element (\w+)/gm)].some(match=>!['vertex','face'].includes(match[1])))throw Error('Phone PLY previews require binary triangle geometry. Use the desktop for other PLY variants.');
  const sections=text.split(/element (?:vertex|face) \d+\r?\n/);
  if(sections.length!==3||!/^property list (?:uchar|uint8) (?:int|int32|uint|uint32) vertex_indices\s*$/.test(sections[2].trim()))throw Error('Phone PLY previews require triangle face indices.');
  const widths:Record<string,number>={char:1,uchar:1,int8:1,uint8:1,short:2,ushort:2,int16:2,uint16:2,int:4,uint:4,int32:4,uint32:4,float:4,float32:4,double:8,float64:8};
  let stride=0;for(const line of sections[1].trim().split(/\r?\n/)){const match=/^property (\w+) \w+$/.exec(line);if(!match||!widths[match[1]])throw Error('Unsupported PLY vertex properties.');stride+=widths[match[1]];}
  let beginning=end+10;if(data[beginning]===13)beginning++;if(data[beginning++]!==10)throw Error('Invalid PLY header terminator.');
  const start=beginning+counts.vertex*stride;if(start+counts.face*13!==data.length)throw Error('PLY payload size does not match its geometry.');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),little=format==='binary_little_endian';
  for(let offset=start;offset<data.length;offset+=13){if(data[offset]!==3)throw Error('Only triangular PLY faces can be previewed.');for(let corner=0;corner<3;corner++)if(view.getUint32(offset+1+4*corner,little)>=counts.vertex)throw Error('Invalid PLY vertex reference.');}
 }else if(format==='stl'){
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  if(data.length>=84&&84+view.getUint32(80,true)*50===data.length){if(view.getUint32(80,true)>faces)throw Error('Use the desktop for this model’s detail level.');}
  else {const count=(new TextDecoder().decode(data).match(/\bfacet\s+normal\b/g)||[]).length;if(!count||count>faces)throw Error('Invalid or overly detailed STL.');}
 }else if(format==='glb'){
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  if(data.length<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==data.length||view.getUint32(16,true)!==0x4e4f534a)throw Error('Invalid binary glTF model.');
  const size=view.getUint32(12,true);if(size>2*1024*1024||20+size>data.length)throw Error('Model manifest exceeds its limit.');
  const json=JSON.parse(new TextDecoder().decode(data.slice(20,20+size)));
  if((json.extensionsUsed||[]).includes('EXT_mesh_gpu_instancing'))throw Error('Instanced models require desktop inspection.');
  if((json.buffers||[]).some((buffer:any)=>buffer.uri||buffer.byteLength>16*1024*1024))throw Error('External model references are disabled.');
  if((json.accessors||[]).some((item:any)=>!Number.isInteger(item.count)||item.count<0||item.count>vertices))throw Error('Model geometry exceeds its limit.');
  let count=0;for(const mesh of json.meshes||[])for(const primitive of mesh.primitives||[]){if(primitive.mode!==undefined&&primitive.mode!==4)throw Error('Only triangle models can be previewed.');count+=(json.accessors?.[primitive.indices??primitive.attributes?.POSITION]?.count||0)/3;}
  if(!count||count>faces||(json.nodes||[]).length>2000)throw Error('Use the desktop for this model’s detail level.');
  const memo=new Map<number,number>();let edges=0;
  const height=(index:number,path:Set<number>):number=>{
   if(!Number.isInteger(index)||index<0||index>=(json.nodes||[]).length||path.size>64||path.has(index))throw Error('Invalid or excessive model hierarchy.');
   if(memo.has(index))return memo.get(index)!;const next=new Set(path);next.add(index);let depth=1;
   for(const child of json.nodes[index].children||[]){if(++edges>10000)throw Error('Model hierarchy exceeds its limit.');depth=Math.max(depth,1+height(child,next));}
   if(depth>64)throw Error('Model hierarchy exceeds its limit.');memo.set(index,depth);return depth;
  };
  for(let index=0;index<(json.nodes||[]).length;index++)height(index,new Set());
 }else throw Error('Preview supports PLY, STL and embedded GLB geometry. Use the desktop for other formats.');
}
