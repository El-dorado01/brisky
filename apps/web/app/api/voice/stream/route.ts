import {voiceRequest} from '@/server/voice-http';
export const runtime='nodejs';
export const maxDuration=120;
export async function POST(request:Request){return voiceRequest(request,'stream');}
