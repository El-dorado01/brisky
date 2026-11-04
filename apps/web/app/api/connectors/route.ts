import { connectorsRequest } from '@/server/connectors-http';
export const runtime='nodejs';
export function GET(request:Request){return connectorsRequest(request);}
