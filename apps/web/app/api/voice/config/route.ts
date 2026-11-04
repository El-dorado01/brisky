import {voiceRequest} from '@/server/voice-http';
export const runtime='nodejs';
export async function GET(request:Request){return voiceRequest(request,'config');}
