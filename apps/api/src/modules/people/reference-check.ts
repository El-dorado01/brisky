import {BadRequestException,ServiceUnavailableException} from '@nestjs/common';

export const referenceAssetSql=`SELECT a.duration,a.checksum FROM media_assets a
 JOIN people p ON p.user_id=a.user_id AND p.id=$2
 WHERE a.user_id=$1 AND a.id=$3 AND a.status='indexed' AND a.duration>$4
 AND a.original_filename ~* '\\.(mp4|mov|webm|mkv|avi|m4v)$'
 AND (a.availability IS NULL OR a.availability!='offline')`;

export function referenceCheckInput(body:any):{assetId:string;frame_s:number;box:number[]}{
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['assetId','frame_s','box'].includes(k))||
    typeof body.assetId!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(body.assetId)||
    typeof body.frame_s!=='number'||!Number.isFinite(body.frame_s)||body.frame_s<0||!validBox(body.box))throw new BadRequestException('Choose a source frame and one face');
  return {assetId:body.assetId,frame_s:body.frame_s,box:body.box};
}
function validBox(box:any):box is number[]{return Array.isArray(box)&&box.length===4&&box.every((n:any)=>typeof n==='number'&&Number.isFinite(n))&&box[0]>=0&&box[1]>=0&&box[2]>0&&box[3]>0&&box[0]+box[2]<=1&&box[1]+box[3]<=1;}
export function referenceCheckResult(value:any){
  if(!value||typeof value!=='object'||!['ready','adjust_selection','ambiguous_selection','face_too_small','target_not_detected','no_face_detected'].includes(value.status)||
    Object.keys(value).some(k=>!['status','suggestedBox'].includes(k))||
    (value.status==='adjust_selection'?!validBox(value.suggestedBox):value.suggestedBox!==undefined))throw new ServiceUnavailableException('Invalid face check result');
  return value as {status:string;suggestedBox?:number[]};
}
