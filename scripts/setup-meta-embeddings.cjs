#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2).filter(v=>v!=='--');
const check=args.includes('--check');
if(args.includes('--help')){console.log('Usage: pnpm setup:meta-embeddings [--check]\nRun setup:mms first for the CPU Torch environment. Downloads ~180 MB of official Meta LASER2 files; no paid inference. --check never installs or downloads.');process.exit(0);}
if(args.some(v=>v!=='--check'))throw Error('Unknown option; use --help');
const python=path.join(root,'.venv-mms',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const manifest=require('../services/meta-embeddings/model-manifest.json');
const directory=path.join(root,'storage/meta-embeddings');
function run(argv){const r=spawnSync(python,argv,{cwd:root,stdio:'inherit',windowsHide:true});if(r.error||r.status!==0)throw Error('Resolve the dependency error and rerun setup:meta-embeddings.');}
async function verify(file,info){if(!fs.existsSync(file)||fs.statSync(file).size!==info.bytes)return false;const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex')===info.sha256;}
async function main(){
 if(!fs.existsSync(python))throw Error('Run pnpm setup:mms first to create the CPU Python environment.');
 if(!check)run(['-m','pip','install','--disable-pip-version-check','-r','services/meta-embeddings/requirements.txt']);
 run(['-c','import torch, sentencepiece, sacremoses; print("LASER2 dependencies ready")']);
 if(!check)fs.mkdirSync(directory,{recursive:true});
 for(const [name,info]of Object.entries(manifest.files)){
  const target=path.join(directory,name);
  if(await verify(target,info))continue;
  if(check)throw Error('Missing or invalid '+name+'; run pnpm setup:meta-embeddings.');
  const response=await fetch(manifest.origin+name,{signal:AbortSignal.timeout(600000)});
  if(!response.ok||!response.body)throw Error('Download failed: '+name);
  const partial=target+'.part';let size=0;
  const output=await fs.promises.open(partial,'w');
  try{for await(const chunk of response.body){size+=chunk.length;if(size>info.bytes)throw Error('Oversized model download');await output.writeFile(chunk);}}finally{await output.close();}
  if(!await verify(partial,info))throw Error('Model checksum failed: '+name);
  fs.renameSync(partial,target);
 }
 console.log('Pinned Meta LASER2 files verified. No server, worker or paid call started.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
