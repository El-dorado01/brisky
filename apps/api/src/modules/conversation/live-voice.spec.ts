import {ConfigService} from '@nestjs/config';
import {EventEmitter} from 'events';
import {LiveVoiceService,liveAudio} from './live-voice.service';

const mockSession={close:jest.fn(),sendRealtimeInput:jest.fn(),sendToolResponse:jest.fn()};
const mockConnect=jest.fn();
jest.mock('@google/genai',()=>({GoogleGenAI:jest.fn().mockImplementation(()=>({live:{connect:mockConnect}})),Modality:{AUDIO:'AUDIO'},Type:{OBJECT:'OBJECT',STRING:'STRING'},Behavior:{NON_BLOCKING:'NON_BLOCKING'},FunctionResponseScheduling:{WHEN_IDLE:'WHEN_IDLE'},StartSensitivity:{START_SENSITIVITY_LOW:'START_SENSITIVITY_LOW'},EndSensitivity:{END_SENSITIVITY_LOW:'END_SENSITIVITY_LOW'}}));
function fixture(){
  const config=new ConfigService({VOICE_CONVERSATION_MODE:'live',VOICE_ENABLED:'true',AI_API_KEY:'fixture'}),server=new EventEmitter(),service=new LiveVoiceService(config,{httpAdapter:{getHttpServer:()=>server}} as any,{} as any);
  const ledger={reserve:jest.fn().mockReturnValue({id:'test',reservedUsd:1}),estimateUsd:jest.fn().mockReturnValue(.54),settle:jest.fn()};(service as any).ledger=ledger;
  class Client extends EventEmitter{readyState=1;bufferedAmount=0;sent:any[]=[];send(data:string){this.sent.push(JSON.parse(data));}close(){this.readyState=3;this.emit('close');}}
  return {config,server,service,ledger,client:new Client()};
}
describe('Live voice connection boundaries',()=>{
  beforeEach(()=>{jest.clearAllMocks();mockConnect.mockResolvedValue(mockSession);});
  it('accepts only bounded canonical even-byte PCM',()=>{expect(liveAudio(Buffer.alloc(3200).toString('base64'))).toBeTruthy();for(const input of ['',null,'not base64',Buffer.alloc(3).toString('base64'),'A'.repeat(12004)])expect(()=>liveAudio(input)).toThrow();});
  it('does not expose provider credentials and disables the ticket outside Live mode',()=>{const {service,config}=fixture();const ticket=service.ticket('owner',{voice:'Kore'});expect(ticket.url).toMatch(/^ws:\/\/localhost:3001\/api\/v1\/saas-engine\/voice\/live\?ticket=[\w-]{43}$/);expect(ticket.url).not.toContain('fixture');expect(()=>service.ticket('owner',{voice:'Kore'})).toThrow();expect(()=>service.ticket('other',{voice:'Kore',owner:'owner'})).toThrow();config.set('VOICE_CONVERSATION_MODE','turn-based');expect(()=>service.ticket('other',{voice:'Kore'})).toThrow();});
  it('rejects cross-origin upgrades without consuming a valid ticket',()=>{const {service,server}=fixture();service.onApplicationBootstrap();const ticket=service.ticket('owner',{voice:'Kore'}),socket={end:jest.fn()};server.emit('upgrade',{url:new URL(ticket.url).pathname+new URL(ticket.url).search,headers:{origin:'https://foreign.invalid'}},socket,Buffer.alloc(0));expect(socket.end).toHaveBeenCalledWith(expect.stringContaining('403'));expect((service as any).tickets.size).toBe(1);service.onModuleDestroy();});
  it('forwards duplex audio, validates tool IDs, forwards interruption and cleans up once',async()=>{
    const {service,client,ledger}=fixture();await (service as any).connect(client,'owner','Puck');expect(client.sent[0]).toEqual({type:'ready'});const callbacks=mockConnect.mock.calls[0][0].callbacks;
    client.emit('message',Buffer.from(JSON.stringify({type:'audio',data:Buffer.alloc(3200).toString('base64')})),false);expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({audio:{data:expect.any(String),mimeType:'audio/pcm;rate=16000'}});
    callbacks.onmessage({serverContent:{interrupted:true,modelTurn:{parts:[{inlineData:{data:Buffer.alloc(4800).toString('base64')}}]}}});expect(client.sent.map((p:any)=>p.type)).toEqual(['ready','interrupted','audio']);
    callbacks.onmessage({toolCall:{functionCalls:[{id:'call-1',name:'consult_brisky',args:{query:'Find the exam clip'}}]}});client.emit('message',Buffer.from(JSON.stringify({type:'tool-result',id:'call-1',result:'Saved answer'})),false);expect(mockSession.sendToolResponse).toHaveBeenCalledTimes(1);
    client.emit('message',Buffer.from(JSON.stringify({type:'tool-result',id:'forged',result:'Injected'})),false);expect(mockSession.sendToolResponse).toHaveBeenCalledTimes(1);expect(client.readyState).toBe(3);expect(ledger.settle).toHaveBeenCalledTimes(1);expect(mockSession.close).toHaveBeenCalledTimes(1);
  });
  it('never connects upstream when budget admission fails',async()=>{const {service,client,ledger}=fixture();ledger.reserve.mockImplementation(()=>{throw Error('budget');});await (service as any).connect(client,'owner','Kore');expect(mockConnect).not.toHaveBeenCalled();expect(client.sent[0].type).toBe('error');expect(client.readyState).toBe(3);});
  it('closes late provider connections when the user exits during setup',async()=>{const {service,client}=fixture();let resolve!:(value:unknown)=>void;mockConnect.mockReturnValue(new Promise(r=>resolve=r));const opening=(service as any).connect(client,'owner','Kore');client.close();resolve(mockSession);await opening;expect(mockSession.close).toHaveBeenCalled();expect(client.sent).toEqual([]);});
});
