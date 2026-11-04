/** Keep short-clip samples away from the final packet; long windows use 24 midpoints. */
export function faceFrameTimes(start:number,end:number):number[]{
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new Error('Invalid face window');
  const count=Math.min(24,Math.max(1,Math.floor((end-start)*4)));
  return Array.from({length:count},(_,i)=>start+(i+.5)*(end-start)/count);
}
