import { body } from '@/server/auth-http';
import { spacesRequest } from '@/server/spaces-http';
export const runtime='nodejs';
export async function GET(request:Request) {
  return spacesRequest((service,userId)=>service.list(userId,new URL(request.url).searchParams.get('before')));
}
export async function POST(request:Request) {
  return spacesRequest(async(service,userId)=>({space:await service.create(userId,await body(request,52000))}));
}
