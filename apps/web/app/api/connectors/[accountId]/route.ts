import { connectorsRequest } from '@/server/connectors-http';
export const runtime='nodejs';
export async function DELETE(request:Request,{params}:{params:Promise<{accountId:string}>}){const {accountId}=await params;return connectorsRequest(request,'/'+encodeURIComponent(accountId),'DELETE');}
