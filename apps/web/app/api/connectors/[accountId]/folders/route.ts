import { connectorsRequest } from '@/server/connectors-http';
export const runtime='nodejs';
type Context={params:Promise<{accountId:string}>};
export async function GET(request:Request,{params}:Context){const {accountId}=await params;return connectorsRequest(request,'/'+encodeURIComponent(accountId)+'/folders?parent='+encodeURIComponent(new URL(request.url).searchParams.get('parent')||'root'));}
export async function POST(request:Request,{params}:Context){const {accountId}=await params;return connectorsRequest(request,'/'+encodeURIComponent(accountId)+'/folders','POST');}
