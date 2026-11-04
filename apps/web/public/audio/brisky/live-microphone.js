// No recording is stored. Downsample microphone PCM to 16 kHz in the audio thread.
class BriskyMicrophone extends AudioWorkletProcessor {
  constructor(){super();this.samples=[];this.position=0;this.packet=new Int16Array(1600);this.offset=0;}
  process(inputs){
    const input=inputs[0]?.[0];if(!input)return true;
    for(const sample of input)this.samples.push(sample);
    const step=sampleRate/16000;
    while(this.position+1<this.samples.length){
      const index=Math.floor(this.position),fraction=this.position-index;
      const value=Math.max(-1,Math.min(1,this.samples[index]*(1-fraction)+this.samples[index+1]*fraction));
      this.packet[this.offset++]=Math.round(value*(value<0?32768:32767));this.position+=step;
      if(this.offset===this.packet.length){this.port.postMessage(this.packet.buffer,[this.packet.buffer]);this.packet=new Int16Array(1600);this.offset=0;}
    }
    const used=Math.min(Math.floor(this.position),this.samples.length-1);this.samples.splice(0,used);this.position-=used;return true;
  }
}
registerProcessor('brisky-microphone',BriskyMicrophone);
