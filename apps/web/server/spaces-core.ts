import type { Pool, PoolClient } from 'pg';
import { AuthError } from './auth-core';
import type { SpaceSession, SpaceDetail } from '../lib/spaces-types';

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AuthError(400, 'Invalid identifier.');
  return value.toLowerCase();
}
function text(value: unknown, max: number, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new AuthError(400, `${label} must contain 1–${max} characters.`);
  return value.trim();
}
function fields(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new AuthError(400, 'Unsupported field.');
}
function space(row: Record<string, unknown>): SpaceSession {
  return { id: String(row.id), title: String(row.title), query: String(row.initial_query), pinned: Boolean(row.pinned),
    momentsCount: Number(row.moments_count ?? 0), createdAt: (row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at))).toISOString(), updatedAt: (row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at))).toISOString() };
}
export function createSpaces(pool: Pool) {
  async function transaction<T>(userId: string, id: string, run: (db: PoolClient) => Promise<T>) {
    uuid(id);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const owned = await db.query('SELECT id FROM saas.spaces WHERE user_id=$1 AND id=$2 FOR UPDATE', [userId,id]);
      if (!owned.rowCount) throw new AuthError(404, 'Space not found.');
      const result = await run(db);
      await db.query('UPDATE saas.spaces SET updated_at=clock_timestamp() WHERE user_id=$1 AND id=$2',[userId,id]);
      await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  async function read(userId: string, id: string): Promise<SpaceDetail> {
    uuid(id);
    // A consistent snapshot avoids combining messages/moments from different revisions.
    const db = await pool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const found = await db.query(`SELECT s.*, (SELECT count(*) FROM saas.moments m WHERE m.user_id=s.user_id AND m.space_id=s.id) AS moments_count
        FROM saas.spaces s WHERE s.user_id=$1 AND s.id=$2`,[userId,id]);
      if (!found.rowCount) throw new AuthError(404,'Space not found.');
      const messages = await db.query('SELECT id,role,content,sequence_no AS sequence,created_at AS "createdAt" FROM saas.messages WHERE user_id=$1 AND space_id=$2 ORDER BY sequence_no LIMIT 1000',[userId,id]);
      const moments = await db.query(`SELECT m.id,m.asset_id AS "assetId",m.title,m.notes,m.transcript,m.description,m.evidence_status AS "evidenceStatus",m.start_s AS "startS",m.end_s AS "endS",a.original_filename AS filename,a.source_type AS source
        FROM saas.moments m JOIN public.media_assets a ON a.id=m.asset_id AND a.user_id=m.user_id WHERE m.user_id=$1 AND m.space_id=$2 ORDER BY m.created_at,m.id LIMIT 500`,[userId,id]);
      const shortlist = await db.query('SELECT moment_id FROM saas.shortlist_items WHERE user_id=$1 AND space_id=$2 ORDER BY position',[userId,id]);
      const citations=await db.query(`SELECT mm.message_id,m.id AS "momentId",m.asset_id AS "assetId",m.start_s AS "startS",m.end_s AS "endS",m.title,a.original_filename AS filename
        FROM saas.message_moments mm JOIN saas.moments m ON m.user_id=mm.user_id AND m.space_id=mm.space_id AND m.id=mm.moment_id
        JOIN public.media_assets a ON a.user_id=m.user_id AND a.id=m.asset_id WHERE mm.user_id=$1 AND mm.space_id=$2 ORDER BY mm.message_id,mm.position LIMIT 20000`,[userId,id]);
      const runs=await db.query(`SELECT CASE WHEN state='processing' AND expires_at<=now() THEN 'failed' ELSE state END AS state FROM saas.reply_runs WHERE user_id=$1 AND space_id=$2 ORDER BY updated_at DESC LIMIT 1`,[userId,id]);
      await db.query('COMMIT');
      return { space: space(found.rows[0]), messages: messages.rows.map(m=>({...m,sequence:Number(m.sequence),createdAt:new Date(m.createdAt).toISOString(),citations:citations.rows.filter(c=>c.message_id===m.id).map(c=>({momentId:c.momentId,assetId:c.assetId,startS:c.startS,endS:c.endS,title:c.title,filename:c.filename}))})), moments:moments.rows,shortlist:shortlist.rows.map(m=>m.moment_id),replyState:runs.rows[0]?.state??null };
    } catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();}
  }
  return {
    read,
    async sources(userId:string,id:string,before?:string|null) {
      uuid(id);
      const owned=await pool.query('SELECT id FROM saas.spaces WHERE user_id=$1 AND id=$2',[userId,id]);
      if(!owned.rowCount)throw new AuthError(404,'Space not found.');
      if(before&&(before.length>64||!before.length))throw new AuthError(400,'Invalid source cursor.');
      const result=await pool.query('SELECT id,original_filename AS filename,duration FROM public.media_assets WHERE user_id=$1 AND ($2::text IS NULL OR id>$2) ORDER BY id LIMIT 101',[userId,before||null]);
      return {sources:result.rows.slice(0,100),nextCursor:result.rows.length>100?result.rows[99].id:null};
    },
    async list(userId: string, before?: string | null) {
      if (before) uuid(before);
      // Immutable creation ordering makes pagination stable while spaces are edited.
      const result = await pool.query(`SELECT s.*,(SELECT count(*) FROM saas.moments m WHERE m.user_id=s.user_id AND m.space_id=s.id) AS moments_count
        FROM saas.spaces s WHERE s.user_id=$1 AND ($2::uuid IS NULL OR (s.created_at,s.id)<(SELECT created_at,id FROM saas.spaces WHERE user_id=$1 AND id=$2))
        ORDER BY s.created_at DESC,s.id DESC LIMIT 51`,[userId,before||null]);
      return {spaces:result.rows.slice(0,50).map(space),nextCursor:result.rows.length>50?result.rows[49].id:null};
    },
    async create(userId: string,input: Record<string,unknown>) {
      fields(input,['id','query','title']); const id=uuid(input.id),query=text(input.query,12000,'Query');
      const title=input.title===undefined?query.slice(0,80):text(input.title,200,'Title');
      const db=await pool.connect();
      try {
        await db.query('BEGIN');
        await db.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[userId]);
        const prior=await db.query('SELECT * FROM saas.spaces WHERE user_id=$1 AND id=$2',[userId,id]);
        if(prior.rowCount){if(prior.rows[0].initial_query!==query)throw new AuthError(409,'This request identifier was already used.');await db.query('COMMIT');return space(prior.rows[0]);}
        const count=await db.query('SELECT count(*) FROM saas.spaces WHERE user_id=$1',[userId]);
        if(Number(count.rows[0].count)>=1000)throw new AuthError(409,'Your space limit has been reached.');
        const result=await db.query('INSERT INTO saas.spaces(id,user_id,title,initial_query) VALUES($1,$2,$3,$4) RETURNING *',[id,userId,title,query]);
        await db.query("INSERT INTO saas.messages(user_id,space_id,sequence_no,role,content) VALUES($1,$2,1,'user',$3)",[userId,id,query]);
        await db.query('COMMIT');return space(result.rows[0]);
      } catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
    },
    async update(userId:string,id:string,input:Record<string,unknown>) {
      fields(input,['title','pinned']);
      if(!Object.keys(input).length)throw new AuthError(400,'Choose a field to update.');
      const title=input.title===undefined?null:text(input.title,200,'Title');
      if(input.pinned!==undefined&&typeof input.pinned!=='boolean')throw new AuthError(400,'Pinned must be a boolean.');
      await transaction(userId,id,async db=>{await db.query('UPDATE saas.spaces SET title=COALESCE($3,title),pinned=COALESCE($4,pinned) WHERE user_id=$1 AND id=$2',[userId,id,title,input.pinned??null]);});
      return (await read(userId,id)).space;
    },
    async remove(userId:string,id:string) {
      uuid(id);const result=await pool.query('DELETE FROM saas.spaces WHERE user_id=$1 AND id=$2',[userId,id]);
      if(!result.rowCount)throw new AuthError(404,'Space not found.');
    },
    async message(userId:string,id:string,input:Record<string,unknown>) {
      fields(input,['id','content']);const messageId=uuid(input.id),content=text(input.content,12000,'Message');
      return transaction(userId,id,async db=>{
        const prior=await db.query('SELECT id,content,role,sequence_no FROM saas.messages WHERE user_id=$1 AND space_id=$2 AND id=$3',[userId,id,messageId]);
        if(prior.rowCount){if(prior.rows[0].content!==content||prior.rows[0].role!=='user')throw new AuthError(409,'This request identifier was already used.');return {id:messageId};}
        const active=await db.query("SELECT 1 FROM saas.reply_runs WHERE user_id=$1 AND space_id=$2 AND state='processing' AND expires_at>now()",[userId,id]);
        if(active.rowCount)throw new AuthError(409,'Brisky is still replying. Please wait before sending another message.');
        const sequence=await db.query('SELECT COALESCE(max(sequence_no),0)+1 AS next FROM saas.messages WHERE user_id=$1 AND space_id=$2',[userId,id]);
        if(Number(sequence.rows[0].next)>1000)throw new AuthError(409,'This space has reached its message limit. Start a new space.');
        await db.query("INSERT INTO saas.messages(id,user_id,space_id,sequence_no,role,content) VALUES($1,$2,$3,$4,'user',$5)",[messageId,userId,id,sequence.rows[0].next,content]);
        return {id:messageId};
      });
    },
    async moment(userId:string,id:string,input:Record<string,unknown>) {
      fields(input,['assetId','startS','endS','title','notes']);
      const assetId=text(input.assetId,64,'Asset'),title=input.title===undefined?'':text(input.title,500,'Title');
      const notes=input.notes===undefined?'':text(input.notes,12000,'Notes');
      const start=input.startS,end=input.endS;
      if(typeof start!=='number'||typeof end!=='number'||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new AuthError(400,'Choose a valid source time range.');
      return transaction(userId,id,async db=>{
        const asset=await db.query('SELECT duration FROM public.media_assets WHERE user_id=$1 AND id=$2 FOR KEY SHARE',[userId,assetId]);
        if(!asset.rowCount)throw new AuthError(404,'Source not found.');
        const duration=Number(asset.rows[0].duration);
        if(!Number.isFinite(duration)||duration<=0)throw new AuthError(409,'This file is not ready for saving timestamp ranges yet.');
        if(end>duration)throw new AuthError(400,'The range exceeds the source duration.');
        const existing=await db.query('SELECT id FROM saas.moments WHERE user_id=$1 AND space_id=$2 AND asset_id=$3 AND start_s=$4 AND end_s=$5',[userId,id,assetId,start,end]);
        if(existing.rowCount)return {id:existing.rows[0].id};
        const count=await db.query('SELECT count(*) FROM saas.moments WHERE user_id=$1 AND space_id=$2',[userId,id]);
        if(Number(count.rows[0].count)>=500)throw new AuthError(409,'This space has reached its moment limit.');
        const saved=await db.query('INSERT INTO saas.moments(user_id,space_id,asset_id,start_s,end_s,title,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[userId,id,assetId,start,end,title,notes]);
        return {id:saved.rows[0].id};
      });
    },
    async shortlist(userId:string,id:string,input:Record<string,unknown>) {
      fields(input,['momentIds']);
      if(!Array.isArray(input.momentIds)||input.momentIds.length>500)throw new AuthError(400,'Choose up to 500 moments.');
      const ids=input.momentIds.map(uuid);if(new Set(ids).size!==ids.length)throw new AuthError(400,'Duplicate moments are not allowed.');
      await transaction(userId,id,async db=>{
        const owned=await db.query('SELECT id FROM saas.moments WHERE user_id=$1 AND space_id=$2 AND id=ANY($3::uuid[])',[userId,id,ids]);
        if(owned.rowCount!==ids.length)throw new AuthError(404,'Moment not found in this space.');
        await db.query('DELETE FROM saas.shortlist_items WHERE user_id=$1 AND space_id=$2',[userId,id]);
        if(ids.length)await db.query('INSERT INTO saas.shortlist_items(user_id,space_id,moment_id,position) SELECT $1,$2,item,ordinality-1 FROM unnest($3::uuid[]) WITH ORDINALITY AS t(item,ordinality)',[userId,id,ids]);
      });return {momentIds:ids};
    },
  };
}
