import { spacePlayback } from '@/server/space-playback';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{spaceId:string;momentId:string}>}){const {spaceId,momentId}=await params;return spacePlayback(request,spaceId,momentId,true);}
