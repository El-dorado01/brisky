import { studioRequest } from '@/server/studio-http';
export const runtime='nodejs';
export async function GET(request:Request){return studioRequest(request);}
