import { peopleRequest } from '@/server/people-http';
export const runtime='nodejs';
type Context={params:Promise<{path?:string[]}>};
async function handle(request:Request,context:Context){return peopleRequest(request,(await context.params).path||[]);}
export {handle as GET,handle as POST,handle as PUT,handle as DELETE};
