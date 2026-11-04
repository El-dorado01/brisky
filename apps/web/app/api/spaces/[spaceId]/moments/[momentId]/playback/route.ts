import { spacePlayback } from '@/server/space-playback';
export const runtime='nodejs';
type Context={params:Promise<{spaceId:string;momentId:string}>};
export async function GET(request:Request,{params}:Context){const {spaceId,momentId}=await params;return spacePlayback(request,spaceId,momentId);}
export async function HEAD(request:Request,context:Context){return GET(request,context);}
