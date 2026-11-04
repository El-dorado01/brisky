import { startDrive } from '@/server/connectors-http';
export const runtime='nodejs';
export function POST(request:Request){return startDrive(request);}
