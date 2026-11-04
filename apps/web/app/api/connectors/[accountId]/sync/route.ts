import { connectorsRequest } from '@/server/connectors-http';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{accountId:string}>}){const {accountId}=await params;return connectorsRequest(request,'/'+encodeURIComponent(accountId)+'/sync','POST');}
