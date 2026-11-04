#!/usr/bin/env node
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2).filter(v=>v!=='--'),check=args.includes('--check');
if(args.includes('--help')){console.log('Usage: pnpm setup:mms [--check] [--python PATH]\nCreates .venv-mms, installs CPU PyTorch/Transformers, downloads and verifies pinned Meta MMS weights (~145 MB).\nRequires Python 3.11–3.14; no Docker or inference credits. Models/dependencies may need several hundred MB.\n--check never installs/downloads. CC-BY-NC-4.0 model licence.');process.exit(0);}
const option=args.indexOf('--python'),python=option>=0?args[option+1]:process.platform==='win32'?'python':'python3';
if(!python||args.some((arg,i)=>!['--check','--python'].includes(arg)&&!(option>=0&&i===option+1)))throw Error('Unknown option; use --help');
const env=path.join(root,'.venv-mms'),runtime=path.join(env,process.platform==='win32'?'Scripts/python.exe':'bin/python'),models=path.join(root,'storage/mms-models/eng');
function run(bin,argv){const result=spawnSync(bin,argv,{cwd:root,stdio:'inherit',windowsHide:true});if(result.error||result.status!==0)throw Error('MMS setup failed; resolve the displayed error and rerun setup:mms.');}
try{
 if(!check){run(python,['-c',"import sys; assert (3,11)<=sys.version_info[:2]<=(3,14), 'Use Python 3.11 to 3.14'"]);if(!fs.existsSync(runtime))run(python,['-m','venv',env]);run(runtime,['-m','pip','install','--disable-pip-version-check','--timeout','90','--retries','2','torch==2.10.0','--index-url','https://download.pytorch.org/whl/cpu']);run(runtime,['-m','pip','install','--disable-pip-version-check','--timeout','90','--retries','2','-r','services/mms-tts/requirements.txt']);}
 if(!fs.existsSync(runtime))throw Error('Run pnpm setup:mms first.');
 run(runtime,['-c',"import torch, transformers; print('CPU torch',torch.__version__,'Transformers',transformers.__version__)"]);
 if(!check)run(process.execPath,['services/mms-tts/download_weights.cjs']);
 run(runtime,['services/mms-tts/prepare_models.py','--directory',models,...(check?['--check']:[])]);
 console.log('MMS runtime ready; no API, worker or paid session was started.');
}catch(error){console.error(error.message);process.exitCode=1;}
