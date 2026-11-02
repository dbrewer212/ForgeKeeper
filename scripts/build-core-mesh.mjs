import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const dirty=execFileSync('git',['status','--porcelain','--untracked-files=all','--','src','scripts/build-core-mesh.mjs','package.json','package-lock.json'],{encoding:'utf8'}).trim();
if(dirty)throw Error('Commit the Mesh source before building a provenance-stamped runtime bundle.');
const folder='mesh-delivery';
await mkdir(folder+'/licenses',{recursive:true});
await build({entryPoints:['src/mesh/coreHost.ts'],outfile:folder+'/foundry-mesh.cjs',
  bundle:true,platform:'node',target:'node22',format:'cjs',legalComments:'inline'});
const bundle=await readFile(folder+'/foundry-mesh.cjs');
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const manifest={schema:'foundry-mesh-core/1',source,repository:'dbrewer212/ForgeKeeper',
  file:'foundry-mesh.cjs',sha256:createHash('sha256').update(bundle).digest('hex'),minimum_node_major:22};
await writeFile(folder+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile(folder+'/SOURCE-COMMIT.txt',source+'\n');
for(const name of ['LICENSE-MIT','LICENSE-APACHE-2.0','LICENSE.spdx']) {
  await copyFile('node_modules/@tauri-apps/api/'+name,folder+'/licenses/tauri-api-'+name);
}
await writeFile(folder+'/NOTICE.txt','Foundry Mesh source: dbrewer212/ForgeKeeper, commit '+source+
  '. Existing Foundry ownership and licensing are unchanged. No relicensing is implied.\n'+
  'This bundle includes @tauri-apps/api, available under MIT OR Apache-2.0; notices accompany it.\n'+
  'The Node.js runtime is distributed separately with its upstream license.\n');
console.log(JSON.stringify(manifest));
