const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('registers consumers only after application initialization and reconciliation',async()=>{
  const events=[],env={};class BullRegistrar{}
  const app={get:type=>{assert.equal(type,BullRegistrar);return {register:()=>events.push('consume')};},enableShutdownHooks:()=>events.push('shutdown')};
  const engineRequire=name=>{
    if(name==='reflect-metadata')return {};
    if(name==='@nestjs/core')return {NestFactory:{createApplicationContext:async()=>{assert.equal(env.BRISKY_MANUAL_QUEUE_REGISTRATION,'true');await Promise.resolve();events.push('connectors-and-reconciliation-ready');return app;}}};
    if(name==='@nestjs/bullmq')return {BullRegistrar};
    if(name==='./dist/app.module')return {AppModule:{}};
    throw Error('Unexpected import');
  };
  engineRequire.resolve=name=>name;
  const fakeRequire=name=>{if(name==='reflect-metadata')return {};assert.equal(name,'node:module');return {createRequire:()=>engineRequire};};fakeRequire.resolve=()=> 'fixture-package';
  vm.runInNewContext(fs.readFileSync(__dirname+'/main.cjs','utf8'),{require:fakeRequire,process:{env,argv:['node','main.cjs']},console:{log:()=>{},error:()=>{throw Error('Startup failed');}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events,['connectors-and-reconciliation-ready','consume','shutdown']);
});
