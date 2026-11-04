#!/usr/bin/env node
/** Explicit local setup only. API/worker startup never downloads models. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2).filter(a=>a!=='--');
let check=false,python=process.platform==='win32'?'python':'python3',models=path.join(root,'storage','face-models');
for(let i=0;i<args.length;i++){
 if(args[i]==='--help'){console.log('Usage: node scripts/setup-face-recognition.cjs [--check] [--python PATH] [--models-dir PATH]\nSetup creates .venv-face, installs isolated dependencies and verifies/downloads pinned models.\n--check performs no installs/downloads. Requires Python 3.10+; no Docker or inference credits.');process.exit(0);}
 if(args[i]==='--check')check=true;
 else if(args[i]==='--python'&&args[i+1])python=args[++i];
 else if(args[i]==='--models-dir'&&args[i+1])models=path.resolve(root,args[++i]);
 else{console.error('Unknown/incomplete option. Use --help.');process.exit(1);}
}
function run(binary,argv){const result=spawnSync(binary,argv,{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,...(check?{PYTHONDONTWRITEBYTECODE:'1'}:{})}});if(result.error||result.status!==0)throw Error('Setup step failed; fix the displayed issue and rerun setup:faces.');}
try{
 const env=path.join(root,'.venv-face'),runtime=path.join(env,process.platform==='win32'?'Scripts/python.exe':'bin/python');
 if(!check){
  run(python,['-c',"import sys; assert sys.version_info>=(3,10), 'Python 3.10 or newer is required'"]);
  if(!fs.existsSync(runtime))run(python,['-m','venv',env]);
  // Newer pip can resume interrupted wheel transfers; upgrading stays inside this venv.
  run(runtime,['-m','pip','install','--disable-pip-version-check','--timeout','90','--retries','2','pip>=25.2']);
  run(runtime,['-m','pip','install','--disable-pip-version-check','--timeout','90','--retries','2','--resume-retries','5','-r',path.join(root,'services/face-recognition/requirements.txt')]);
 }
 if(!fs.existsSync(runtime))throw Error('Face environment missing. Run pnpm setup:faces first.');
 run(runtime,['-c',"import cv2; assert hasattr(cv2,'FaceDetectorYN') and hasattr(cv2,'FaceRecognizerSF'); print('OpenCV runtime:',cv2.__version__)"]);
 run(runtime,[path.join(root,'services/face-recognition/prepare_models.py'),'--directory',models,...(check?['--check']:[])]);
 console.log('Face runtime ready. Enable FACE_RECOGNITION_ENABLED on API/face-worker hosts. No workers or scans were started.');
}catch(error){console.error(error.message);process.exitCode=1;}
