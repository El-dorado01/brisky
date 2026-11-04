import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { AuthError } from './auth-core';
import { uuid } from './spaces-core';
import type { StudioDocument,StudioFormat,StudioOutput,StudioSource } from '../lib/studio-types';

type Snapshot={momentId:string;assetId:string;startS:number;endS:number;title:string;filename:string;checksum:string;duration:number};
export type StudioGeneration={format:StudioFormat;goal:string;selection:{assetId:string;startS:number;endS:number;title:string}[]};
type EngineEvidence={id:string;assetId:string;startS:number;endS:number};
export type EngineStudio={document:StudioDocument;evidence:EngineEvidence[]};

function output(row:Record<string,unknown>):StudioOutput{
  return {id:String(row.id),spaceId:String(row.space_id),spaceTitle:String(row.space_title),format:row.format as StudioFormat,goal:String(row.goal),status:row.status as StudioOutput['status'],title:String(row.title),createdAt:new Date(String(row.created_at)).toISOString(),document:row.document as StudioDocument|null,sources:row.sources as StudioSource[]};
}
function checkedDocument(value:EngineStudio,snapshot:Snapshot[]){
  if(!value||!value.document||!Array.isArray(value.evidence)||!value.evidence.length||value.evidence.length>20)throw new AuthError(503,'Studio returned no source-grounded document.');
  const ids=new Set<string>(),sources:StudioSource[]=[];
  for(const item of value.evidence){
    const original=snapshot.find(s=>s.assetId===item?.assetId&&Number.isFinite(item.startS)&&Number.isFinite(item.endS)&&item.startS>=s.startS&&item.endS<=s.endS&&item.endS>item.startS);
    if(!original||typeof item.id!=='string'||!/^e\d{1,2}$/.test(item.id)||ids.has(item.id))throw new AuthError(503,'Studio returned unsupported source references.');
    ids.add(item.id);sources.push({id:item.id,momentId:original.momentId,assetId:original.assetId,startS:item.startS,endS:item.endS,title:original.title,filename:original.filename});
  }
  const doc=value.document,validText=(v:unknown,max:number)=>typeof v==='string'&&!!v.trim()&&v.length<=max;
  if(!validText(doc.title,200)||!validText(doc.summary,1800)||!Array.isArray(doc.sections)||!doc.sections.length||doc.sections.length>12||!Array.isArray(doc.suggestions)||doc.suggestions.length>8||doc.suggestions.some(v=>!validText(v,1200)))throw new AuthError(503,'Studio returned an incomplete document.');
  for(const section of doc.sections)if(!validText(section.heading,180)||!validText(section.body,5000)||!Array.isArray(section.evidenceIds)||!section.evidenceIds.length||section.evidenceIds.length>20||new Set(section.evidenceIds).size!==section.evidenceIds.length||section.evidenceIds.some(id=>!ids.has(id)))throw new AuthError(503,'A document section is missing its source references.');
  if(JSON.stringify(doc).length>50000)throw new AuthError(503,'The document is too large.');
  return {document:doc,sources};
}

export function createStudio(pool:Pool,generate?:(input:StudioGeneration)=>Promise<EngineStudio>){
  async function read(owner:string,id:string){
    uuid(id);const result=await pool.query('SELECT o.*,s.title AS space_title FROM saas.studio_outputs o JOIN saas.spaces s ON s.id=o.space_id AND s.user_id=o.user_id WHERE o.id=$1 AND o.user_id=$2',[id,owner]);
    if(!result.rowCount)throw new AuthError(404,'This Studio document is unavailable.');
    const row=result.rows[0];
    if(row.status==='ready'){
      const current=await pool.query(`SELECT r."momentId" AS id FROM jsonb_to_recordset($3::jsonb) r("momentId" uuid,"assetId" text,checksum text,duration float8)
        JOIN public.media_assets a ON a.id=r."assetId" AND a.user_id=$1 AND a.checksum=r.checksum AND a.duration=r.duration AND a.status='indexed' AND (a.availability IS NULL OR a.availability!='offline')
        JOIN saas.moments m ON m.id=r."momentId" AND m.user_id=$1 AND m.space_id=$2 AND m.asset_id=a.id`,[owner,row.space_id,JSON.stringify(row.input_snapshot)]);
      const available=new Set(current.rows.map(r=>r.id));row.sources=row.sources.map((source:StudioSource)=>({...source,available:available.has(source.momentId)}));
    }
    if(row.status==='generating'&&new Date(row.lease_until).getTime()<=Date.now())row.status='failed';return output(row);
  }
  async function locked<T>(owner:string,space:string,work:(db:PoolClient)=>Promise<T>){
    const db=await pool.connect();try{await db.query('BEGIN');
      const owned=await db.query('SELECT id FROM saas.spaces WHERE user_id=$1 AND id=$2 FOR UPDATE',[owner,space]);if(!owned.rowCount)throw new AuthError(404,'Space not found.');
      const result=await work(db);await db.query('COMMIT');return result;
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  return {read,
    async list(owner:string,after?:string|null){
      if(after)uuid(after);
      const result=await pool.query(`SELECT o.*,s.title AS space_title FROM saas.studio_outputs o JOIN saas.spaces s ON s.user_id=o.user_id AND s.id=o.space_id
        WHERE o.user_id=$1 AND ($2::uuid IS NULL OR (o.created_at,o.id)<(SELECT created_at,id FROM saas.studio_outputs WHERE id=$2 AND user_id=$1)) ORDER BY o.created_at DESC,o.id DESC LIMIT 21`,[owner,after||null]);
      return {items:result.rows.slice(0,20).map(row=>{if(row.status==='generating'&&new Date(row.lease_until).getTime()<=Date.now())row.status='failed';return output(row);}),nextCursor:result.rows.length>20?result.rows[19].id:null};
    },
    async create(owner:string,space:string,input:Record<string,unknown>){
      uuid(space);const id=uuid(input.id),format=input.format,goal=typeof input.goal==='string'?input.goal.trim():'';
      if(Object.keys(input).some(key=>!['id','format','goal'].includes(key))||!['brief','storyline'].includes(String(format))||typeof input.goal!=='string'||goal.length>2000)throw new AuthError(400,'Choose a format and a goal of up to 2,000 characters.');
      const lease=randomUUID();
      const claim=await locked(owner,space,async db=>{
        await db.query("UPDATE saas.studio_outputs SET status='failed',lease_id=NULL,lease_until=NULL,updated_at=now() WHERE user_id=$1 AND space_id=$2 AND status='generating' AND lease_until<=now()",[owner,space]);
        const prior=(await db.query('SELECT * FROM saas.studio_outputs WHERE id=$1',[id])).rows[0];
        if(prior&&(prior.user_id!==owner||prior.space_id!==space||prior.format!==format||prior.goal!==goal))throw new AuthError(409,'This request identifier is already in use. Try again.');
        if(prior?.status==='ready')return {cached:true,snapshot:[] as Snapshot[]};
        const active=await db.query("SELECT 1 FROM saas.studio_outputs WHERE user_id=$1 AND space_id=$2 AND status='generating'",[owner,space]);
        if(active.rowCount)throw new AuthError(409,'Studio is already creating a document for this space.');
        const selected=await db.query(`SELECT m.id AS "momentId",m.asset_id AS "assetId",m.start_s AS "startS",m.end_s AS "endS",m.title,a.original_filename AS filename,a.checksum,a.duration,a.status,a.availability
          FROM saas.shortlist_items l JOIN saas.moments m ON m.user_id=l.user_id AND m.space_id=l.space_id AND m.id=l.moment_id JOIN public.media_assets a ON a.user_id=m.user_id AND a.id=m.asset_id
          WHERE l.user_id=$1 AND l.space_id=$2 ORDER BY l.position LIMIT 21`,[owner,space]);
        if(!selected.rowCount||selected.rowCount>20)throw new AuthError(400,'Choose between 1 and 20 moments in your shortlist.');
        const snapshot:Snapshot[]=selected.rows.map(row=>({momentId:row.momentId,assetId:row.assetId,startS:Number(row.startS),endS:Number(row.endS),title:row.title,filename:row.filename,checksum:row.checksum,duration:Number(row.duration)}));
        if(selected.rows.some(row=>row.status!=='indexed'||row.availability==='offline'||Number(row.endS)>Number(row.duration)))throw new AuthError(409,'A shortlisted source needs indexing or is unavailable.');
        if(prior&&JSON.stringify((prior.input_snapshot as Snapshot[]).map(s=>[s.momentId,s.assetId,s.startS,s.endS,s.title,s.filename,s.checksum,s.duration]))!==JSON.stringify(snapshot.map(s=>[s.momentId,s.assetId,s.startS,s.endS,s.title,s.filename,s.checksum,s.duration])))throw new AuthError(409,'Your shortlist or sources changed. Start a new document.');
        await db.query(`INSERT INTO saas.studio_outputs(id,user_id,space_id,format,goal,status,input_snapshot,lease_id,lease_until) VALUES($1,$2,$3,$4,$5,'generating',$6,$7,now()+interval '2 minutes')
          ON CONFLICT(id) DO UPDATE SET status='generating',lease_id=excluded.lease_id,lease_until=excluded.lease_until,updated_at=now()`,[id,owner,space,format,goal,JSON.stringify(snapshot),lease]);
        return {cached:false,snapshot};
      });
      if(claim.cached)return {output:await read(owner,id),cached:true};
      try{
        if(!generate)throw new AuthError(503,'Studio is not connected to Brisky yet.');
        const result=checkedDocument(await generate({format:format as StudioFormat,goal,selection:claim.snapshot.map(s=>({assetId:s.assetId,startS:s.startS,endS:s.endS,title:s.title}))}),claim.snapshot);
        await locked(owner,space,async db=>{
          const current=await db.query(`SELECT count(*)::int AS count FROM jsonb_to_recordset($3::jsonb) r("momentId" uuid,"assetId" text,"startS" float8,"endS" float8,checksum text,duration float8)
            JOIN public.media_assets a ON a.id=r."assetId" AND a.user_id=$1 AND a.checksum=r.checksum AND a.duration=r.duration AND a.status='indexed' AND (a.availability IS NULL OR a.availability!='offline')
            JOIN saas.moments m ON m.id=r."momentId" AND m.user_id=$1 AND m.space_id=$2 AND m.asset_id=a.id AND m.start_s=r."startS" AND m.end_s=r."endS"`,[owner,space,JSON.stringify(claim.snapshot)]);
          if(current.rows[0].count!==claim.snapshot.length)throw new AuthError(409,'A source changed while Studio was working. Start a new document.');
          const saved=await db.query("UPDATE saas.studio_outputs SET status='ready',title=$5,document=$6,sources=$7,lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND user_id=$2 AND space_id=$3 AND lease_id=$4 AND status='generating' AND lease_until>now() RETURNING id",[id,owner,space,lease,result.document.title,JSON.stringify(result.document),JSON.stringify(result.sources)]);
          if(!saved.rowCount)throw new AuthError(409,'This generation expired. Please retry.');
        });
        return {output:await read(owner,id),cached:false};
      }catch(error){await pool.query("UPDATE saas.studio_outputs SET status='failed',lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND user_id=$2 AND lease_id=$3 AND status='generating'",[id,owner,lease]).catch(()=>undefined);throw error;}
    },
  };
}
