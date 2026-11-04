import {faceFrameTimes} from './face-sampling';
describe('face scan window sampling',()=>{
  it('does not seek past the last available frame of the two-second 12fps fixture',()=>{const times=faceFrameTimes(0,2);expect(times.at(-1)).toBeLessThan(23/12);expect(times.length).toBeLessThanOrEqual(24);});
  it('keeps long-video samples inside their original source window',()=>{const times=faceFrameTimes(60,120);expect(times).toHaveLength(24);expect(times[0]).toBeGreaterThan(60);expect(times.at(-1)).toBeLessThan(120);});
  it('rejects invalid windows rather than inventing source times',()=>{for(const [start,end] of [[1,0],[-1,1],[0,Infinity],[NaN,1]])expect(()=>faceFrameTimes(start,end)).toThrow();});
});
