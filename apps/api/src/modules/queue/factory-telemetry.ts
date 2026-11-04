import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { FactoryJobEnvelope } from './indexing.types';
import { Job,DelayedError } from 'bullmq';

export const factoryStage=(step:string):string|null=>{
  if(/scene|keyframe/.test(step))return 'scenes';
  if(/transcri|audio/.test(step))return 'transcribe';
  if(/analy|gemini_video|visual/.test(step))return 'understand';
  if(/embed|finalize|reused_index/.test(step))return 'index';
  if(/purge|cleanup/.test(step))return 'purge';
  if(/download|probe|ffmpeg_outputs|proxy|fetch|reading_from_connector/.test(step))return 'fetch';
  return null;
};
export async function updateFactoryProgress(db:DatabaseService,jobId:string,owner:string,stage:string,done:number,total:number){
  if(!Number.isSafeInteger(done)||!Number.isSafeInteger(total)||total<=0||done<0||done>total)throw new Error('Invalid measured Factory progress');
  await db.query(`UPDATE factory_stage_runs SET completed_items=$4,total_items=$5 WHERE bull_job_id=$1 AND user_id=$2 AND stage=$3 AND status='running'`,[jobId,owner,stage,done,total]);
}
export async function recordFactoryStep<T>(db:DatabaseService,job:Job,env:FactoryJobEnvelope,step:string,run:()=>Promise<T>):Promise<T>{
  const stage=factoryStage(step);if(!stage)return run();
  const id=randomUUID(),started=Date.now();
  // Owner-scoped insertion; telemetry must not turn successfully processed media into failures.
  let recorded=false;
  try { const result=await db.query(`INSERT INTO factory_stage_runs(id,user_id,asset_id,bull_job_id,attempt,stage,step,status)
    SELECT $1::uuid,$2::uuid,$3::varchar(64),$4::varchar(128),$5::int,$6::text,$7::text,'running' FROM media_assets WHERE id=$3::varchar(64) AND user_id=$2::uuid`,
    [id,env.user_id,env.asset_id,String(job.id||env.job_id||''),(job.attemptsMade||0)+1,stage,step]);recorded=(result.rowCount||0)>0; }catch{}
  let status='completed';
  try{return await run();}catch(error){status=error instanceof DelayedError?'deferred':'failed';throw error;}
  finally{if(recorded)try{await db.query(`UPDATE factory_stage_runs SET status=$2,finished_at=NOW(),duration_ms=$3 WHERE id=$1 AND user_id=$4`,[id,status,Date.now()-started,env.user_id]);}catch{}}
}

export const factoryRunsSql=`SELECT r.id,r.asset_id,r.stage,r.step,r.attempt,r.bull_job_id,
  CASE WHEN r.status='running' AND NOT EXISTS(SELECT 1 FROM indexing_jobs j WHERE j.bull_job_id=r.bull_job_id AND j.user_id=r.user_id AND j.status='active'
    AND COALESCE(j.last_heartbeat_at,j.started_at,j.created_at)>NOW()-INTERVAL '15 minutes') THEN 'interrupted' ELSE r.status END AS status,
  r.started_at,r.finished_at,r.duration_ms,m.original_filename AS name,m.status AS asset_status,m.stage AS asset_stage,
  CASE WHEN r.total_items>0 THEN floor(100.0*r.completed_items/r.total_items)::int ELSE NULL END AS progress,r.completed_items,r.total_items
  FROM factory_stage_runs r JOIN media_assets m ON m.id=r.asset_id AND m.user_id=r.user_id
  WHERE r.user_id=$1 AND (r.started_at>=date_trunc('day',NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
    OR r.finished_at>=date_trunc('day',NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos' OR r.status='running')
  ORDER BY r.started_at DESC`;

export function summarizeFactoryRuns(rows:any[]){
  return ['fetch','scenes','transcribe','understand','index','purge'].map(id=>{
    // Cleanup of an intermediate scratch directory is not completion of the file's final stage.
    const runs=rows.filter(r=>r.stage===id && (id!=='purge'||['indexed','partially_indexed'].includes(r.asset_status))),complete=runs.filter(r=>r.status==='completed'),failed=runs.filter(r=>r.status==='failed');
    const live=runs.filter(r=>r.status==='running');
    const grouped=[...new Set(runs.map(r=>r.asset_id))].map(assetId=>{
      const steps=runs.filter(r=>r.asset_id===assetId),latest=steps[0];
      return {id:assetId,assetId,name:latest.name,status:steps.some(s=>s.status==='running')?'running':latest.status,step:latest.step,at:latest.finished_at||latest.started_at,
        attempt:latest.attempt,currentStage:latest.asset_stage,
        steps:steps.slice(0,20).map(s=>({id:s.id,step:s.step,status:s.status,attempt:s.attempt,at:s.finished_at||s.started_at}))};
    });
    return {id,doneToday:new Set(complete.map(r=>r.asset_id)).size,failedToday:new Set(failed.map(r=>r.asset_id)).size,
      completedRuns:complete.length,failedRuns:failed.length,avgDurationMs:complete.length?complete.reduce((n,r)=>n+Number(r.duration_ms||0),0)/complete.length:null,
      successRate:complete.length+failed.length?100*complete.length/(complete.length+failed.length):null,
      files:live.filter((r,i)=>live.findIndex(other=>other.asset_id===r.asset_id)===i).map(r=>({id:r.asset_id,name:r.name,progress:r.progress==null?null:Number(r.progress),note:r.total_items>0?`${r.completed_items} of ${r.total_items} ${id==='scenes'?'frames':'windows'} completed`:String(r.step||id).replaceAll('_',' ')})),
      activity:grouped.slice(0,100)};
  });
}
