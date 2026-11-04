import { Readable,Transform,pipeline } from 'stream';
import { FastifyReply } from 'fastify';
import { MediaReadSession } from '../connector/media-connector.interface';
import { byteRange } from './stream-response';

/** Proxy source bytes with backpressure; never retain the original on local disk. */
export async function remoteStreamResponse(source:MediaReadSession&{mime:string},request:{headers:{range?:string};method:string},reply:FastifyReply,signal:AbortSignal){
  const range=byteRange(request.headers.range,source.size);
  reply.headers({'Cache-Control':'private, no-store','Accept-Ranges':'bytes','Content-Type':source.mime,'X-Content-Type-Options':'nosniff'});
  if(range===false)return reply.status(416).header('Content-Range',`bytes */${source.size}`).send();
  const start=range?range.start:0,end=range?range.end:source.size-1,length=end-start+1;
  if(request.method==='HEAD'){
    reply.status(range?206:200).header('Content-Length',length);
    if(range)reply.header('Content-Range',`bytes ${start}-${end}/${source.size}`);
    reply.hijack();for(const [name,value] of Object.entries(reply.getHeaders()))if(value!==undefined)reply.raw.setHeader(name,value);
    reply.raw.writeHead(reply.statusCode);reply.raw.end();return reply;
  }
  const response=await source.read(start,length,signal),upstream=response.stream as Readable;
  if(response.status!==206||response.contentRange!==`bytes ${start}-${end}/${source.size}`){
    upstream.destroy();throw new Error('Source returned an inconsistent byte range');
  }
  try{await source.validate(signal);}catch(error){upstream.destroy();throw error;}
  let bytes=0;
  const output=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;callback(bytes>length?new Error('Source exceeded requested range'):null,chunk);},
    flush(callback){callback(bytes===length?null:new Error('Incomplete source range'));}});
  const cancel=()=>{upstream.destroy();output.destroy();};signal.addEventListener('abort',cancel,{once:true});
  output.once('close',()=>signal.removeEventListener('abort',cancel));
  pipeline(upstream,output,()=>{});
  reply.status(range?206:200).header('Content-Length',length);
  if(range)reply.header('Content-Range',`bytes ${start}-${end}/${source.size}`);
  return reply.send(output);
}
