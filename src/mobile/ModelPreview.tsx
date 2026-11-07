import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {PLYLoader} from 'three/examples/jsm/loaders/PLYLoader.js';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {checkPreview} from './previewPolicy';
import type {CachedAsset} from './assetTransfer';
export default function ModelPreview({asset}:{asset:CachedAsset}){
 const host=useRef<HTMLDivElement>(null),[status,setStatus]=useState('Preparing read-only geometry…');
 useEffect(()=>{
  let disposed=false,renderer:THREE.WebGLRenderer|undefined,controls:OrbitControls|undefined,observer:ResizeObserver|undefined,model:THREE.Object3D|undefined;
  const cleanModel=(root:THREE.Object3D)=>root.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
  async function load(){try{
   checkPreview(asset.data,asset.format);const buffer=new Uint8Array(asset.data).buffer;
   if(asset.format==='glb'){
    const manager=new THREE.LoadingManager();manager.setURLModifier(()=>{throw Error('External model references are disabled.');});
    const loader=new GLTFLoader(manager);loader.register(parser=>({name:'foundry-neutral-preview',beforeRoot(){
     parser.json.materials=(parser.json.materials||[]).map(()=>({pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:.7}}));
     parser.json.images=[];parser.json.textures=[];return null;
    }}));model=(await loader.parseAsync(buffer,'')).scene;
   }else{const geometry=asset.format==='ply'?new PLYLoader().parse(buffer):new STLLoader().parse(buffer);model=new THREE.Mesh(geometry);}
   if(disposed){cleanModel(model);return;}
   let triangles=0;model.traverse(object=>{if(object instanceof THREE.Mesh){triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position')?.count??0)/3;
    const positions=object.geometry.getAttribute('position');if(!positions||!Array.from(positions.array).every(Number.isFinite))throw Error('Invalid geometry coordinates.');
    const indices=object.geometry.index;if(indices)for(let i=0;i<indices.count;i++){const index=indices.getX(i);if(!Number.isInteger(index)||index<0||index>=positions.count)throw Error('Invalid model vertex references.');}
    for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();object.material=new THREE.MeshStandardMaterial({color:0xc5cbd1,metalness:.08,roughness:.65,side:THREE.DoubleSide});object.geometry.computeVertexNormals();
   }});
   if(triangles>250000)throw Error('Use the desktop for this model’s detail level.');
   const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),radius=size.length()/2;
   if(!Number.isFinite(radius)||radius<=0)throw Error('Model bounds are invalid.');
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x20262e);scene.add(model,new THREE.HemisphereLight(0xffffff,0x59616b,2));
   for(const [x,y,z,intensity] of [[2,3,4,3],[-3,1,-2,2]]){const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(x,y,z);scene.add(light);}
   renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.current!.appendChild(renderer.domElement);
   const camera=new THREE.PerspectiveCamera(38,1,radius/1000,radius*100);camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(1,-1,.7).normalize().multiplyScalar(radius*3.5));
   controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(center);controls.minDistance=radius*.1;controls.maxDistance=radius*20;controls.update();
   const draw=()=>{if(!disposed&&renderer)renderer.render(scene,camera);};controls.addEventListener('change',draw);
   const resize=()=>{if(!host.current||!renderer)return;const width=host.current.clientWidth;renderer.setSize(width,340);camera.aspect=width/340;camera.updateProjectionMatrix();draw();};
   observer=new ResizeObserver(resize);observer.observe(host.current!);resize();setStatus(`${Math.round(triangles).toLocaleString()} triangles · drag to rotate; pinch to zoom; two fingers to pan. Neutral geometry view; original source retained.`);
  }catch(error){if(model)cleanModel(model);if(!disposed)setStatus(String(error));}}
  void load();return()=>{disposed=true;observer?.disconnect();controls?.dispose();if(model)cleanModel(model);if(renderer){renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
 },[asset]);
 return <article><h3>3D geometry</h3><div ref={host} style={{width:'100%',minHeight:340,touchAction:'none'}}/><p>{status}</p><p className="muted">Visual inspection does not confirm scale, closed topology or print readiness.</p></article>;
}
