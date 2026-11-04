import { Controller, Get } from '@nestjs/common';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const text = { type: 'string' };
const nullableNumber = { type: ['number', 'null'] };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });
const statuses = ['dispatch_pending', 'queued', 'processing', 'completed', 'failed', 'cancelled'];
const page = (name: string, item: unknown) => object({ [name]: { type: 'array', items: item }, count: { type: 'integer', minimum: 0 },
  hasMore: { type: 'boolean' }, nextCursor: { type: ['string', 'null'] } }, [name, 'count', 'hasMore', 'nextCursor']);
const schemas: Record<string, any> = {
  Error: object({ statusCode: { type: 'integer' }, code: text, message: text, requestId: text }, ['statusCode','code','message','requestId']),
  Asset: object({ assetId: text, originalFilename: text, status: text, stage: text, progress: { type: 'number' }, thumbnailUrl: text, streamUrl: text }, ['assetId','originalFilename','status']),
  Job: object({ job_id: text, asset_id: text, job_type: text, status: { type: 'string', enum: statuses },
    stage: text, progress: { type: 'number' }, result_asset_id: { type: ['string','null'] }, error: { anyOf: [object({ code: text, message: text }), { type: 'null' }] } }, ['job_id','asset_id','status','result_asset_id']),
  JobListItem: object({ id: { type: 'string', format: 'uuid' }, bull_job_id: { type: ['string','null'] }, asset_id: text,
    status: { type: 'string', enum: statuses }, progress: { type: 'number' }, result_asset_id: { type: ['string','null'] } }, ['id','asset_id','status']),
  ClipRequest: object({ start_s: { type: 'number', minimum: 0 }, end_s: { type: 'number', exclusiveMinimum: 0, maximum: 604800 }, title: { type: 'string', maxLength: 200 } }, ['start_s','end_s']),
  ClipAccepted: { allOf: [ref('Job'), object({ reused: { type: 'boolean' }, status_url: text, message: text }, ['reused','status_url','message'])] },
  SearchRequest: object({ query: { type: 'string', minLength: 1, maxLength: 2000 }, assetId: { type: 'string', minLength: 1, maxLength: 128 }, phase: { type: 'string', enum: ['retrieve','verify'] } }, ['query']),
  SearchResult: object({ assetId: text, segmentId: text, startTime: { type: 'number' }, endTime: { type: 'number' },
    score: { type: 'number' }, verificationStatus: { type: 'string', enum: ['pending','matched','not_matched','uncertain','insufficient_evidence','error'] } }, ['assetId','segmentId','startTime','endTime','score']),
  SearchResponse: object({ query: text, count: { type: 'integer' }, results: { type: 'array', items: ref('SearchResult') },
    hasExactMatch: { type: 'boolean' }, searchStatus: { type: 'string', enum: ['complete','refining','incomplete'] }, canContinue: { type: 'boolean' } }, ['query','count','results','hasExactMatch']),
  Credentials: object({ email: { type: 'string', format: 'email', maxLength: 254 }, password: { type: 'string', minLength: 1, maxLength: 256 } }, ['email','password']),
  Registration: object({ email: { type: 'string', format: 'email', maxLength: 254 }, password: { type: 'string', minLength: 12, maxLength: 256 }, name: { type: 'string', maxLength: 120 } }, ['email','password']),
  Session: object({ token: text, user: object({ id: text, email: text, name: text }, ['id','email']) }, ['token','user']),
  Feedback: object({ query: { type: 'string', minLength: 1, maxLength: 2000 }, assetId: text, segmentId: text,
    feedback: { type: 'string', enum: ['positive','negative'] }, notes: { type: 'string', maxLength: 2000 }, timestampSec: { type: 'number', minimum: 0 } }, ['query','assetId','feedback']),
  Folders: object({ folders: { type: 'array', maxItems: 100, items: object({ id: { type: 'string', minLength: 1, maxLength: 256 }, name: { type: 'string', minLength: 1, maxLength: 256 } }, ['id','name']) } }, ['folders']),
  Economics: object({
    stage1Ingestion: object({ costBasis: { const: 'legacy_asset_estimates' }, totalCostUsd: { type: 'number' }, totalSourceMinutes: { type: 'number' }, costPerSourceMinuteUsd: { type: 'number' }, totalAssetsIndexed: { type: 'number' }, totalFramesAnalyzed: { type: 'number' } }, ['costBasis','totalCostUsd']),
    stage2Verification: object({ cachedEvaluations: { type: 'integer' }, totalQueriesVerified: { type: 'integer', deprecated: true, description: 'Legacy alias of cachedEvaluations, not an inference/request count.' }, measurementStatus: { const: 'not_measured' },
      estimatedCostUsd: nullableNumber, costPerQueryUsd: nullableNumber, cacheHitRate: nullableNumber }, ['cachedEvaluations','measurementStatus','estimatedCostUsd','costPerQueryUsd','cacheHitRate']),
    searchFeedback: object({ positiveCount: { type: 'number' }, negativeCount: { type: 'number' }, positiveRatio: nullableNumber }),
  }, ['stage1Ingestion','stage2Verification','searchFeedback']),
  GenericObject: { type: 'object', description: 'Existing endpoint-specific payload; not yet a fully specified SDK contract.' },
};
schemas.AssetPage = page('assets', ref('Asset'));
schemas.JobPage = page('jobs', ref('JobListItem'));
const paths: Record<string, any> = {};
function route(method: string, path: string, id: string, response = 'GenericObject', body?: string, code = 200, publicRoute = false) {
  const parameters: any[] = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({ in: 'path', name: match[1], required: true, schema: text }));
  if (response === 'AssetPage' || response === 'JobPage') parameters.push(
    { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
    { in: 'query', name: 'cursor', schema: { type: 'string', maxLength: 2048 }, description: 'Opaque user/resource-bound cursor; ordering is created_at DESC, id DESC. Not a snapshot.' });
  const operation: any = { operationId: id, summary: id.replace(/([A-Z])/g, ' $1'), parameters,
    responses: { [code]: { description: 'Success', headers: { 'X-Request-Id': { schema: text } }, content: { 'application/json': { schema: ref(response) } } },
      ...Object.fromEntries([400,401,403,404,409,413,429,500,503].map((status) => [status, { description: 'Request failed', content: { 'application/json': { schema: ref('Error') } } }])) } };
  if (body) operation.requestBody = { required: true, content: { 'application/json': { schema: ref(body) } } };
  if (publicRoute) operation.security = [];
  (paths[path] ??= {})[method] = operation;
  return operation;
}
route('get','/openapi.json','getApiContract','GenericObject',undefined,200,true);
route('get','/health','getHealth','GenericObject',undefined,200,true);
route('post','/auth/register','register','Session','Registration',201,true);
route('post','/auth/login','login','Session','Credentials',201,true);
route('get','/auth/me','getCurrentUser');
route('get','/media','listAssets','AssetPage');
route('post','/media/search','searchMoments','SearchResponse','SearchRequest',201);
const searchGet = route('get','/media/search','searchMomentsGet','SearchResponse');
searchGet.parameters.push({ in: 'query', name: 'q', required: true, schema: { type: 'string', minLength: 1, maxLength: 2000 } }, { in: 'query', name: 'assetId', schema: text });
route('post','/media/feedback','recordFeedback','GenericObject','Feedback',201);
route('get','/media/economics','getEconomics','Economics');
route('get','/media/{id}/status','getAssetStatus','Asset');
route('get','/media/{id}/lineage','getAssetLineage');
route('get','/media/{id}','getAssetIntelligence');
const clip = route('post','/media/{id}/extract-clip','extractClip','ClipAccepted','ClipRequest',202);
clip.description = 'Clip span must be positive and at most 600 seconds, with end_s within known source duration. Replay the same key on transport retries; a changed request returns 409. No key means a new operation.';
clip.parameters.push({ in: 'header', name: 'Idempotency-Key', schema: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[!-~]+$' } });
route('get','/indexing/jobs','listJobs','JobPage');
route('get','/indexing/jobs/{id}','getJob','Job');
route('get','/indexing/stats','getIndexingStats');
route('post','/indexing/jobs/{id}/retry-operation','retryClipOperation','Job',undefined,201);
route('post','/indexing/jobs/{assetId}/retry','retryAsset','GenericObject',undefined,201);
route('post','/indexing/jobs/{id}/cancel','cancelJob','GenericObject',undefined,201);
schemas.Reindex = object({ pattern: { type: 'string', minLength: 1, maxLength: 200 } }, ['pattern']);
route('post','/indexing/reindex-matching','reindexMatching','GenericObject','Reindex',201);
route('get','/connectors','listConnectorAccounts');
route('get','/connectors/google-drive/auth-url','getDriveAuthUrl');
const callback = route('get','/connectors/google-drive/callback','driveOAuthCallback','GenericObject',undefined,302,true);
callback.responses[302] = { description: 'Redirect to configured frontend after OAuth', headers: { Location: { schema: text } }, content: { 'text/html': { schema: text } } };
callback.parameters.push(...['code','state','error'].map((name) => ({ in: 'query', name, schema: text })));
route('delete','/connectors/{id}','disconnectAccount');
route('get','/connectors/{id}/folders','listFolders').parameters.push({ in: 'query', name: 'parentFolderId', schema: text });
route('post','/connectors/{id}/select-folders','selectFolders','GenericObject','Folders',201);
route('post','/connectors/{id}/sync','syncAccount','GenericObject',undefined,201);
route('post','/connectors/{id}/sync-changes','syncAccountChanges','GenericObject',undefined,201);
for (const [path, id] of [['/media/benchmark/run/{id}','runBenchmark'],['/media/benchmark/library','runLibraryBenchmark'],['/media/{id}/delete-original','deleteOriginal']]) route('post',path,id,'GenericObject',undefined,201);
const upload = route('post','/media/upload','uploadDevelopmentMedia','GenericObject',undefined,201);
upload.description = 'Disabled unless ENABLE_DEV_UPLOAD=true. Cloud connectors are the supported ingest workflow.';
upload.requestBody = { required: true, content: { 'multipart/form-data': { schema: object({ files: { type: 'array', items: { type: 'string', format: 'binary' } } }, ['files']) } } };
for (const suffix of ['stream','thumbnail']) {
  const op = route('get',`/media/{id}/${suffix}`, suffix === 'stream' ? 'streamMedia' : 'getThumbnail');
  const media = { description: 'Media bytes', content: { [suffix === 'stream' ? 'video/mp4' : 'image/jpeg']: { schema: { type: 'string', format: 'binary' } } } };
  op.responses[200] = media;
  if (suffix === 'stream') { op.parameters.push({ in: 'header', name: 'Range', schema: text }); op.responses[206] = media; op.responses[202] = { description: 'Preview preparing', content: { 'application/json': { schema: ref('GenericObject') } } }; }
}

const personFields = { name: { type: 'string', minLength: 1, maxLength: 120 },
  aliases: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 120 }, default: [] },
  isMe: { type: 'boolean', default: false } };
const identityId = { type: 'string', format: 'uuid' };
const timestamp = { type: 'string', format: 'date-time' };
schemas.PersonInput = { ...object(personFields, ['name']), additionalProperties: false };
schemas.Person = object({ ...personFields, id: identityId, createdAt: timestamp, updatedAt: timestamp },
  ['id','name','aliases','isMe','createdAt','updatedAt']);
const appearanceFields = { assetId: { type: 'string', minLength: 1, maxLength: 64 },
  start_s: { type: 'number', minimum: 0 }, end_s: { type: 'number', exclusiveMinimum: 0, maximum: 604800 },
  frame_s: { type: 'number', minimum: 0 }, box: { type: 'array', minItems: 4, maxItems: 4,
    items: { type: 'number', minimum: 0, maximum: 1 }, description: 'Normalized [x,y,width,height] at frame_s; positive width/height, wholly within frame.' } };
schemas.AppearanceInput = { ...object(appearanceFields, Object.keys(appearanceFields)), additionalProperties: false,
  description: 'Manual assertion: start_s <= frame_s < end_s <= known source duration. Selected box does not imply tracking.' };
schemas.PersonAppearance = object({ ...appearanceFields, id: identityId, personId: identityId,
  status: { type: 'string', enum: ['confirmed','rejected'] }, origin: { type: 'string', const: 'manual' },
  createdAt: timestamp, updatedAt: timestamp },
  [...Object.keys(appearanceFields),'id','personId','status','origin','createdAt','updatedAt']);
schemas.AppearanceReview = { ...object({ status: { type: 'string', enum: ['confirmed','rejected'] } }, ['status']), additionalProperties: false };
schemas.IdentityDeleted = object({ deleted: { type: 'boolean', const: true } }, ['deleted']);
schemas.PersonReference = object({ reference: text, personId: identityId,
  candidates: {type:'array',items:object({id:identityId,name:text},['id','name'])} }, ['reference','candidates']);
schemas.IdentitySearchMetadata = object({ status: {type:'string',enum:['resolved','needs_clarification']},
  references: {type:'array',items:ref('PersonReference')}, evidenceScope: {const:'manual_appearance_overlap'},
  queryConditionsVerified: {const:false}, hasMore: {type:'boolean'} },
  ['status','references','evidenceScope','queryConditionsVerified','hasMore']);
schemas.SearchResponse.properties.identitySearch = ref('IdentitySearchMetadata');
schemas.SearchResult.properties.playbackUrl = text;
schemas.SearchResult.properties.matchType = {type:'string',enum:['lexical','semantic','fusion','identity']};
schemas.ConversationTurn=object({personId:identityId,anchorId:identityId,cueId:identityId,start:{type:'number'},end:{type:'number'},
  observation:text,addressesOtherParticipant:{const:true}},['personId','anchorId','cueId','start','end','observation','addressesOtherParticipant']);
schemas.ConversationVerification=object({status:{type:'string',enum:['supported','not_supported','uncertain','insufficient_evidence','error']},
  scope:{const:'conversation_between_tagged_people'},explanation:text,turns:{type:'array',items:ref('ConversationTurn')},
  issue:{type:'string',enum:['budget','source','temporary','invalid_response']}},['status','scope','explanation','turns']);
schemas.SearchResult.properties.conversationVerification=ref('ConversationVerification');
schemas.IdentitySearchInput = {...object({query:{type:'string',minLength:1,maxLength:2000},
  assetId:{type:'string',minLength:1,maxLength:64},limit:{type:'integer',minimum:1,maximum:100,default:15},
  references:{type:'array',minItems:1,maxItems:8,items:{type:'string',minLength:1,maxLength:120}},
  selections:{type:'array',maxItems:8,items:{...object({reference:{type:'string',minLength:1,maxLength:120},personId:identityId},['reference','personId']),additionalProperties:false}}
},['query']),additionalProperties:false};
schemas.SearchRequest.properties.people={...object({references:schemas.IdentitySearchInput.properties.references,
  selections:schemas.IdentitySearchInput.properties.selections}),additionalProperties:false};
schemas.IdentitySearchResponse = object({...schemas.SearchResponse.properties,
  queryIntent:{type:'string',const:'visual'},explanation:text},['results','hasExactMatch','queryIntent','searchStatus','canContinue']);
for (const [name, item] of [['PeoplePage','Person'],['AppearancesPage','PersonAppearance']]) {
  schemas[name] = object({ items: { type: 'array', items: ref(item) }, count: { type: 'integer', minimum: 0 },
    hasMore: { type: 'boolean' }, nextAfter: { type: ['string','null'], format: 'uuid' } }, ['items','count','hasMore','nextAfter']);
}
const peopleList = route('get','/people','listPeople','PeoplePage');
schemas.SpaceConversationInput={...object({history:{type:'array',minItems:1,maxItems:20,items:{...object({role:{type:'string',enum:['user','assistant']},content:{type:'string',minLength:1,maxLength:12000}},['role','content']),additionalProperties:false}},
  selection:{type:'array',maxItems:20,items:{...object({assetId:{type:'string',minLength:1,maxLength:64},startS:{type:'number',minimum:0},endS:{type:'number',exclusiveMinimum:0},title:{type:'string',maxLength:500},notes:{type:'string',maxLength:2000}},['assetId','startS','endS']),additionalProperties:false}}},['history','selection']),additionalProperties:false};
schemas.SpaceEvidence=object({id:text,assetId:text,startS:{type:'number'},endS:{type:'number'},title:text,filename:text,transcript:text,description:text,status:{type:'string',enum:['indexed','matched']}},['id','assetId','startS','endS','title','filename','transcript','description','status']);
schemas.SpaceConversationResponse=object({text,citations:{type:'array',maxItems:20,items:ref('SpaceEvidence')},evidence:{type:'array',maxItems:20,items:ref('SpaceEvidence')},searchStatus:{type:'string',enum:['not_requested','complete','incomplete']},usage:{type:'array',items:{type:'object'}}},['text','citations','evidence','searchStatus','usage']);
route('post','/conversation/reply','replyToConversation','SpaceConversationResponse','SpaceConversationInput');
const saasConversation=route('post','/saas-engine/reply','replyToSaasConversation','SpaceConversationResponse','SpaceConversationInput');
const saasStudio=route('post','/saas-engine/studio/generate','generateSaasStudioDocument',undefined,'GenericObject');
saasStudio.security=[{saasSession:[]}];saasStudio.description='Existing first-party owned-source Studio generation. Endpoint-specific document schema remains separate work.';
saasConversation.description='First-party integration only. Requires Authorization: SaaS <session-token>; not a developer JWT endpoint. Checks the unexpired server-side SaaS session.';
saasConversation.security=[{saasSession:[]}];
schemas.VoiceRecording=object({audio:{type:'string',maxLength:2800000,description:'Canonical base64 recording, at most 2 MiB decoded; the server limits decoded audio to 60 seconds.'},mimeType:{type:'string',enum:['audio/webm','audio/ogg','audio/mp4','audio/wav']}},['audio','mimeType']);
schemas.VoiceTranscript=object({text:{type:'string',maxLength:4000},speechDetected:{type:'boolean'}},['text','speechDetected']);
schemas.VoiceSpeech=object({messageId:{type:'string',format:'uuid'},style:{type:'string',enum:['natural','storyteller']},voice:{type:'string',enum:['Kore','Puck','Charon','Aoede','Zephyr','Sulafat']}},['messageId','style']);
const voiceTranscribe=route('post','/saas-engine/voice/transcribe','transcribeVoiceRecording','VoiceTranscript','VoiceRecording');
voiceTranscribe.security=[{saasSession:[]}];voiceTranscribe.description='First-party voice mode: authenticated bounded recording transcription. Main reasoning provider is unchanged.';
const voiceSpeak=route('post','/saas-engine/voice/speak','speakSavedAssistantReply',undefined,'VoiceSpeech');
voiceSpeak.security=[{saasSession:[]}];voiceSpeak.description='First-party voice mode: reads only an owned saved assistant reply and returns configured Gemini or local Meta MMS speech. Meta/MMS mode never falls back to Gemini.';
voiceSpeak.responses['200']={description:'Private WAV speech',content:{'audio/wav':{schema:{type:'string',format:'binary'}}}};
const voiceStream=route('post','/saas-engine/voice/stream','streamSavedAssistantReply',undefined,'VoiceSpeech');
voiceStream.security=[{saasSession:[]}];voiceStream.description='Streams owned saved reply PCM as format/audio/done NDJSON packets. Provider-specific private cache reuse applies; Gemini quota fallback is restricted to Gemini modes. A post-header failure emits an error packet; clients must not treat EOF as success.';
voiceStream.responses['200']={description:'Private incremental PCM speech',content:{'application/x-ndjson':{schema:{type:'string'}}}};
schemas.VoicePreview=object({voice:{type:'string',enum:['Kore','Puck','Charon','Aoede','Zephyr','Sulafat','mms-eng']},sample:{type:'integer',minimum:0,maximum:3}},['voice','sample']);
const voicePreview=route('post','/saas-engine/voice/preview','previewBriskyVoice',undefined,'VoicePreview');
schemas.VoiceMode=object({mode:{type:'string',enum:['turn-based','live','meta-mms']},ttsProvider:{type:'string',enum:['gemini','mms']}},['mode','ttsProvider']);
schemas.LiveVoiceTicketInput=object({voice:{type:'string',enum:['Kore','Puck','Charon','Aoede','Zephyr','Sulafat']}},['voice']);
schemas.LiveVoiceTicket=object({url:{type:'string',description:'One-use 30-second authenticated WebSocket URL; never a permanent model API key.'},startupTimeoutMs:{type:'integer',minimum:15000,maximum:150000}},['url']);
const voiceConfig=route('post','/saas-engine/voice/config','getVoiceMode','VoiceMode');voiceConfig.security=[{saasSession:[]}];
const liveTicket=route('post','/saas-engine/voice/live-ticket','createLiveVoiceTicket','LiveVoiceTicket','LiveVoiceTicketInput');liveTicket.security=[{saasSession:[]}];liveTicket.description='Voice relay ticket for configured Gemini Live or Meta ASR/text plus local MMS mode. One connection per owner, two global, five-minute maximum. WebSocket protocol/setup: docs/meta-mms-voice.md and docs/voice-provider-transition.md.';
voicePreview.security=[{saasSession:[]}];voicePreview.description='Authenticated fixed-sentence voice audition; arbitrary client text is not accepted.';
voicePreview.responses['200']={description:'Private WAV voice sample',content:{'audio/wav':{schema:{type:'string',format:'binary'}}}};
for(const [method,path,id] of [['get','','listSaasSources'],['get','/indexing','getSaasIndexingStatus'],['post','/google-drive/start','startSaasGoogleDrive'],['post','/google-drive/complete','completeSaasGoogleDrive'],['get','/{id}/folders','browseSaasDriveFolders'],['post','/{id}/folders','selectSaasDriveFolders'],['post','/{id}/sync','syncSaasDrive'],['delete','/{id}','disconnectSaasSource']]){
  const operation=route(method,'/saas-engine/connectors'+path,id);
  operation.security=[{saasSession:[]}];operation.description='First-party server integration only. Authenticates the unexpired SaaS session and scopes all source data/actions to its owner. Sync is opt-in via SAAS_DRIVE_SYNC_ENABLED.';
  if(method==='post'){operation.responses['201']=operation.responses['200'];delete operation.responses['200'];}
}
const momentThumb=route('get','/saas-engine/media/{id}/moment-thumbnail','getSaasMomentThumbnail');
momentThumb.security=[{saasSession:[]}];
momentThumb.description='First-party owner-scoped saved-range thumbnail. Extracts midpoint frame locally, caches JPEG, never starts indexing workers.';
momentThumb.parameters.push(...['startS','endS'].map(name=>({name,in:'query',required:true,schema:{type:'number',minimum:0}})));
momentThumb.responses['200']={description:'640x440 source frame',content:{'image/jpeg':{schema:{type:'string',format:'binary'}}}};
momentThumb.responses['202']={description:'Source preview is not ready'};
for(const method of ['get','head']){
  const playback=route(method,'/saas-engine/media/{id}/stream',method==='get'?'streamSaasSource':'headSaasSource');
  playback.security=[{saasSession:[]}];
  playback.description='First-party session bridge. Owner-scoped MP4 playback, no background job creation. Supports a single byte Range; returns 202 when the existing preview is not ready.';
  playback.parameters.push({name:'Range',in:'header',required:false,schema:{type:'string'}});
  playback.responses={...playback.responses,'200':{description:'Original or existing proxy MP4',content:{'video/mp4':{schema:{type:'string',format:'binary'}}}},'206':{description:'Requested byte range'},'202':{description:'Preview not ready; Retry-After: 3'},'416':{description:'Invalid or unsatisfiable range; Content-Range: bytes */size'}};
}
route('post','/people/search','searchConfirmedPeople','IdentitySearchResponse','IdentitySearchInput');
route('post','/people','createPerson','Person','PersonInput',201);
route('put','/people/{id}','replacePerson','Person','PersonInput');
route('delete','/people/{id}','deletePerson','IdentityDeleted');
route('post','/people/{id}/appearances','addPersonAppearance','PersonAppearance','AppearanceInput',201);
const appearanceList = route('get','/people/{id}/appearances','listPersonAppearances','AppearancesPage');
route('patch','/people/appearances/{id}','reviewPersonAppearance','PersonAppearance','AppearanceReview');
route('delete','/people/appearances/{id}','deletePersonAppearance','IdentityDeleted');
schemas.FaceArchiveSettings={...object({enabled:{type:'boolean'}},['enabled']),additionalProperties:false};
for(const [method,path,id,response,body,code] of [
  ['get','','listSaasPeople','PeoplePage',undefined,200],
  ['post','','createSaasPerson','Person','PersonInput',201],
  ['put','/{id}','replaceSaasPerson','Person','PersonInput',200],
  ['delete','/{id}','deleteSaasPerson','IdentityDeleted',undefined,200],
  ['get','/{id}/appearances','listSaasAppearances','AppearancesPage',undefined,200],
  ['post','/{id}/appearances','addSaasAppearance','PersonAppearance','AppearanceInput',201],
  ['delete','/appearances/{id}','deleteSaasAppearance','IdentityDeleted',undefined,200],
  ['get','/{id}/face-suggestions','listSaasFaceSuggestions','GenericObject',undefined,200],
  ['post','/{id}/face-scan','scanSaasFace','GenericObject','GenericObject',201],
  ['post','/{id}/reference-check','checkSaasFaceReference','GenericObject','GenericObject',201],
  ['get','/{id}/face-archive','getSaasFaceArchive','GenericObject',undefined,200],
  ['put','/{id}/face-archive','setSaasFaceArchive','GenericObject','FaceArchiveSettings',200],
  ['post','/{id}/face-archive-retry','retrySaasFaceArchive','GenericObject',undefined,201],
  ['post','/face-suggestions/{id}/review','reviewSaasFaceSuggestion','GenericObject','GenericObject',201],
  ['get','/face-suggestions/{id}/frame','getSaasFaceFrame','GenericObject',undefined,200],
] as [string,string,string,string,string|undefined,number][]){
  const operation=route(method,'/saas-engine/people'+path,id,response,body,code);
  operation.security=[{saasSession:[]}];operation.description='First-party owner-scoped session bridge. Archive scanning produces pending suggestions only, requires per-person opt-in and a standalone local face worker; it does not confirm identities automatically.';
  if(path.endsWith('/frame'))operation.responses['200']={description:'Owned suggestion source frame',content:{'image/jpeg':{schema:{type:'string',format:'binary'}}}};
}
for (const operation of [peopleList, appearanceList]) operation.parameters.push(
  { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
  { in: 'query', name: 'after', schema: identityId, description: 'Last UUID from the previous page; UUID ascending, not a snapshot.' });

export const apiContract = { openapi: '3.1.0', info: { title: 'Brisky API', version: '1.0.0',
  description: 'Core developer contract. GenericObject responses are explicitly partial contracts. Server validation also enforces semantic clip bounds and folder uniqueness. Usage values marked unknown are not bills.' },
  servers: [{ url: '/api/v1' }], security: [{ bearerAuth: [] }], paths,
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },saasSession:{type:'apiKey',in:'header',name:'Authorization',description:'First-party server-to-server only: SaaS <session-token>. Never expose the HttpOnly token to client JavaScript.'} }, schemas } };

@Controller()
export class ApiContractController {
  @Get('openapi.json') getContract() { return apiContract; }
}
