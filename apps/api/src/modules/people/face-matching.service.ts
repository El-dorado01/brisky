import { BadRequestException,ConflictException,Injectable,NotFoundException,ServiceUnavailableException,UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { DatabaseService } from '../database/database.service';
import { MediaService } from '../media/media.service';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { resolveFromRepo } from '../../common/repo-paths';
import { ownerId,uuid } from './people.validation';
import { faceReferenceCandidates } from './face-references';
import { referenceAssetSql,referenceCheckInput,referenceCheckResult } from './reference-check';
import {competitorReferencesSql,referenceRevisionSql} from './face-archive.sql';
import {faceFrameTimes} from './face-sampling';
import {openSeekableMediaSource} from '../pipeline/seekable-media-source';

type FaceSource={path:string;version:string;validate:()=>Promise<void>;close:()=>Promise<void>};

export type ArchiveScan={jobId:string;leaseToken:string;startS:number;endS:number;referenceRevision:string;assetChecksum:string;sourceDuration:number};

export const currentSuggestionSql=`FROM face_suggestions s
 JOIN person_appearances r ON r.id=s.reference_id AND r.user_id=s.user_id AND r.person_id=s.person_id
 JOIN media_assets a ON a.id=s.asset_id AND a.user_id=s.user_id
 JOIN media_assets ra ON ra.id=r.asset_id AND ra.user_id=r.user_id
 WHERE s.user_id=$1 AND r.origin='manual' AND r.status='confirmed' AND r.updated_at=s.reference_version
 AND ra.checksum=s.reference_checksum AND a.checksum=s.asset_checksum
 AND (a.availability IS NULL OR a.availability!='offline') AND (ra.availability IS NULL OR ra.availability!='offline')
 AND s.frame_s<a.duration`;

@Injectable()
export class FaceMatchingService {
  private scanning=false;
  constructor(private readonly db:DatabaseService,private readonly media:MediaService,private readonly ffmpeg:FfmpegService,private readonly config:ConfigService){}
  private async assertArchive(owner:string,person:string,context:ArchiveScan){
    const active=await this.db.query(`SELECT 1 FROM face_archive_jobs j JOIN face_archive_settings s ON s.user_id=j.user_id AND s.person_id=j.person_id JOIN media_assets a ON a.id=j.asset_id AND a.user_id=j.user_id WHERE j.id=$1 AND j.user_id=$2 AND j.person_id=$3 AND j.lease_token=$4 AND j.state='running' AND j.lease_until>now() AND s.enabled AND a.checksum=j.asset_checksum AND a.duration=j.source_duration AND a.status='indexed' AND (a.availability IS NULL OR a.availability!='offline')`,[context.jobId,owner,person,context.leaseToken]);
    const refs=(await this.db.query(referenceRevisionSql,[owner,person])).rows[0];
    if(!active.rowCount||refs?.revision!==context.referenceRevision)throw new ConflictException('Archive work was cancelled or its sources changed');
  }
  async list(owner:string,person:string){ownerId(owner);uuid(person);return {items:(await this.db.query(`SELECT s.id,s.asset_id AS "assetId",a.original_filename AS filename,s.frame_s AS "frameS",s.box,s.score,s.status ${currentSuggestionSql} AND s.person_id=$2 AND s.status='pending' ORDER BY s.created_at,s.id LIMIT 100`,[owner,person])).rows};}
  private async frame(path:string,time:number,signal?:AbortSignal){
    const binary=this.ffmpeg.getFfmpegPath();if(!binary)throw new ServiceUnavailableException('Face frame decoder unavailable');
    return new Promise<Buffer>((resolve,reject)=>execFile(binary,['-hide_banner','-loglevel','error','-nostdin','-threads','1','-ss',String(time),'-i',path,'-an','-frames:v','1','-vf','scale=min(1280\\,iw):-2,setsar=1','-threads','1','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{timeout:10000,maxBuffer:4*1024*1024,windowsHide:true,encoding:'buffer',signal},(error,output)=>error||!output.length?reject(new ServiceUnavailableException('Unable to prepare face frame')):resolve(output)));
  }
  private async source(owner:string,asset:string,signal?:AbortSignal):Promise<FaceSource>{
    const source=await this.media.getStreamInfo(asset,owner,false),limit=100*1024*1024;
    if(source.status==='ready'){
      const stat=await fs.stat(source.filePath);
      if(stat.size>limit)throw new BadRequestException('Pilot preview exceeds 100 MiB');
      const version=`${stat.size}:${stat.mtimeMs}`;
      return {path:source.filePath,version,close:async()=>{},validate:async()=>{
        const current=await fs.stat(source.filePath);
        if(`${current.size}:${current.mtimeMs}`!==version)throw new ConflictException('The source changed during the face check');
      }};
    }
    const session=await this.media.getRemotePlaybackSource(asset,owner,signal??AbortSignal.timeout(45000));
    if(!session)throw new ConflictException('The original source is unavailable. Check the connector and retry');
    if(session.size>limit)throw new BadRequestException('Pilot source exceeds 100 MiB');
    const bridge=await openSeekableMediaSource(session,{maxBytes:2*limit,signal,timeoutMs:150000});
    return {path:bridge.url,version:session.version,validate:()=>bridge.validate(),close:()=>bridge.close()};
  }
  async checkReference(owner:string,person:string,body:unknown){
    ownerId(owner);uuid(person);const input=referenceCheckInput(body);
    if(this.config.get('FACE_RECOGNITION_ENABLED','false')!=='true')throw new ServiceUnavailableException('Local face check is not enabled');
    if(this.scanning)throw new ConflictException('A local face check or scan is already running');
    this.scanning=true;let directory:string|undefined,source:FaceSource|undefined;const signal=AbortSignal.timeout(45000);
    try{
      const params=[owner,person,input.assetId,input.frame_s],asset=(await this.db.query(referenceAssetSql,params)).rows[0];
      if(!asset)throw new NotFoundException('Choose an available source and person');
      source=await this.source(owner,input.assetId,signal);const root=resolveFromRepo(this.config.get('STORAGE_ROOT','./storage'));
      await fs.mkdir(join(root,'face-scans'),{recursive:true});directory=await fs.mkdtemp(join(root,'face-scans','check-'));
      const image=join(directory,'frame.jpg'),manifest=join(directory,'input.json'),output=join(directory,'output.json');
      await fs.writeFile(image,await this.frame(source.path,input.frame_s,signal));
      await fs.writeFile(manifest,JSON.stringify({image,box:input.box}));
      const python=this.config.get<string>('FACE_PYTHON_BIN')||resolveFromRepo(process.platform==='win32'?'.venv-face/Scripts/python.exe':'.venv-face/bin/python');
      await new Promise<void>((resolve,reject)=>execFile(python,[resolveFromRepo('services/face-recognition/check_reference.py'),'--manifest',manifest,'--detector',join(root,'face-models','face_detection_yunet_2023mar.onnx'),'--recognizer',join(root,'face-models','face_recognition_sface_2021dec.onnx'),'--output',output],{timeout:20000,maxBuffer:16384,windowsHide:true,signal},error=>error?reject(new ServiceUnavailableException('Local face check could not finish')):resolve()));
      if((await fs.stat(output)).size>4096)throw new ServiceUnavailableException('Invalid face check size');
      const result=referenceCheckResult(JSON.parse(await fs.readFile(output,'utf8')));await source.validate();
      const refreshed=(await this.db.query(referenceAssetSql,params)).rows[0];
      if(!refreshed||refreshed.checksum!==asset.checksum||refreshed.duration!==asset.duration)throw new ConflictException('The source or person changed during the face check');
      return result;
    }finally{this.scanning=false;try{await source?.close();}finally{if(directory)await fs.rm(directory,{recursive:true,force:true});}}
  }
  async scan(owner:string,person:string,body:any,archive?:ArchiveScan){
    ownerId(owner);uuid(person);
    if(!body||typeof body!=='object'||Object.keys(body).some(k=>k!=='assetId')||typeof body.assetId!=='string'||! /^[a-zA-Z0-9_-]{1,64}$/.test(body.assetId))throw new BadRequestException('Choose one source');
    if(this.config.get('FACE_RECOGNITION_ENABLED','false')!=='true')throw new ServiceUnavailableException('Local face scan is not enabled');
    if(this.scanning)throw new ConflictException('A local face scan is already running');
    this.scanning=true;let directory:string|undefined;const sources=new Map<string,FaceSource>();
    const signal=AbortSignal.timeout(150000);
    try{
      if(archive){if(!Number.isFinite(archive.startS)||!Number.isFinite(archive.endS)||archive.startS<0||archive.endS<=archive.startS||archive.endS-archive.startS>60)throw new BadRequestException('Invalid archive window');await this.assertArchive(owner,person,archive);}
      const asset=(await this.db.query(`SELECT id,duration,checksum FROM media_assets WHERE user_id=$1 AND id=$2 AND status='indexed' AND duration>0 AND duration<=${archive?604800:300} AND original_filename ~* '\\.(mp4|mov|webm|mkv|avi|m4v)$' AND (availability IS NULL OR availability!='offline')`,[owner,body.assetId])).rows[0];
      if(!asset)throw new NotFoundException('Choose an indexed video no longer than five minutes');
      if(archive&&(asset.checksum!==archive.assetChecksum||Number(asset.duration)!==Number(archive.sourceDuration)||archive.endS>Number(asset.duration)))throw new ConflictException('Archive source changed');
      const refs=faceReferenceCandidates((await this.db.query(`SELECT r.id,r.asset_id,r.frame_s,r.box,r.updated_at::text AS version,a.checksum FROM person_appearances r JOIN media_assets a ON a.id=r.asset_id AND a.user_id=r.user_id WHERE r.user_id=$1 AND r.person_id=$2 AND r.status='confirmed' AND r.origin='manual' AND r.end_s<=a.duration AND (a.availability IS NULL OR a.availability!='offline') ORDER BY r.updated_at DESC,r.id LIMIT 30`,[owner,person])).rows);
      if(!refs.length)throw new UnprocessableEntityException('Tag a clear face before scanning');
      const root=resolveFromRepo(this.config.get('STORAGE_ROOT','./storage'));await fs.mkdir(join(root,'face-scans'),{recursive:true});directory=await fs.mkdtemp(join(root,'face-scans','scan-'));
      const get=async(id:string)=>{let src=sources.get(id);if(!src){src=await this.source(owner,id,signal);sources.set(id,src);}return src;};
      const references=[],unavailableSources=new Set<string>();
      for(const [index,ref] of refs.entries()){
        if(unavailableSources.has(ref.asset_id))continue;
        let source:FaceSource;
        try{source=await get(ref.asset_id);}catch(error){
          if(error instanceof ConflictException||error instanceof NotFoundException||error instanceof BadRequestException){unavailableSources.add(ref.asset_id);continue;}
          throw error;
        }
        const path=join(directory,`reference-${index}.jpg`);await fs.writeFile(path,await this.frame(source.path,ref.frame_s,signal));references.push({id:ref.id,sourceId:ref.asset_id,image:path,box:ref.box});
      }
      if(!references.length)throw new UnprocessableEntityException('Open a tagged source preview before scanning');
      const competitorRows=(await this.db.query(competitorReferencesSql,[owner,person])).rows;
      const competitors=[];
      for(const [index,ref] of competitorRows.entries()){
        try{const source=await get(ref.asset_id),path=join(directory,`competitor-${index}.jpg`);await fs.writeFile(path,await this.frame(source.path,ref.frame_s,signal));competitors.push({id:ref.id,image:path,box:ref.box});}
        catch(error){if(error instanceof ConflictException||error instanceof NotFoundException||error instanceof BadRequestException)continue;throw error;}
      }
      const target=await get(asset.id),frames=[];
      const start=archive?.startS??0,end=archive?.endS??Number(asset.duration);
      for(const [i,time] of faceFrameTimes(start,end).entries()){const path=join(directory,`frame-${i}.jpg`);await fs.writeFile(path,await this.frame(target.path,time,signal));frames.push({image:path,time});}
      const manifest=join(directory,'input.json'),output=join(directory,'output.json');
      // Uncalibrated pilot cutoff; scores only select review candidates, never establish identity.
      await fs.writeFile(manifest,JSON.stringify({references,competitors,frames,threshold:.65}));
      const models=join(root,'face-models'),python=this.config.get<string>('FACE_PYTHON_BIN')||resolveFromRepo(process.platform==='win32'?'.venv-face/Scripts/python.exe':'.venv-face/bin/python');
      await new Promise<void>((resolve,reject)=>execFile(python,[resolveFromRepo('services/face-recognition/scan_faces.py'),'--enhanced','--manifest',manifest,'--detector',join(models,'face_detection_yunet_2023mar.onnx'),'--recognizer',join(models,'face_recognition_sface_2021dec.onnx'),'--output',output],{timeout:120000,maxBuffer:65536,windowsHide:true,signal},error=>error?reject(new ServiceUnavailableException('Local face runtime could not finish')):resolve()));
      if((await fs.stat(output)).size>512000)throw new ServiceUnavailableException('Invalid face result size');
      const result=JSON.parse(await fs.readFile(output,'utf8'));
      if(!Number.isInteger(result.referenceCount)||result.referenceCount<0||result.referenceCount>3||!Number.isInteger(result.framesScanned)||result.framesScanned<0||result.framesScanned>24||!Number.isInteger(result.facesDetected)||result.facesDetected<0||result.facesDetected>480||!Array.isArray(result.matches)||result.matches.length>480||result.matches.length>result.facesDetected)throw new ServiceUnavailableException('Invalid face scan result');
      if(!result.referenceCount)throw new UnprocessableEntityException('No usable face found in your reference tags');
      for(const src of sources.values())await src.validate();
      const currentCompetitors=(await this.db.query(competitorReferencesSql,[owner,person])).rows;
      if(JSON.stringify(currentCompetitors.map((r:any)=>[r.id,r.version,r.checksum]))!==JSON.stringify(competitorRows.map((r:any)=>[r.id,r.version,r.checksum])))throw new ConflictException('Other reference identities changed during the scan');
      if(archive)await this.assertArchive(owner,person,archive);
      let suggested=0;
      for(const match of result.matches){
        const ref=references.some(r=>r.id===match.referenceId)?refs.find(r=>r.id===match.referenceId):undefined;
        if(!ref||!Number.isFinite(match.frame)||match.frame<start||match.frame>=end||!Number.isFinite(match.score)||match.score<.65||match.score>1||!Array.isArray(match.box)||match.box.length!==4||match.box.some((n:any)=>!Number.isFinite(n))||match.box[0]<0||match.box[1]<0||match.box[2]<=0||match.box[3]<=0||match.box[0]+match.box[2]>1||match.box[1]+match.box[3]>1)throw new ServiceUnavailableException('Invalid face candidate');
        if(ref.asset_id===asset.id&&Math.abs(ref.frame_s-match.frame)<.1)continue;
        const inserted=await this.db.query(`INSERT INTO face_suggestions(user_id,person_id,reference_id,reference_version,reference_checksum,asset_id,asset_checksum,frame_s,box,score,model)
          SELECT $1,$2,r.id,r.updated_at,ra.checksum,a.id,a.checksum,$7,$8,$9,'opencv-yunet-sface-context-v2-tiles4-t065'
          FROM person_appearances r JOIN media_assets ra ON ra.id=r.asset_id AND ra.user_id=r.user_id JOIN media_assets a ON a.id=$5 AND a.user_id=$1
          WHERE r.user_id=$1 AND r.person_id=$2 AND r.id=$3 AND r.updated_at=$4 AND r.status='confirmed' AND r.origin='manual' AND a.checksum=$6 AND ra.checksum=$10
          AND ($11::uuid IS NULL OR EXISTS(SELECT 1 FROM face_archive_jobs j JOIN face_archive_settings s ON s.user_id=j.user_id AND s.person_id=j.person_id WHERE j.id=$11 AND j.lease_token=$12 AND j.user_id=$1 AND j.person_id=$2 AND j.state='running' AND j.lease_until>now() AND s.enabled))
          ON CONFLICT DO NOTHING RETURNING id`,[owner,person,ref.id,ref.version,asset.id,asset.checksum,match.frame,match.box,match.score,ref.checksum,archive?.jobId??null,archive?.leaseToken??null]);suggested+=inserted.rowCount||0;
      }
      return {suggested,framesScanned:result.framesScanned,facesDetected:result.facesDetected,sampled:true};
    }finally{this.scanning=false;await Promise.allSettled([...sources.values()].map(src=>src.close()));if(directory)await fs.rm(directory,{recursive:true,force:true});}
  }
  async image(owner:string,id:string){ownerId(owner);uuid(id);const suggestion=(await this.db.query(`SELECT s.asset_id,s.frame_s ${currentSuggestionSql} AND s.id=$2 AND s.status='pending'`,[owner,id])).rows[0];if(!suggestion)throw new NotFoundException();const source=await this.source(owner,suggestion.asset_id);try{const image=await this.frame(source.path,suggestion.frame_s);await source.validate();return image;}finally{await source.close();}}
  async review(owner:string,id:string,body:any){
    ownerId(owner);uuid(id);if(!body||Object.keys(body).some(k=>k!=='decision')||!['confirm','reject'].includes(body.decision))throw new BadRequestException('Choose confirm or reject');
    // One statement locks the suggestion: repeated confirmations cannot duplicate appearances.
    const result=await this.db.query(`WITH candidate AS (SELECT s.*,a.duration ${currentSuggestionSql} AND s.id=$2 FOR UPDATE OF s,r,a,ra),
      changed AS (UPDATE face_suggestions s SET status=$3 FROM candidate c WHERE s.id=c.id AND c.status IN ('pending',$3) RETURNING s.*),
      tagged AS (INSERT INTO person_appearances(id,user_id,person_id,asset_id,start_s,end_s,frame_s,box,status,origin)
        SELECT c.id,c.user_id,c.person_id,c.asset_id,c.frame_s,LEAST(c.frame_s+.04,a.duration),c.frame_s,c.box,'confirmed','face_match' FROM changed c JOIN media_assets a ON a.id=c.asset_id AND a.user_id=c.user_id WHERE c.status='confirmed' ON CONFLICT(id) DO NOTHING RETURNING id)
      SELECT id,status FROM changed`,[owner,id,body.decision==='confirm'?'confirmed':'rejected']);
    if(!result.rowCount)throw new NotFoundException('Suggestion expired or was already reviewed');return result.rows[0];
  }
}
