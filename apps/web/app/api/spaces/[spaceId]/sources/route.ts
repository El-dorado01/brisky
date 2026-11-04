import { spacesRequest,type SpaceRoute } from '@/server/spaces-http';
export const runtime='nodejs';
export async function GET(request:Request,context:SpaceRoute) {
  return spacesRequest(async(service,userId)=>service.sources(userId,(await context.params).spaceId,new URL(request.url).searchParams.get('after')));
}
