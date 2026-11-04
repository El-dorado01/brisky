import { assertSameOrigin, body } from '@/server/auth-http';
import { spacesRequest, type SpaceRoute } from '@/server/spaces-http';
export const runtime='nodejs';
export async function GET(_request:Request,context:SpaceRoute) {
  return spacesRequest(async(service,userId)=>service.read(userId,(await context.params).spaceId));
}
export async function PATCH(request:Request,context:SpaceRoute) {
  return spacesRequest(async(service,userId)=>({space:await service.update(userId,(await context.params).spaceId,await body(request,2048))}));
}
export async function DELETE(request:Request,context:SpaceRoute) {
  return spacesRequest(async(service,userId)=>{assertSameOrigin(request);await service.remove(userId,(await context.params).spaceId);return {ok:true};});
}
