import {BadRequestException,Injectable,Logger,NotFoundException,OnApplicationBootstrap,OnModuleDestroy} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {randomUUID} from 'crypto';
import {DatabaseService} from '../database/database.service';
import {FaceMatchingService} from './face-matching.service';
import {archiveProfile,claimArchiveSql,discoverArchiveSql,referenceRevisionSql} from './face-archive.sql';
import {ownerId,uuid} from './people.validation';

@Injectable()
export class FaceArchiveService implements OnApplicationBootstrap,OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;
  private working=false;
  private stopping=false;
  private readonly logger=new Logger(FaceArchiveService.name);
  constructor(private readonly db:DatabaseService,private readonly faces:FaceMatchingService,private readonly config:ConfigService){}
  onApplicationBootstrap(){
    if(this.config.get('IS_WORKER','false')!=='true'||this.config.get('FACE_RECOGNITION_ENABLED','false')!=='true'||this.config.get('FACE_ARCHIVE_WORKER_ENABLED','true')!=='true')return;
    this.timer=setInterval(()=>{void this.tick().catch(()=>this.logger.warn('Local face archive tick failed; work remains resumable'));},10000);
    this.timer.unref();
  }
  onModuleDestroy(){this.stopping=true;if(this.timer)clearInterval(this.timer);}
  async status(owner:string,person:string){
    ownerId(owner);uuid(person);
    if(!(await this.db.query('SELECT 1 FROM people WHERE user_id=$1 AND id=$2',[owner,person])).rowCount)throw new NotFoundException();
    const setting=(await this.db.query(`SELECT enabled,discovered_at>now()-interval '2 minutes' AS worker_available FROM face_archive_settings WHERE user_id=$1 AND person_id=$2`,[owner,person])).rows[0];
    const reference=(await this.db.query(referenceRevisionSql,[owner,person])).rows[0];
    const states=(await this.db.query(`SELECT j.state,count(*)::int AS count,sum(j.frames_scanned)::int AS frames,sum(j.suggested)::int AS suggestions FROM face_archive_jobs j JOIN media_assets a ON a.user_id=j.user_id AND a.id=j.asset_id WHERE j.user_id=$1 AND j.person_id=$2 AND j.reference_revision=$3 AND j.profile=$4 AND a.checksum=j.asset_checksum AND a.duration=j.source_duration GROUP BY j.state`,[owner,person,reference.revision,archiveProfile])).rows;
    const problems=(await this.db.query(`SELECT a.original_filename AS filename,j.error_code AS code,j.start_s AS "startS" FROM face_archive_jobs j JOIN media_assets a ON a.user_id=j.user_id AND a.id=j.asset_id WHERE j.user_id=$1 AND j.person_id=$2 AND j.reference_revision=$3 AND j.profile=$4 AND a.checksum=j.asset_checksum AND j.state IN ('blocked','failed') ORDER BY j.updated_at DESC LIMIT 8`,[owner,person,reference.revision,archiveProfile])).rows;
    const assets=(await this.db.query(`SELECT count(*)::int AS discovered,count(*) FILTER(WHERE completed)::int AS completed FROM (SELECT j.asset_id,bool_and(j.state='completed') AND abs(sum(j.end_s-j.start_s)-max(j.source_duration))<0.00001 AS completed FROM face_archive_jobs j JOIN media_assets a ON a.user_id=j.user_id AND a.id=j.asset_id WHERE j.user_id=$1 AND j.person_id=$2 AND j.reference_revision=$3 AND j.profile=$4 AND a.checksum=j.asset_checksum AND a.duration=j.source_duration GROUP BY j.asset_id) grouped`,[owner,person,reference.revision,archiveProfile])).rows[0];
    return {enabled:setting?.enabled??false,workerAvailable:setting?.worker_available??false,hasReferences:Number(reference.count)>0,profile:archiveProfile,assets,states,problems,sampled:true,reviewRequired:true};
  }
  async configure(owner:string,person:string,body:any){
    ownerId(owner);uuid(person);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='enabled')||typeof body.enabled!=='boolean')throw new BadRequestException('Choose whether to scan your library');
    const result=await this.db.query(`INSERT INTO face_archive_settings(user_id,person_id,enabled) SELECT $1,id,$3 FROM people WHERE user_id=$1 AND id=$2 ON CONFLICT(user_id,person_id) DO UPDATE SET enabled=excluded.enabled,updated_at=now() RETURNING enabled`,[owner,person,body.enabled]);
    if(!result.rowCount)throw new NotFoundException();
    if(!body.enabled)await this.db.query(`UPDATE face_archive_jobs SET state='cancelled',updated_at=now(),lease_token=NULL,lease_until=NULL WHERE user_id=$1 AND person_id=$2 AND state IN ('queued','running')`,[owner,person]);
    else await this.db.query(`UPDATE face_archive_jobs SET state='queued',attempts=0,error_code=NULL,next_attempt_at=now(),updated_at=now() WHERE user_id=$1 AND person_id=$2 AND state='cancelled'`,[owner,person]);
    return this.status(owner,person);
  }
  async retry(owner:string,person:string){
    ownerId(owner);uuid(person);
    if(!(await this.db.query('SELECT 1 FROM people WHERE user_id=$1 AND id=$2',[owner,person])).rowCount)throw new NotFoundException();
    await this.db.query(`UPDATE face_archive_jobs SET state='queued',attempts=0,error_code=NULL,next_attempt_at=now(),updated_at=now() WHERE user_id=$1 AND person_id=$2 AND state IN ('blocked','failed')`,[owner,person]);
    return this.status(owner,person);
  }
  async discover(){
    const settings=(await this.db.query(`SELECT user_id,person_id FROM face_archive_settings WHERE enabled ORDER BY discovered_at,user_id,person_id LIMIT 20`)).rows;
    for(const setting of settings){
      const {user_id:owner,person_id:person}=setting;
      const ref=(await this.db.query(referenceRevisionSql,[owner,person])).rows[0];
      await this.db.query('UPDATE face_archive_settings SET discovered_at=now() WHERE user_id=$1 AND person_id=$2',[owner,person]);
      if(!Number(ref?.count))continue;
      const held=await this.db.query(`SELECT count(*) FILTER(WHERE state IN ('queued','running'))::int AS pending,bool_or(state='blocked' AND error_code='no_reference') AS no_reference FROM face_archive_jobs WHERE user_id=$1 AND person_id=$2 AND reference_revision=$3 AND profile=$4 AND state IN ('queued','running','blocked')`,[owner,person,ref.revision,archiveProfile]);
      if(held.rows[0].no_reference||Number(held.rows[0].pending)>=128)continue;
      for(const asset of (await this.db.query(discoverArchiveSql,[owner,person,ref.revision,archiveProfile])).rows){
        await this.db.query(`INSERT INTO face_archive_jobs(user_id,person_id,asset_id,asset_checksum,reference_revision,profile,start_s,end_s,source_duration) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 WHERE EXISTS(SELECT 1 FROM face_archive_settings WHERE user_id=$1 AND person_id=$2 AND enabled) ON CONFLICT DO NOTHING`,[owner,person,asset.id,asset.checksum,ref.revision,archiveProfile,asset.start_s,asset.end_s,asset.duration]);
      }
    }
  }
  async tick(){
    if(this.working||this.stopping)return;
    this.working=true;
    try{
      await this.db.query(`UPDATE face_archive_jobs SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error_code='worker_interrupted',lease_token=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now() WHERE state='running' AND lease_until<now()`);
      await this.discover();
      const job=(await this.db.query(claimArchiveSql,[randomUUID(),archiveProfile])).rows[0];
      if(job)await this.run(job);
    }finally{this.working=false;}
  }
  async run(job:any){
    const params=[job.id,job.lease_token];
    try{
      const revision=(await this.db.query(referenceRevisionSql,[job.user_id,job.person_id])).rows[0];
      if(revision.revision!==job.reference_revision){await this.finish(params,'cancelled','references_changed');return;}
      // A checksum-equivalent source can reuse suggestions without decoding media.
      // Restrict donors to this owner/person, exact content, reference/model/window.
      const donor=(await this.db.query(`SELECT j.id,j.asset_id,j.frames_scanned FROM face_archive_jobs j JOIN media_assets a ON a.user_id=j.user_id AND a.id=j.asset_id WHERE j.user_id=$1 AND j.person_id=$2 AND j.asset_checksum=$3 AND a.checksum=j.asset_checksum AND a.duration=j.source_duration AND j.reference_revision=$4 AND j.profile=$5 AND j.start_s=$6 AND j.end_s=$7 AND j.source_duration=$8 AND j.state='completed' AND j.id!=$9 ORDER BY j.created_at LIMIT 1`,[job.user_id,job.person_id,job.asset_checksum,job.reference_revision,job.profile,job.start_s,job.end_s,job.source_duration,job.id])).rows[0];
      if(donor&&/^(?:[0-9a-f]{32}|[0-9a-f]{64})$/i.test(job.asset_checksum)){
        const copied=await this.db.query(`INSERT INTO face_suggestions(user_id,person_id,reference_id,reference_version,reference_checksum,asset_id,asset_checksum,frame_s,box,score,model)
          SELECT s.user_id,s.person_id,s.reference_id,s.reference_version,s.reference_checksum,j.asset_id,j.asset_checksum,s.frame_s,s.box,s.score,s.model FROM face_suggestions s
          JOIN person_appearances r ON r.user_id=s.user_id AND r.id=s.reference_id AND r.updated_at=s.reference_version AND r.origin='manual' AND r.status='confirmed'
          JOIN media_assets ra ON ra.user_id=r.user_id AND ra.id=r.asset_id AND ra.checksum=s.reference_checksum
          JOIN face_archive_jobs j ON j.id=$1 AND j.user_id=s.user_id AND j.person_id=s.person_id
          JOIN face_archive_settings setting ON setting.user_id=j.user_id AND setting.person_id=j.person_id AND setting.enabled
          JOIN media_assets a ON a.user_id=j.user_id AND a.id=j.asset_id AND a.checksum=j.asset_checksum AND a.duration=j.source_duration AND a.status='indexed' AND (a.availability IS NULL OR a.availability!='offline')
          WHERE s.user_id=$3 AND s.person_id=$4 AND s.asset_id=$5 AND s.asset_checksum=j.asset_checksum AND s.status!='rejected' AND s.frame_s>=$6 AND s.frame_s<$7
          AND j.state='running' AND j.lease_token=$2 AND j.lease_until>now() ON CONFLICT DO NOTHING RETURNING id`,[job.id,job.lease_token,job.user_id,job.person_id,donor.asset_id,job.start_s,job.end_s]);
        await this.finish(params,'completed',null,copied.rowCount||0,Number(donor.frames_scanned),donor.id);return;
      }
      const result=await this.faces.scan(job.user_id,job.person_id,{assetId:job.asset_id},{jobId:job.id,leaseToken:job.lease_token,startS:Number(job.start_s),endS:Number(job.end_s),referenceRevision:job.reference_revision,assetChecksum:job.asset_checksum,sourceDuration:Number(job.source_duration)});
      await this.finish(params,'completed',null,result.suggested,result.framesScanned);
    }catch(error){
      const status=typeof (error as any)?.getStatus==='function'?(error as any).getStatus():503;
      if(status===404){await this.finish(params,'cancelled','source_unavailable');return;}
      const code=status===422?'no_reference':status===400?'preview_too_large':status===409?'preview_or_revision_changed':'local_runtime_unavailable';
      if(Number(job.attempts)<3&&status!==422&&status!==400){
        await this.db.query(`UPDATE face_archive_jobs SET state='queued',error_code=$3,next_attempt_at=now()+interval '1 minute',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND state='running'`,[...params,code]);
      }else await this.finish(params,status===422||status===400||status===409?'blocked':'failed',code);
    }
  }
  private async finish(params:any[],state:string,code:string|null,suggested=0,frames=0,donor:string|null=null){
    await this.db.query(`UPDATE face_archive_jobs SET state=$3,error_code=$4,suggested=$5,frames_scanned=$6,reused_from=$7,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND state='running'`,[...params,state,code,suggested,frames,donor]);
  }
}
