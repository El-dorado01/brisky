import { body } from '@/server/auth-http';
import { spacesRequest, type SpaceRoute } from '@/server/spaces-http';
export const runtime='nodejs';
export async function PUT(request:Request,context:SpaceRoute) {
  return spacesRequest(async(service,userId)=>service.shortlist(userId,(await context.params).spaceId,await body(request,22000)));
}
