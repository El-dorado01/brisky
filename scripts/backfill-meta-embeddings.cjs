#!/usr/bin/env node
// Local inference only. Owner-scoped, resumable, additive; old vectors stay intact.
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const {createRequire}=require('node:module');
const apiRequire=createRequire(path.join(root,'apps/api/package.json'));
apiRequire('reflect-metadata');
const {Pool}=apiRequire('pg'),{ConfigService}=apiRequire('@nestjs/config');
const {LocalEmbeddingService}=require('../apps/api/dist/modules/pipeline/local-embedding.service');
const {META_EMBEDDING_MODEL}=require('../apps/api/dist/common/meta-only-profile');
const {metaEmbeddingText,metaEmbeddingHash}=require('../apps/api/dist/modules/pipeline/meta-embedding-text');
const args=process.argv.slice(2),owner=args[args.indexOf('--owner')+1],apply=args.includes('--apply');
if(!args.includes('--owner')||! /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(owner||''))throw Error('Usage: node --env-file=.env scripts/backfill-meta-embeddings.cjs --owner UUID [--apply]');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
const embedding=new LocalEmbeddingService(new ConfigService({...process.env,META_ONLY_RUNTIME:'true',EMBEDDING_PROVIDER:'meta-local'}));
async function main(){
 if(apply){const schema=fs.readFileSync(path.join(root,'apps/api/src/modules/database/schema.sql'),'utf8');await pool.query(schema.slice(schema.indexOf('-- Separate Meta LASER2 space.')));}
 const rows=(await pool.query(`SELECT id,title,description,visual_objects,actions,transcript_text,on_screen_text FROM media_segments WHERE user_id=$1 ORDER BY id`,[owner])).rows;
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',segments:rows.length,model:META_EMBEDDING_MODEL}));
 if(!apply)return;
 let updated=0,skipped=0;
 for(const row of rows){
  const text=metaEmbeddingText(row),hash=metaEmbeddingHash(text);
  const current=await pool.query('SELECT 1 FROM media_segments WHERE user_id=$1 AND id=$2 AND meta_embedding_model=$3 AND meta_embedding_input_hash=$4 AND embedding_meta_1024 IS NOT NULL',[owner,row.id,META_EMBEDDING_MODEL,hash]);
  if(current.rowCount){skipped++;continue;}
  if(!text.trim())continue;
  const result=await embedding.generateEmbedding(text);
  if(result.values.length!==1024||result.values.some(v=>!Number.isFinite(v)))throw Error('Invalid Meta embedding');
  const saved=await pool.query(`UPDATE media_segments SET embedding_meta_1024=$1::vector,meta_embedding_model=$2,meta_embedding_input_hash=$3 WHERE user_id=$4 AND id=$5 AND md5(media_meta_embedding_text(title,description,visual_objects,actions,transcript_text,on_screen_text))=$3`,[JSON.stringify(result.values),META_EMBEDDING_MODEL,hash,owner,row.id]);
  updated+=saved.rowCount;
 }
 console.log(JSON.stringify({updated,skipped,oldVectorsPreserved:true}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{embedding.onModuleDestroy();await pool.end();});
