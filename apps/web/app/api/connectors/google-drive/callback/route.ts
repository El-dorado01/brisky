import { completeDrive } from '@/server/connectors-http';
export const runtime='nodejs';
export function GET(request:Request){return completeDrive(request);}
