// Local PostgreSQL + real Nest/Fastify routes, with fixture-only search/model providers.
const path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const api=path.resolve(__dirname,'../apps/api');
require(require.resolve('ts-node',{paths:[api]})).register({project:path.join(api,'tsconfig.json'),transpileOnly:true});
const dependency=name=>require(require.resolve(name,{paths:[api]}));
const {Module}=dependency('@nestjs/common'),{NestFactory}=dependency('@nestjs/core'),{FastifyAdapter}=dependency('@nestjs/platform-fastify'),{Pool}=dependency('pg');
const {ConversationController}=require(path.join(api,'src/modules/conversation/conversation.controller'));
const {ConversationService}=require(path.join(api,'src/modules/conversation/conversation.service'));
const {MomentThumbnailService}=require(path.join(api,'src/modules/media/moment-thumbnail.service'));
const {MediaService}=require(path.join(api,'src/modules/media/media.service'));
const {SaasSessionGuard}=require(path.join(api,'src/modules/conversation/saas-session.guard'));
const {AuthGuard}=require(path.join(api,'src/modules/auth/auth.guard'));
const {AuthService}=require(path.join(api,'src/modules/auth/auth.service'));
const {DatabaseService}=require(path.join(api,'src/modules/database/database.service'));
const {parseSpaceReply}=require(path.join(api,'src/modules/pipeline/space-conversation'));
const {ApiErrorsFilter}=require(path.join(api,'src/common/api-errors'));

(async()=>{
 const url=process.env.SAAS_DATABASE_URL;if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Local database required');
 const pool=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});const owner=randomUUID(),other=randomUUID(),asset='c-'+owner,foreign='c-'+other,token=randomBytes(32).toString('base64url');let app;
 try{
  await pool.query("INSERT INTO public.users(id,email,password_hash) VALUES($1,$2,'!fixture'),($3,$4,'!fixture')",[owner,owner+'@example.invalid',other,other+'@example.invalid']);
  await pool.query("INSERT INTO public.media_assets(id,user_id,original_filename,checksum,duration) VALUES($1,$2,'discussion.mp4',$1,100),($3,$4,'private.mp4',$3,100)",[asset,owner,foreign,other]);
  await pool.query("INSERT INTO public.media_segments(id,asset_id,user_id,start_time,end_time,title,description,transcript_text) VALUES($1,$2,$3,10,20,'Prototype plan','A meeting','We will ship on Friday.'),($4,$5,$6,10,20,'Private','Do not expose this','Private words')",['seg-'+owner,asset,owner,'seg-'+other,foreign,other]);
  await pool.query("INSERT INTO saas.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),owner]);
  const db={query:(sql,params)=>pool.query(sql,params)};let calls=0;
  const ai={isConfigured:()=>true,spaceConversation:async input=>{calls++;return parseSpaceReply(input.phase==='plan'?{action:'search',searchQuery:'prototype shipping discussion',text:'',citedEvidenceIds:[]}:{action:'reply',text:'They discussed shipping the prototype on Friday.',searchQuery:'',citedEvidenceIds:[input.evidence[0].id]},input);}};
  const media={searchDetailed:async(_query,_asset,_limit,userId)=>{assert.equal(userId,owner);return{searchStatus:'complete',results:[{assetId:asset,startTime:10,endTime:20},{assetId:foreign,startTime:10,endTime:20}]};}};
  const service=new ConversationService(db,media,ai,{get:(key,fallback)=>key==='SPACE_REPLIES_ENABLED'?'true':fallback});
  class CheckModule{}
  Module({controllers:[ConversationController],providers:[{provide:MomentThumbnailService,useValue:{}},{provide:MediaService,useValue:media},{provide:DatabaseService,useValue:db},{provide:AuthService,useValue:{verifyToken:()=>{throw new Error('No developer token fixture');}}},{provide:ConversationService,useValue:service},{provide:SaasSessionGuard,useValue:new SaasSessionGuard(db)},{provide:AuthGuard,useValue:{canActivate:()=>false}}]})(CheckModule);
  app=await NestFactory.create(CheckModule,new FastifyAdapter(),{logger:['error'],abortOnError:false});app.setGlobalPrefix('api/v1');app.useGlobalFilters(new ApiErrorsFilter());await app.init();await app.getHttpAdapter().getInstance().ready();
  const http=app.getHttpAdapter().getInstance(),headers={authorization:'SaaS '+token},payload={history:[{role:'user',content:'When will the prototype ship?'}],selection:[]};
  let response=await http.inject({method:'POST',url:'/api/v1/saas-engine/reply',headers,payload});assert.equal(response.statusCode,200,response.body);
  const body=response.json();assert.equal(body.text,'They discussed shipping the prototype on Friday.');assert.equal(body.citations[0].assetId,asset);assert.equal(body.citations[0].startS,10);assert(body.evidence.every(e=>e.assetId===asset));assert.equal(calls,2);
  response=await http.inject({method:'POST',url:'/api/v1/saas-engine/reply',headers,payload:{...payload,selection:[{assetId:foreign,startS:10,endS:20}]}});assert.equal(response.statusCode,404);assert.equal(calls,2);
  response=await http.inject({method:'POST',url:'/api/v1/saas-engine/reply',headers,payload:{...payload,userId:other}});assert.equal(response.statusCode,400);
  response=await http.inject({method:'POST',url:'/api/v1/saas-engine/reply',payload});assert.equal(response.statusCode,401);
  await pool.query("UPDATE saas.sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 second' WHERE user_id=$1",[owner]);
  response=await http.inject({method:'POST',url:'/api/v1/saas-engine/reply',headers,payload});assert.equal(response.statusCode,401);
  console.log('PASS: real Nest/Fastify conversation route, local index SQL, original timestamps, cross-owner source filtering, forged-owner denial and expired SaaS session rejection; model/search fixtures only.');
 }finally{if(app)await app.close();await pool.query('DELETE FROM public.users WHERE id=ANY($1::uuid[])',[[owner,other]]);await pool.end();}
})().catch(error=>{console.error('Conversation HTTP check failed:',error.message);process.exitCode=1;});
