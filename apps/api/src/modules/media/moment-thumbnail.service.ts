import { BadRequestException,Injectable,NotFoundException,ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash,randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { DatabaseService } from '../database/database.service';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { MediaService } from './media.service';
import { assertPathWithinRoot,resolveFromRepo } from '../../common/repo-paths';
import { resolveStorageLocator } from '../../common/storage-paths';
import { parseKeyframePaths } from '../pipeline/scene-sampling';

@Injectable()
export class MomentThumbnailService {
  private readonly pending=new Map<string,Promise<string>>();
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private readonly db:DatabaseService,private readonly media:MediaService,private readonly ffmpeg:FfmpegService,private readonly config:ConfigService){}
  async image(owner:string,asset:string,start:number,end:number):Promise<string|null>{
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new BadRequestException('Invalid source range');
    const found=await this.db.query('SELECT duration FROM public.media_assets WHERE id=$1 AND user_id=$2',[asset,owner]);
    if(!found.rowCount)throw new NotFoundException('Source not found');
    if(end>Number(found.rows[0].duration)||!Number(found.rows[0].duration))throw new BadRequestException('Range exceeds source duration');
    const storage=resolveFromRepo(this.config.get('STORAGE_ROOT','./storage'));
    const midpoint=start+(end-start)/2;
    // Durable indexed frames survive scratch cleanup even when no preview exists.
    const segments=await this.db.query(`SELECT keyframe_paths FROM public.media_segments
      WHERE asset_id=$1 AND user_id=$2 AND start_time<$4 AND end_time>$3
      ORDER BY abs((start_time+end_time)/2-($3+$4)/2) LIMIT 50`,[asset,owner,start,end]);
    const frames=segments.rows.flatMap(row=>parseKeyframePaths(row.keyframe_paths))
      .filter(frame=>Number.isFinite(frame.timestamp)&&frame.timestamp>=start&&frame.timestamp<end)
      .sort((a,b)=>Math.abs(a.timestamp-midpoint)-Math.abs(b.timestamp-midpoint));
    let framePath:string|undefined;
    for(const frame of frames){
      const locator=resolveStorageLocator(frame.path,storage);if(!locator)continue;
      try{const real=assertPathWithinRoot(await fs.realpath(locator),await fs.realpath(storage));
        if((await fs.stat(real)).isFile()&&(await fs.stat(real)).size>0){framePath=real;break;}
      }catch{/* Missing or escaped frame cannot be used. */}
    }
    const source=framePath?{status:'ready' as const,filePath:framePath}:await this.media.getStreamInfo(asset,owner,false);
    if(source.status!=='ready')return null;
    const stat=await fs.stat(source.filePath);
    const key=createHash('sha256').update(JSON.stringify([owner,asset,start,end,source.filePath,stat.size,stat.mtimeMs,'640x440-v2'])).digest('hex');
    const directory=join(resolveFromRepo(this.config.get('STORAGE_ROOT','./storage')),'moment-thumbnails');
    const output=join(directory,key+'.jpg');
    if(await fs.stat(output).then(s=>s.size>0,()=>false))return output;
    const existing=this.pending.get(key);if(existing)return existing;
    if(this.pending.size>=16)throw new ServiceUnavailableException('Thumbnails are busy; retry shortly');
    const task=this.tail.then(async()=>{
      const binary=this.ffmpeg.getFfmpegPath();if(!binary)throw new ServiceUnavailableException('Thumbnail processing unavailable');
      await fs.mkdir(directory,{recursive:true});const temporary=join(directory,key+'-'+randomUUID()+'.jpg');
      try{
        // Input seeking is bounded to the saved moment; one decoder runs at a time.
        const time=framePath?0:midpoint;
        await new Promise<void>((resolve,reject)=>execFile(binary,['-hide_banner','-loglevel','error','-nostdin','-threads','1',...(framePath?[]:['-ss',String(time)]),'-i',source.filePath,'-an','-frames:v','1','-vf','scale=640:440:force_original_aspect_ratio=increase,crop=640:440,setsar=1','-threads','1','-q:v','3','-y',temporary],{timeout:20000,maxBuffer:65536,windowsHide:true},error=>error?reject(new ServiceUnavailableException('Unable to generate source thumbnail')):resolve()));
        if(!(await fs.stat(temporary)).size)throw new ServiceUnavailableException('Source has no thumbnail frame');
        await fs.rename(temporary,output);return output;
      }finally{await fs.unlink(temporary).catch(()=>{});}
    });
    this.pending.set(key,task);this.tail=task.catch(()=>{});
    try{return await task;}finally{this.pending.delete(key);}
  }
}
