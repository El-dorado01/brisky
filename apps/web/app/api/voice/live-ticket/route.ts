import {voiceRequest} from '@/server/voice-http';
export const runtime='nodejs';
export async function POST(request:Request){return voiceRequest(request,'live-ticket');}
