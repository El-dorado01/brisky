/** Shared by indexing admission and the provider so every planned window is budgeted. */
export function planVideoChunks(duration:number, bytes:number, inlineBytes:number, seconds=90) {
  if (!Number.isFinite(duration)||duration<=0||!Number.isFinite(bytes)||bytes<=0||
      !Number.isSafeInteger(inlineBytes)||inlineBytes<1024||!Number.isSafeInteger(seconds)||seconds<1||seconds>300)
    throw new Error('Invalid bounded video analysis settings');
  const count=Math.ceil(duration/seconds);
  if(count>4096)throw new Error('Video analysis exceeds 4096 windows; use a smaller source');
  if(count===1&&bytes<=inlineBytes)return [{start:0,end:duration,original:true}];
  return Array.from({length:count},(_,i)=>({start:i*seconds,end:Math.min(duration,(i+1)*seconds),original:false}));
}
