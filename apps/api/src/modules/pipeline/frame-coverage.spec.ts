import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FfmpegPipelineService } from './ffmpeg-pipeline.service';

describe('required scene frame coverage', () => {
  let directory: string;
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-frame-')); });
  afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });
  function setup() {
    const service = new FfmpegPipelineService({} as any, { get: (_key: string, fallback: unknown) => fallback } as any);
    jest.spyOn(service as any, 'detectSceneCuts').mockResolvedValue([0, 1]);
    return service;
  }
  it('retries a transient streamed decoder failure and retains every planned frame', async () => {
    const service = setup();
    const extract = jest.spyOn(service as any, 'extractFrame').mockRejectedValueOnce(new Error('timeout'))
      .mockImplementation(async (...args: unknown[]) => { fs.writeFileSync(args[1] as string, 'jpeg'); });
    const scenes = await service.detectScenesAndExtractFrames('http://127.0.0.1:1234/private', 1, directory);
    expect(scenes[0].keyframes?.map(frame => frame.timestamp)).toEqual([0, 0.5]);
    expect(extract).toHaveBeenCalledTimes(3);
    expect(extract.mock.calls.every(call => call[4] === 60000)).toBe(true);
  });
  it('reports completed frame counts, never scene starts or failed attempts',async()=>{
    const service=setup(),progress=jest.fn((done:number,total:number)=>{
      expect(total).toBe(2);expect(fs.readdirSync(directory).filter(f=>f.endsWith('.jpg')).length).toBeGreaterThanOrEqual(done);
    });
    jest.spyOn(service as any,'extractFrame').mockRejectedValueOnce(Error('transient'))
      .mockImplementation(async(...args:unknown[])=>{fs.writeFileSync(args[1] as string,'jpeg');});
    await service.detectScenesAndExtractFrames('http://127.0.0.1:1234/private',1,directory,progress);
    expect(progress.mock.calls).toEqual([[0,2],[1,2],[2,2]]);
  });
  it('rejects preparation after bounded retries instead of publishing partial frames', async () => {
    const service = setup();
    const extract = jest.spyOn(service as any, 'extractFrame').mockRejectedValue(new Error('unavailable'));
    await expect(service.detectScenesAndExtractFrames('http://127.0.0.1:1234/private', 1, directory))
      .rejects.toThrow('Required keyframe missing');
    expect(extract).toHaveBeenCalledTimes(2);
  });
  it('rejects successful decoder exits that produce no frame file', async () => {
    const service = setup();
    jest.spyOn(service as any, 'extractFrame').mockResolvedValue('missing.jpg');
    await expect(service.detectScenesAndExtractFrames('local.mp4', 1, directory))
      .rejects.toThrow('Required keyframe missing');
  });
  it('does not sample the exclusive end of a recording', async () => {
    const service = setup();
    (service as any).detectSceneCuts.mockResolvedValue([0, 2]);
    jest.spyOn(service as any, 'extractFrame').mockImplementation(async (...args: unknown[]) => {
      fs.writeFileSync(args[1] as string, 'jpeg');
    });
    const scenes = await service.detectScenesAndExtractFrames('local.mp4', 2, directory);
    expect(scenes[0].keyframes?.map(frame => frame.timestamp)).toEqual([0, 1]);
  });
  it('recovers an audio-only tail within the scene and stores the recovered timestamp',async()=>{
    const service=setup();
    (service as any).detectSceneCuts.mockResolvedValue([0,10.7,14.72]);
    jest.spyOn(service as any,'extractFrame').mockImplementation(async(...args:unknown[])=>{
      if((args[2] as number)<14.7)fs.writeFileSync(args[1] as string,'jpeg');
    });
    const scenes=await service.detectScenesAndExtractFrames('local.mp4',14.72,directory);
    expect(scenes[1].keyframes?.map(f=>f.timestamp)).toContain(14.65);
    expect(scenes[1].keyframes?.map(f=>f.timestamp)).not.toContain(14.7);
    expect(scenes[1].keyframes?.every(f=>f.timestamp>=10.7&&f.timestamp<14.72)).toBe(true);
  });
  it('does not move a frame outside its scene or recover arbitrary decoder failures',async()=>{
    const service=setup();
    (service as any).detectSceneCuts.mockResolvedValue([0,10.7,14.72]);
    const extract=jest.spyOn(service as any,'extractFrame').mockImplementation(async(...args:unknown[])=>{
      if(args[2]===14.7)throw Error('network timeout');
      fs.writeFileSync(args[1] as string,'jpeg');
    });
    await expect(service.detectScenesAndExtractFrames('local.mp4',14.72,directory)).rejects.toThrow('Required keyframe missing');
    expect(extract.mock.calls.some(call=>call[2]===14.65)).toBe(false);
  });
});
