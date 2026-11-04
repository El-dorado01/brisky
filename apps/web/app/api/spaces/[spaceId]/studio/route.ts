import { studioRequest } from '@/server/studio-http';
export const runtime='nodejs';
export const maxDuration=120;
export async function POST(request:Request,{params}:{params:Promise<{spaceId:string}>}){return studioRequest(request,await params);}
