import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createSpaces} from '../server/spaces-core';
import {createStudio,type StudioGeneration} from '../server/studio-core';
import {AuthError} from '../server/auth-core';
import {studioMarkdown} from '../lib/studio-types';

async function main(){
  const url=process.env.SAAS_DATABASE_URL;
  if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw Error('Local PostgreSQL required');
  const pool=new Pool({connectionString:url,max:5,connectionTimeoutMillis:5000}),schema=`studio_check_${randomUUID().replaceAll('-','')}`;
  const rewrite=(sql:string)=>sql.replaceAll('public.users',`${schema}.users`).replaceAll('public.media_assets',`${schema}.media_assets`).replaceAll('saas.',`${schema}.`).replaceAll('SCHEMA IF NOT EXISTS saas',`SCHEMA IF NOT EXISTS ${schema}`).replaceAll('SCHEMA saas FROM',`SCHEMA ${schema} FROM`);
  const db={query:(sql:string,params?:unknown[])=>pool.query(rewrite(sql),params),async connect(){const client=await pool.connect();return{query:(sql:string,params?:unknown[])=>client.query(rewrite(sql),params),release:()=>client.release()};}} as unknown as Pool;
  const owner=randomUUID(),other=randomUUID(),spaces=createSpaces(db);
  const reject=(fn:()=>Promise<unknown>,status:number)=>assert.rejects(fn,e=>e instanceof AuthError&&e.status===status);
  let calls=0;
  const generate=async(input:StudioGeneration)=>{calls++;return{document:{title:'A grounded brief',summary:'Summary',sections:[{heading:'Sequence',body:'Supported detail',evidenceIds:['e1']}],suggestions:['An idea']},evidence:input.selection.map((s,i)=>({...s,id:`e${i+1}`}))};};
  const studio=createStudio(db,generate);
  try{
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE ${schema}.users(id uuid PRIMARY KEY); CREATE TABLE ${schema}.media_assets(id text PRIMARY KEY,user_id uuid REFERENCES ${schema}.users(id),duration float8,original_filename text,source_type text,status text,availability text,checksum text)`);
    const sql=rewrite(fs.readFileSync('../api/src/modules/database/saas-schema.sql','utf8'));await pool.query(sql);await pool.query(sql);
    await db.query('INSERT INTO public.users VALUES($1),($2)',[owner,other]);
    await db.query("INSERT INTO public.media_assets VALUES('fixture',$1,60,'fixture.mp4','upload','indexed','online','checksum')",[owner]);
    const space=await spaces.create(owner,{id:randomUUID(),query:'Test creation'}),id=space.id;
    const request=()=>({id:randomUUID(),format:'brief',goal:''});
    await reject(()=>studio.create(owner,id,request()),400);
    const a=await spaces.moment(owner,id,{assetId:'fixture',startS:1,endS:5,title:'One'}),b=await spaces.moment(owner,id,{assetId:'fixture',startS:10,endS:15,title:'Two'});
    await spaces.shortlist(owner,id,{momentIds:[b.id,a.id]});
    const req=request(),saved=await studio.create(owner,id,req);assert.equal(saved.output.status,'ready');assert.deepEqual(saved.output.sources.map(s=>s.momentId),[b.id,a.id]);
    assert.equal((await studio.create(owner,id,req)).cached,true);assert.equal(calls,1);
    await reject(()=>studio.read(other,req.id),404);await reject(()=>studio.create(other,id,request()),404);
    assert.equal((await studio.list(other)).items.length,0);assert.equal((await studio.list(owner)).items.length,1);
    const bad=createStudio(db,async input=>{const result=await generate(input);result.document.sections[0].evidenceIds=['invented'];return result;}),retry=request();
    await reject(()=>bad.create(owner,id,retry),503);assert.equal((await studio.read(owner,retry.id)).status,'failed');
    await studio.create(owner,id,retry);assert.equal((await studio.read(owner,retry.id)).status,'ready');
    let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>{release=r;}),start=new Promise<void>(r=>{started=r;});
    const slow=createStudio(db,async input=>{started();await gate;return generate(input);}),slowReq=request();
    const running=slow.create(owner,id,slowReq);await start;await reject(()=>studio.create(owner,id,request()),409);release();await running;
    const changed=createStudio(db,async input=>{await db.query("UPDATE public.media_assets SET checksum='new' WHERE id='fixture'");return generate(input);});
    await reject(()=>changed.create(owner,id,request()),409);assert((await studio.read(owner,req.id)).sources.every(s=>s.available===false));
    const markdown=studioMarkdown({...saved.output,title:'<script>bad</script>'},'http://localhost:3000');assert(!markdown.includes('<script>'));assert(markdown.includes('/studio?output='));
    await spaces.remove(owner,id);assert.equal((await studio.list(owner)).items.length,0);
    console.log('PASS: Studio persistence, ordered sources, ownership, cached retries, invalid citations, failed retry, concurrent claims, source changes, escaped exports and cascade. No model calls.');
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Studio check failed');process.exitCode=1;});
