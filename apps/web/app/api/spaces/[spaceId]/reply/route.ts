import { body,sessionCookie } from '@/server/auth-http';
import { AuthError } from '@/server/auth-core';
import { database } from '@/server/db';
import { engineReply } from '@/server/engine-reply';
import { createSpaceReplies } from '@/server/space-replies-core';
import { spacesRequest,type SpaceRoute } from '@/server/spaces-http';
export const runtime='nodejs';
export const maxDuration=110;
export async function POST(request:Request,context:SpaceRoute){
  return spacesRequest(async(_service,owner)=>{
    const input=await body(request,1024);
    if(Object.keys(input).some(key=>key!=='messageId')||typeof input.messageId!=='string')throw new AuthError(400,'Choose a saved user message.');
    const token=await sessionCookie();
    return createSpaceReplies(database(),value=>engineReply(token!,value)).reply(owner,(await context.params).spaceId,input.messageId);
  });
}
