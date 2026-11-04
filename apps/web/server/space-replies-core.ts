import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { AuthError } from './auth-core';
import { createSpaces,uuid } from './spaces-core';
export type ReplyContext={history:{role:'user'|'assistant';content:string}[];selection:{assetId:string;startS:number;endS:number;title:string;notes:string}[]};
type Evidence={id:string;assetId:string;startS:number;endS:number;title:string;filename:string;transcript:string;description:string;status:'indexed'|'matched'};
export type EngineReply={text:string;citations:Evidence[];evidence:Evidence[];searchStatus:string;usage?:unknown[]};

function validateReply(value:EngineReply){
  if(!value||typeof value.text!=='string'||!value.text.trim()||value.text.length>12000||!Array.isArray(value.evidence)||value.evidence.length>20||!Array.isArray(value.citations)||value.citations.length>20||!['complete','incomplete','not_requested'].includes(value.searchStatus))throw new AuthError(503,'Brisky could not return a complete reply. Please retry.');
  const ids=new Set<string>();
  for(const e of value.evidence){if(!e||typeof e.id!=='string'||ids.has(e.id)||typeof e.assetId!=='string'||e.assetId.length>64||!Number.isFinite(e.startS)||!Number.isFinite(e.endS)||e.startS<0||e.endS<=e.startS||typeof e.title!=='string'||e.title.length>500||typeof e.transcript!=='string'||e.transcript.length>12000||typeof e.description!=='string'||e.description.length>6000||!['indexed','matched'].includes(e.status))throw new AuthError(503,'Brisky returned unsupported source references.');ids.add(e.id);}
  const cited=new Set<string>(),ranges=new Set<string>();
  for(const c of value.citations){const e=value.evidence.find(e=>e.id===c?.id),range=`${c?.assetId}:${c?.startS}:${c?.endS}`;if(!e||cited.has(c.id)||ranges.has(range)||c.assetId!==e.assetId||c.startS!==e.startS||c.endS!==e.endS)throw new AuthError(503,'Brisky returned unsupported citations.');cited.add(c.id);ranges.add(range);}
}

export function createSpaceReplies(pool:Pool,generate:(context:ReplyContext)=>Promise<EngineReply>){
  async function locked<T>(owner:string,spaceId:string,work:(db:PoolClient)=>Promise<T>){
    const db=await pool.connect();try{await db.query('BEGIN');const found=await db.query('SELECT id FROM saas.spaces WHERE user_id=$1 AND id=$2 FOR UPDATE',[owner,spaceId]);if(!found.rowCount)throw new AuthError(404,'Space not found.');const result=await work(db);await db.query('COMMIT');return result;}
    catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  return {async reply(owner:string,spaceId:string,triggerId:string){
    uuid(spaceId);uuid(triggerId);const lease=randomUUID();
    const cached=await locked(owner,spaceId,async db=>{
      const trigger=await db.query("SELECT id,sequence_no FROM saas.messages WHERE user_id=$1 AND space_id=$2 AND id=$3 AND role='user'",[owner,spaceId,triggerId]);
      if(!trigger.rowCount)throw new AuthError(404,'Message not found.');
      const prior=await db.query('SELECT state,assistant_message_id FROM saas.reply_runs WHERE user_id=$1 AND space_id=$2 AND trigger_message_id=$3',[owner,spaceId,triggerId]);
      if(prior.rows[0]?.state==='complete')return prior.rows[0].assistant_message_id as string;
      const latest=await db.query('SELECT id,sequence_no FROM saas.messages WHERE user_id=$1 AND space_id=$2 ORDER BY sequence_no DESC LIMIT 1',[owner,spaceId]);
      if(latest.rows[0].id!==triggerId)throw new AuthError(409,'Open the latest message to continue this conversation.');
      if(Number(latest.rows[0].sequence_no)>=1000)throw new AuthError(409,'This space is full. Please start a new space.');
      await db.query("UPDATE saas.reply_runs SET state='failed',updated_at=now() WHERE user_id=$1 AND space_id=$2 AND state='processing' AND expires_at<=now()",[owner,spaceId]);
      const active=await db.query("SELECT 1 FROM saas.reply_runs WHERE user_id=$1 AND space_id=$2 AND state='processing'",[owner,spaceId]);
      if(active.rowCount)throw new AuthError(409,'Brisky is already replying. Please wait a moment.');
      await db.query(`INSERT INTO saas.reply_runs(user_id,space_id,trigger_message_id,state,lease_id,expires_at) VALUES($1,$2,$3,'processing',$4,now()+interval '2 minutes')
        ON CONFLICT(space_id,trigger_message_id) DO UPDATE SET state='processing',lease_id=excluded.lease_id,expires_at=excluded.expires_at,updated_at=now()`,[owner,spaceId,triggerId,lease]);return null;
    });
    if(cached)return {messageId:cached,cached:true};
    try{
      const snapshot=await createSpaces(pool).read(owner,spaceId);
      const history:ReplyContext['history']=[];let size=0;
      for(const message of [...snapshot.messages].reverse()){if(history.length>=20||size+message.content.length>32000)break;history.unshift({role:message.role,content:message.content});size+=message.content.length;}
      const chosen=snapshot.shortlist.length?snapshot.shortlist.map(id=>snapshot.moments.find(m=>m.id===id)!):snapshot.moments;
      const selection=chosen.slice(0,20).map(m=>({assetId:m.assetId,startS:m.startS,endS:m.endS,title:m.title,notes:m.notes.slice(0,2000)}));
      const response=await generate({history,selection});validateReply(response);
      return await locked(owner,spaceId,async db=>{
        const claim=await db.query("SELECT 1 FROM saas.reply_runs WHERE user_id=$1 AND space_id=$2 AND trigger_message_id=$3 AND lease_id=$4 AND state='processing' AND expires_at>now()",[owner,spaceId,triggerId,lease]);
        if(!claim.rowCount)throw new AuthError(409,'This reply has expired. Please retry.');
        const latest=await db.query('SELECT id,sequence_no FROM saas.messages WHERE user_id=$1 AND space_id=$2 ORDER BY sequence_no DESC LIMIT 1',[owner,spaceId]);
        if(latest.rows[0].id!==triggerId)throw new AuthError(409,'The conversation changed. Retry the latest message.');
        const count=await db.query('SELECT count(*) FROM saas.moments WHERE user_id=$1 AND space_id=$2',[owner,spaceId]);
        const momentIds=new Map<string,string>();let total=Number(count.rows[0].count);
        for(const e of response.evidence){
          const asset=await db.query('SELECT duration FROM public.media_assets WHERE user_id=$1 AND id=$2 FOR KEY SHARE',[owner,e.assetId]);
          if(!asset.rowCount||!Number.isFinite(Number(asset.rows[0].duration))||Number(asset.rows[0].duration)<e.endS)throw new AuthError(503,'A source changed while Brisky was replying. Please retry.');
          const existing=await db.query('SELECT id FROM saas.moments WHERE user_id=$1 AND space_id=$2 AND asset_id=$3 AND start_s=$4 AND end_s=$5',[owner,spaceId,e.assetId,e.startS,e.endS]);
          if(!existing.rowCount&&++total>500)throw new AuthError(409,'This space has reached its moment limit.');
          const saved=await db.query(`INSERT INTO saas.moments(user_id,space_id,asset_id,start_s,end_s,title,transcript,description,evidence_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT(space_id,asset_id,start_s,end_s) DO UPDATE SET transcript=excluded.transcript,description=excluded.description,evidence_status=excluded.evidence_status RETURNING id`,[owner,spaceId,e.assetId,e.startS,e.endS,e.title,e.transcript,e.description,e.status]);momentIds.set(e.id,saved.rows[0].id);
        }
        const messageId=randomUUID();
        await db.query("INSERT INTO saas.messages(id,user_id,space_id,sequence_no,role,content) VALUES($1,$2,$3,$4,'assistant',$5)",[messageId,owner,spaceId,Number(latest.rows[0].sequence_no)+1,response.text.trim()]);
        for(const [position,citation] of response.citations.entries())await db.query('INSERT INTO saas.message_moments(user_id,space_id,message_id,moment_id,position) VALUES($1,$2,$3,$4,$5)',[owner,spaceId,messageId,momentIds.get(citation.id),position]);
        const usage=JSON.stringify(response.usage??[]);if(usage.length>16000)throw new AuthError(503,'Invalid reply metadata.');
        await db.query("UPDATE saas.reply_runs SET state='complete',assistant_message_id=$5,usage=$6::jsonb,updated_at=now() WHERE user_id=$1 AND space_id=$2 AND trigger_message_id=$3 AND lease_id=$4",[owner,spaceId,triggerId,lease,messageId,usage]);
        await db.query('UPDATE saas.spaces SET updated_at=clock_timestamp() WHERE user_id=$1 AND id=$2',[owner,spaceId]);return {messageId,cached:false};
      });
    }catch(error){await pool.query("UPDATE saas.reply_runs SET state='failed',updated_at=now() WHERE user_id=$1 AND space_id=$2 AND trigger_message_id=$3 AND lease_id=$4 AND state='processing'",[owner,spaceId,triggerId,lease]);throw error;}
  }};
}
