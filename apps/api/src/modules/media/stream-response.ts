import { promises as fs, createReadStream } from 'fs';
import { FastifyReply } from 'fastify';

/** Only one RFC byte range is supported; reject malformed and unsatisfiable ranges. */
export function byteRange(value:unknown,size:number):{start:number;end:number}|null|false {
  if(value===undefined)return null;
  if(typeof value!=='string'||value.length>100)return false;
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!match||(!match[1]&&!match[2])||size<=0)return false;
  const first=match[1]?Number(match[1]):undefined,last=match[2]?Number(match[2]):undefined;
  if((first!==undefined&&!Number.isSafeInteger(first))||(last!==undefined&&!Number.isSafeInteger(last)))return false;
  if(first===undefined){if(!last)return false;return {start:Math.max(0,size-last),end:size-1};}
  if(first>=size||(last!==undefined&&last<first))return false;
  return {start:first,end:Math.min(last??size-1,size-1)};
}

export async function streamResponse(filePath:string,request:{headers:{range?:string};method:string},reply:FastifyReply){
  const stat=await fs.stat(filePath),range=byteRange(request.headers.range,stat.size);
  reply.headers({'Cache-Control':'private, no-store','Accept-Ranges':'bytes','Content-Type':'video/mp4','X-Content-Type-Options':'nosniff'});
  if(range===false)return reply.status(416).header('Content-Range',`bytes */${stat.size}`).send();
  const start=range?range.start:0,end=range?range.end:stat.size-1;
  reply.status(range?206:200).header('Content-Length',Math.max(0,end-start+1));
  if(range)reply.header('Content-Range',`bytes ${start}-${end}/${stat.size}`);
  if(request.method==='HEAD'){
    // Fastify's empty send would replace Content-Length with zero on an explicit HEAD.
    reply.hijack();
    for(const [name,value] of Object.entries(reply.getHeaders()))if(value!==undefined)reply.raw.setHeader(name,value);
    reply.raw.writeHead(reply.statusCode);reply.raw.end();return reply;
  }
  if(stat.size===0)return reply.send();
  const stream=createReadStream(filePath,{start,end});
  const close=()=>stream.destroy();reply.raw.once('close',close);stream.once('close',()=>reply.raw.off('close',close));
  return reply.send(stream);
}
