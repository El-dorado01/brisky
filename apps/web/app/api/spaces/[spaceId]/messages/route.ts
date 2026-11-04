import { body } from '@/server/auth-http';
import { spacesRequest, type SpaceRoute } from '@/server/spaces-http';
export const runtime='nodejs';
export async function POST(request:Request,context:SpaceRoute) {
  return spacesRequest(async(service,userId)=>service.message(userId,(await context.params).spaceId,await body(request,52000)));
}
