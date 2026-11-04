// Real SQL and real media search controller; synthetic media preparation/model only.
const path=require('path');
const fs=require('fs');
const os=require('os');
const assert=require('node:assert/strict');
const {randomUUID}=require('crypto');
module.exports=async function checkConversation(client,db,owners,asset,self,uncle,auth) {
  const api=path.resolve(__dirname,'../apps/api');
  const load=name=>require(require.resolve(name,{paths:[api]}));
  const {Module}=load('@nestjs/common');
  const {ConfigService}=load('@nestjs/config');
  const {NestFactory,APP_FILTER}=load('@nestjs/core');
  const {FastifyAdapter}=load('@nestjs/platform-fastify');
  const {MediaController}=require(path.join(api,'src/modules/media/media.controller'));
  const {MediaService}=require(path.join(api,'src/modules/media/media.service'));
  const {PeopleSearchService}=require(path.join(api,'src/modules/people/people-search.service'));
  const {ConversationVerifierService}=require(path.join(api,'src/modules/people/conversation-verifier.service'));
  const {parseConversation}=require(path.join(api,'src/modules/pipeline/conversation-evidence'));
  const {AuthGuard}=require(path.join(api,'src/modules/auth/auth.guard'));
  const {AuthService}=require(path.join(api,'src/modules/auth/auth.service'));
  const {ApiErrorsFilter}=require(path.join(api,'src/common/api-errors'));
  const source=asset+'-talk';
  await client.query(`INSERT INTO media_assets(id,user_id,original_filename,checksum,duration)
    VALUES($1,$2,'conversation-fixture.mp4','test-only',20)`,[source,owners[0]]);
  const tagIds=[randomUUID(),randomUUID()],cueIds=[randomUUID(),randomUUID()];
  for (let i=0;i<2;i++) {
    await client.query(`INSERT INTO person_appearances(id,user_id,person_id,asset_id,start_s,end_s,frame_s,box)
      VALUES($1,$2,$3,$4,0,10,$5,$6)`,[tagIds[i],owners[0],[self.id,uncle.id][i],source,i+1,[i*0.5,0,0.3,0.4]]);
    await client.query(`INSERT INTO media_observations(id,user_id,asset_id,observation_type,timestamp_start,timestamp_end,raw_data)
      VALUES($1,$2,$3,'transcript',$4,$5,$6)`,[cueIds[i],owners[0],source,3+i*2,4+i*2,JSON.stringify({text:i?'Hi':'Hello'})]);
  }
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-conversation-http-'));
  const durations=new Map();
  let calls=0,mutate=false,silent=false,uncertain=false;
  const ffmpeg={probeMetadata:async file=>({duration:durations.get(file),hasAudio:!silent}),
    extractInspectionFrame:async(_clip,file)=>fs.writeFileSync(file,'synthetic-frame')};
  const ai={isConfigured:()=>true,verifyConversation:async evidence=>{
    calls++;
    if (uncertain) return {status:'uncertain',scope:'conversation_between_tagged_people',turns:[],explanation:'No reliable attribution'};
    const turns=cueIds.map((cueId,i)=>{
      const anchor=evidence.anchors.find(a=>a.personId===[self.id,uncle.id][i]);
      return {personId:anchor.personId,anchorId:anchor.anchorId,cueId,start:3+i*2-evidence.start,end:4+i*2-evidence.start,
        observation:'Synthetic fixture: labelled participant visibly addresses the other',addressesOtherParticipant:true};
    });
    const result=parseConversation({status:'supported',explanation:'Synthetic grounded exchange',turns},evidence);
    if (mutate) await client.query("UPDATE person_appearances SET status='rejected',updated_at=NOW() WHERE id=$1",[tagIds[0]]);
    return result;
  }};
  const config=new ConfigService({STORAGE_ROOT:root,SEARCH_DEADLINE_MS:30000});
  const media=Object.create(MediaService.prototype);
  Object.assign(media,{db,configService:config,peopleSearchService:new PeopleSearchService(db),
    conversationVerifier:new ConversationVerifierService(db,ai,ffmpeg,config),
    prepareSearchEvidence:async candidate=>{
      const scratch=fs.mkdtempSync(path.join(root,'evidence-'));
      const clipPath=path.join(scratch,'sequence.mp4');fs.writeFileSync(clipPath,'synthetic-video');
      durations.set(clipPath,candidate.endTime-candidate.startTime);
      return {kind:'original',clipPath,frames:[],cleanup:()=>{
        assert.equal(path.dirname(path.resolve(scratch)),path.resolve(root));fs.rmSync(scratch,{recursive:true,force:true});
      }};
    }});
  class FixtureModule {}
  Module({controllers:[MediaController],providers:[AuthGuard,{provide:AuthService,useValue:auth},
    {provide:MediaService,useValue:media},{provide:ConfigService,useValue:config},
    {provide:APP_FILTER,useClass:ApiErrorsFilter}]})(FixtureModule);
  const app=await NestFactory.create(FixtureModule,new FastifyAdapter(),{logger:false});
  app.setGlobalPrefix('api/v1');
  try {
    await app.init();const server=app.getHttpAdapter().getInstance();await server.ready();
    const request=async(payload,status=200,owner=0)=>{
      const result=await server.inject({method:'POST',url:'/api/v1/media/search',payload,
        headers:{authorization:`Bearer ${auth.createToken({id:owners[owner],email:'fixture@example.invalid'})}`}});
      assert.equal(result.statusCode,status,`Conversation HTTP ${result.statusCode}, expected ${status}`);return result.json();
    };
    const query={query:'where I was talking to my uncle',assetId:source,phase:'retrieve'};
    const retrieved=await request(query);assert.equal(retrieved.results.length,1);assert.equal(calls,0);
    query.phase='verify';
    const checked=await request(query);
    assert.equal(checked.results[0].conversationVerification.status,'supported');
    assert.deepEqual(checked.results[0].conversationVerification.turns.map(t=>t.start),[3,5]);
    assert.equal(checked.hasExactMatch,false);assert.equal(checked.results[0].stage2Verified,false);
    uncertain=true;assert.equal((await request(query)).results[0].conversationVerification.status,'uncertain');uncertain=false;
    const prior=calls;silent=true;assert.equal((await request(query)).results[0].conversationVerification.status,'insufficient_evidence');
    assert.equal(calls,prior);silent=false;
    mutate=true;
    assert.equal((await request(query)).results[0].conversationVerification.status,'insufficient_evidence');mutate=false;
    await client.query("UPDATE person_appearances SET status='confirmed',updated_at=NOW() WHERE id=$1",[tagIds[0]]);
    const ambiguous=randomUUID();
    await client.query("INSERT INTO people(id,user_id,name,aliases) VALUES($1,$2,'Uncle Peter',ARRAY['my uncle'])",[ambiguous,owners[0]]);
    assert.equal((await request(query)).identitySearch.status,'needs_clarification');
    const selected=await request({...query,people:{selections:[{reference:'my uncle',personId:uncle.id}]}});
    assert.equal(selected.results[0].conversationVerification.status,'supported');
    await client.query('DELETE FROM people WHERE id=$1',[ambiguous]);
    await request({...query,people:{query:'override validated query'}},400);
    const denied=await request({...query,people:{references:['me','my uncle']}},200,1);
    assert.equal(denied.results.length,0);
    assert.equal(fs.readdirSync(root).length,0,'Temporary synthetic evidence must be cleaned');
    console.log('PASS: conversation search HTTP + real PostgreSQL; retrieve/verify routing, anchored turn times, ambiguity selection, stale-tag rejection, missing audio, owner isolation. Model and decoder were fixture-only.');
  } finally {
    await app.close();
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('brisky-conversation-http-'));
    fs.rmSync(root,{recursive:true,force:true});
  }
};
