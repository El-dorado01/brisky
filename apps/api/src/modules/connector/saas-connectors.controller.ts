import { BadRequestException,Body,Controller,Delete,Get,Param,Post,Query,Req,UseGuards,ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectorsService } from './connectors.service';
import { GoogleDriveConnector } from './google-drive.connector';
import { DatabaseService } from '../database/database.service';
import { SaasSessionGuard } from '../conversation/saas-session.guard';
import { validateFolders } from '../../common/request-validation';
import { factoryRunsSql,summarizeFactoryRuns } from '../queue/factory-telemetry';

// Unit dispatch/retry may leave the parent queued while a live child is processing.
export const factoryAssetsSql=`WITH factory_assets AS (
  SELECT m.id,m.user_id,m.original_filename,m.connector_account_id,m.availability,GREATEST(m.updated_at,live.activity_at) AS updated_at,
    CASE WHEN live.bull_job_id IS NOT NULL THEN 'processing' WHEN pending.found THEN 'queued'
      WHEN m.status='processing' THEN 'failed' ELSE m.status END AS status,
    COALESCE(live.stage,CASE WHEN pending.found THEN 'queued' WHEN m.status='processing' THEN 'needs_attention' ELSE m.stage END) AS stage,
    COALESCE(live.progress,m.progress) AS progress
  FROM public.media_assets m LEFT JOIN LATERAL (
    SELECT j.bull_job_id,j.stage,j.progress,j.updated_at AS activity_at FROM public.indexing_jobs j
    WHERE j.asset_id=m.id AND j.user_id=m.user_id AND j.status='active'
      AND COALESCE(j.last_heartbeat_at,j.started_at,j.created_at)>NOW()-INTERVAL '15 minutes'
    ORDER BY COALESCE(j.last_heartbeat_at,j.started_at,j.created_at) DESC,j.id LIMIT 1
  ) live ON true LEFT JOIN LATERAL (
    SELECT true AS found FROM public.indexing_jobs j WHERE j.asset_id=m.id AND j.user_id=m.user_id AND j.status='waiting' LIMIT 1
  ) pending ON true WHERE m.user_id=$1
)`;

@Controller('saas-engine/connectors') @UseGuards(SaasSessionGuard)
export class SaasConnectorsController {
  constructor(private readonly service:ConnectorsService,private readonly drive:GoogleDriveConnector,private readonly db:DatabaseService,private readonly config:ConfigService){}
  private redirect(){
    const value=this.config.get<string>('GOOGLE_SAAS_REDIRECT_URI','');let url:URL;
    try{url=new URL(value);}catch{throw new ServiceUnavailableException('Configure the SaaS Google redirect URI');}
    if(url.pathname!=='/api/connectors/google-drive/callback'||url.username||url.password||url.hash||url.search||!['http:','https:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new ServiceUnavailableException('Invalid SaaS Google redirect URI');
    return url.href;
  }
  @Get() async list(@Req() req:any){
    const accounts=await this.service.listAccounts(req.user.id);
    const counts=await this.db.query(`${factoryAssetsSql} SELECT connector_account_id,count(*)::int AS files,count(*) FILTER(WHERE status='processing')::int AS processing,count(*) FILTER(WHERE status='queued')::int AS queued,count(*) FILTER(WHERE status IN ('failed','partially_indexed'))::int AS failed FROM factory_assets WHERE user_id=$1 AND connector_account_id IS NOT NULL AND availability<>'offline' GROUP BY connector_account_id`,[req.user.id]);
    return {accounts:accounts.map(account=>{const row=counts.rows.find(r=>r.connector_account_id===account.id);return {...account,syncEnabled:this.syncAllowed(account.id),lastError:account.lastError?'The source needs attention. Try reconnecting.':undefined,files:Number(row?.files||0),processing:Number(row?.processing||0),queued:Number(row?.queued||0),failed:Number(row?.failed||0)};}),pollingEnabled:this.config.get('ENABLE_CONNECTOR_POLLING','true')!=='false'};
  }
  @Post('google-drive/start') start(@Body() body:any){
    if(!body||Object.keys(body).some(k=>k!=='state')||typeof body.state!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(body.state))throw new BadRequestException('Invalid OAuth state');
    if(!this.drive.isConfigured())throw new ServiceUnavailableException('Google Drive is not configured');
    return {url:this.drive.getAuthUrl(body.state,this.redirect())};
  }
  @Post('google-drive/complete') complete(@Body() body:any,@Req() req:any){
    if(!body||Object.keys(body).some(k=>k!=='code')||typeof body.code!=='string'||!body.code||body.code.length>8192)throw new BadRequestException('Invalid authorization code');
    return this.service.linkGoogleForUser(body.code,req.user.id,this.redirect());
  }
  @Get('indexing') async indexing(@Req() req:any){
    const counts=await this.db.query(`${factoryAssetsSql} SELECT status,count(*)::int AS count FROM factory_assets WHERE user_id=$1 GROUP BY status`,[req.user.id]);
    const files=await this.db.query(`${factoryAssetsSql} SELECT id,original_filename AS name,status,stage,progress,connector_account_id FROM factory_assets WHERE user_id=$1 ORDER BY updated_at DESC,id LIMIT 100`,[req.user.id]);
    const runs=await this.db.query(factoryRunsSql,[req.user.id]);
    return {counts:counts.rows,files:files.rows,stages:summarizeFactoryRuns(runs.rows),metricsTimezone:'Africa/Lagos'};
  }
  @Get(':id/folders') async folders(@Param('id') id:string,@Query('parent') parent:string,@Req() req:any){
    if(!/^[\w-]{1,200}$/.test(parent||'root'))throw new BadRequestException('Invalid folder');
    return {folders:await this.service.listFolders(id,req.user.id,parent||'root')};
  }
  @Post(':id/folders') async select(@Param('id') id:string,@Body() body:any,@Req() req:any){
    if(!body||Object.keys(body).some(k=>!['folders','sync'].includes(k))||(body.sync!==undefined&&typeof body.sync!=='boolean'))throw new BadRequestException('Invalid folders');validateFolders(body.folders);
    if(body.folders.some((folder:{id:string})=>! /^[\w-]{1,200}$/.test(folder.id)))throw new BadRequestException('Invalid folder ID');
    await this.service.setSelectedFolders(id,req.user.id,body.folders);
    if(!body.sync)return {saved:true};
    if(!body.folders.length)return {saved:true,syncStatus:'not_requested'};
    if(!this.syncAllowed(id))return {saved:true,syncStatus:'paused'};
    try{return {saved:true,syncStatus:'complete',...await this.service.syncAccount(id,req.user.id)};}
    catch{return {saved:true,syncStatus:'failed',error:'Your folders were saved, but syncing could not finish. Please retry sync.'};}
  }
  @Post(':id/sync') async sync(@Param('id') id:string,@Req() req:any){
    if(!this.syncAllowed(id))throw new ServiceUnavailableException('Indexing is paused for this source. Your selected folders are saved.');
    return this.service.syncAccount(id,req.user.id);
  }
  @Delete(':id') async remove(@Param('id') id:string,@Req() req:any){await this.service.deleteAccount(id,req.user.id);return {removed:true};}
  private syncAllowed(id:string){
    const accounts=String(this.config.get('SAAS_DRIVE_SYNC_ACCOUNT_IDS','')).split(/[,\s]+/);
    return this.config.get('SAAS_DRIVE_SYNC_ENABLED','false')==='true'&&accounts.includes(id);
  }
}
