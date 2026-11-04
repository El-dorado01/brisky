import { studioRequest } from '@/server/studio-http';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{outputId:string}>}){return studioRequest(request,await params);}
