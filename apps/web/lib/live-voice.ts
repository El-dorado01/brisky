export type LiveStatus='Connecting'|'Listening'|'Speaking'|'Thinking'|'Paused';
type Options={voice:string;onStatus:(status:LiveStatus)=>void;onError:(message:string)=>void;onEnd:()=>void;onTool:(id:string,query:string)=>Promise<string>};

/** PCM duplex connection; no MediaRecorder, turn upload or separate TTS request. */
export class LiveVoiceClient{
  private socket:WebSocket|null=null;
  private context:AudioContext;
  private device:MediaStream|null=null;
  private microphone:AudioWorkletNode|null=null;
  private source:MediaStreamAudioSourceNode|null=null;
  private silent:GainNode|null=null;
  private output=new Set<AudioBufferSourceNode>();
  private next=0;
  private stopped=false;
  private ready=false;
  private paused=false;
  private ending=false;
  private turnComplete=false;
  private endingTimer:ReturnType<typeof setTimeout>|null=null;
  private connectTimer:ReturnType<typeof setTimeout>|null=null;
  private abort=new AbortController();
  private cancelled=new Set<string>();
  constructor(private options:Options){this.context=new AudioContext({sampleRate:16000});void this.context.resume();}
  private send(value:unknown){if(this.socket?.readyState===WebSocket.OPEN&&this.ready&&!this.stopped){if(this.socket.bufferedAmount>256000)throw Error('Voice connection is too slow. Please reconnect.');this.socket.send(JSON.stringify(value));}}
  async start(){
    try{
      if(!navigator.mediaDevices?.getUserMedia||!window.isSecureContext)throw Error('Microphone access needs HTTPS or localhost.');
      this.options.onStatus('Connecting');
      const response=await fetch('/api/voice/live-ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice:this.options.voice}),signal:this.abort.signal});
      const ticket=await response.json();if(!response.ok)throw Error(ticket.error||'Live voice could not start.');
      if(this.stopped)return;
      const url=new URL(ticket.url);if(!['ws:','wss:'].includes(url.protocol)||url.protocol==='ws:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('The live connection is not secure.');
      const device=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false});
      if(this.stopped){device.getTracks().forEach(track=>track.stop());return;}this.device=device;
      await this.context.audioWorklet.addModule('/audio/brisky/live-microphone.js');if(this.stopped)return;
      this.microphone=new AudioWorkletNode(this.context,'brisky-microphone');this.source=this.context.createMediaStreamSource(device);this.silent=this.context.createGain();this.silent.gain.value=0;
      this.source.connect(this.microphone);this.microphone.connect(this.silent);this.silent.connect(this.context.destination);
      this.microphone.port.onmessage=event=>{if(!this.ready||this.paused||this.stopped)return;try{const bytes=new Uint8Array(event.data);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);this.send({type:'audio',data:btoa(binary)});}catch(error){this.fail(error instanceof Error?error.message:'Voice connection stopped.');}};
      this.socket=new WebSocket(url);
      const startupTimeout=Number.isInteger(ticket.startupTimeoutMs)&&ticket.startupTimeoutMs>=15000&&ticket.startupTimeoutMs<=150000?ticket.startupTimeoutMs:45000;
      this.connectTimer=setTimeout(()=>this.fail('Live voice took too long to connect. Please retry.'),startupTimeout);
      this.socket.onmessage=event=>{try{this.message(JSON.parse(event.data));}catch{this.fail('Live voice returned an invalid response.');}};
      this.socket.onerror=()=>this.fail('Live voice could not connect. Check the connection and retry.');
      this.socket.onclose=()=>{if(!this.stopped){if(this.ending)this.options.onEnd();else this.fail('The voice connection closed. Tap to reconnect.');}};
    }catch(error){if(!this.stopped)this.fail(error instanceof Error?error.message:'Live voice could not start.');}
  }
  private message(packet:{type:string;data?:string;message?:string;id?:string;query?:string}){
    if(this.stopped)return;
    if(packet.type==='ready'){this.ready=true;if(this.connectTimer)clearTimeout(this.connectTimer);this.options.onStatus('Listening');}
    if(packet.type==='error'){this.fail(packet.message||'Live voice stopped.');return;}
    if(packet.type==='interrupted'){this.clearOutput();this.ending=false;if(this.endingTimer)clearTimeout(this.endingTimer);this.turnComplete=false;this.options.onStatus(this.paused?'Paused':'Listening');}
    if(packet.type==='audio'&&packet.data){
      if(this.endingTimer)clearTimeout(this.endingTimer);this.turnComplete=false;
      const binary=atob(packet.data);if(binary.length%2||binary.length>512000)throw Error('Invalid audio');
      const buffer=this.context.createBuffer(1,binary.length/2,24000),values=buffer.getChannelData(0);
      for(let i=0;i<values.length;i++){const raw=binary.charCodeAt(2*i)|(binary.charCodeAt(2*i+1)<<8);values[i]=(raw>32767?raw-65536:raw)/32768;}
      const node=this.context.createBufferSource();node.buffer=buffer;node.connect(this.context.destination);this.output.add(node);this.next=Math.max(this.next,this.context.currentTime+.03);node.start(this.next);this.next+=buffer.duration;this.options.onStatus('Speaking');
      node.onended=()=>{this.output.delete(node);if(!this.output.size){if(this.ending&&this.turnComplete)this.options.onEnd();else if(this.turnComplete)this.options.onStatus(this.paused?'Paused':'Listening');}};
    }
    if(packet.type==='turn-complete'){this.turnComplete=true;if(!this.output.size)this.options.onStatus(this.paused?'Paused':'Listening');}
    if(packet.type==='ending'){this.ending=true;this.turnComplete=true;this.endingTimer=setTimeout(()=>{if(!this.stopped&&!this.output.size)this.options.onEnd();},1800);}
    if(packet.type==='cancel-tool'&&packet.id)this.cancelled.add(packet.id);
    if(packet.type==='tool'&&packet.id&&packet.query){const id=packet.id;void this.options.onTool(id,packet.query).then(result=>{if(!this.cancelled.has(id))this.send({type:'tool-result',id,result:result.slice(0,12000)});}).catch(()=>{if(!this.stopped&&!this.cancelled.has(id))this.send({type:'tool-result',id,result:'The saved Space request could not finish. Ask the user to retry; do not invent a media result.'});});}
  }
  pause(value:boolean){this.paused=value;for(const track of this.device?.getAudioTracks()||[])track.enabled=!value;if(value)this.send({type:'pause'});this.options.onStatus(value?'Paused':this.output.size?'Speaking':'Listening');}
  private clearOutput(){for(const node of this.output){node.onended=null;try{node.stop();}catch{}}this.output.clear();this.next=0;}
  private fail(message:string){this.stop();this.options.onError(message);}
  stop(){if(this.stopped)return;this.stopped=true;this.abort.abort();if(this.connectTimer)clearTimeout(this.connectTimer);if(this.endingTimer)clearTimeout(this.endingTimer);this.clearOutput();this.microphone?.disconnect();if(this.microphone)this.microphone.port.onmessage=null;this.source?.disconnect();this.silent?.disconnect();this.device?.getTracks().forEach(track=>track.stop());this.socket?.close();void this.context.close().catch(()=>{});}
}
