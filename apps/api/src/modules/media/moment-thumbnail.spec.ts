import { MomentThumbnailService } from './moment-thumbnail.service';
import { mkdtempSync,writeFileSync,rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Owned moment thumbnails',()=>{
  const db={query:jest.fn()},media={getStreamInfo:jest.fn()},ffmpeg={getFfmpegPath:jest.fn()};
  let root:string,service:MomentThumbnailService;
  beforeEach(()=>{jest.clearAllMocks();root=mkdtempSync(join(tmpdir(),'brisky-thumb-'));service=new MomentThumbnailService(db as any,media as any,ffmpeg as any,{get:()=>root} as any);});
  afterEach(()=>rmSync(root,{recursive:true,force:true}));
  it('denies a foreign source before accessing files or FFmpeg',async()=>{
    db.query.mockResolvedValue({rowCount:0,rows:[]});await expect(service.image('owner','asset',1,2)).rejects.toThrow('Source not found');expect(media.getStreamInfo).not.toHaveBeenCalled();expect(ffmpeg.getFfmpegPath).not.toHaveBeenCalled();
  });
  it('rejects invalid/out-of-duration ranges before file work',async()=>{
    for(const range of [[NaN,2],[-1,2],[2,2],[0,Infinity]])await expect(service.image('owner','asset',...range as [number,number])).rejects.toThrow('Invalid source range');
    db.query.mockResolvedValue({rowCount:1,rows:[{duration:3}]});await expect(service.image('owner','asset',1,4)).rejects.toThrow('Range exceeds');expect(media.getStreamInfo).not.toHaveBeenCalled();
  });
  it('reports an unprepared source without decoding or enqueueing',async()=>{
    db.query.mockResolvedValue({rowCount:1,rows:[{duration:3}]});media.getStreamInfo.mockResolvedValue({status:'preparing'});expect(await service.image('owner','asset',1,2)).toBeNull();expect(media.getStreamInfo).toHaveBeenCalledWith('asset','owner',false);expect(ffmpeg.getFfmpegPath).not.toHaveBeenCalled();
  });
  it('releases a failed generation so later requests can retry',async()=>{
    const file=join(root,'source.mp4');writeFileSync(file,'fixture');db.query.mockResolvedValue({rowCount:1,rows:[{duration:3}]});media.getStreamInfo.mockResolvedValue({status:'ready',filePath:file});ffmpeg.getFfmpegPath.mockReturnValue(null);
    for(let i=0;i<2;i++)await expect(service.image('owner','asset',1,2)).rejects.toThrow('Thumbnail processing unavailable');expect(ffmpeg.getFfmpegPath).toHaveBeenCalledTimes(2);
  });
  it('uses an owned in-range durable frame even when no playable preview exists',async()=>{
    const frame=join(root,'keyframe.jpg');writeFileSync(frame,'fixture');
    db.query.mockResolvedValueOnce({rowCount:1,rows:[{duration:3}]}).mockResolvedValueOnce({rows:[{keyframe_paths:[{timestamp:1.5,path:'keyframe.jpg'}]}]});
    ffmpeg.getFfmpegPath.mockReturnValue(null);
    await expect(service.image('owner','asset',1,2)).rejects.toThrow('Thumbnail processing unavailable');
    expect(media.getStreamInfo).not.toHaveBeenCalled();
    expect(db.query.mock.calls[1][1]).toEqual(['asset','owner',1,2]);
  });
  it('does not use a frame outside the requested range',async()=>{
    const frame=join(root,'keyframe.jpg');writeFileSync(frame,'fixture');
    db.query.mockResolvedValueOnce({rowCount:1,rows:[{duration:3}]}).mockResolvedValueOnce({rows:[{keyframe_paths:[{timestamp:2.5,path:'keyframe.jpg'}]}]});
    media.getStreamInfo.mockResolvedValue({status:'preparing'});
    expect(await service.image('owner','asset',1,2)).toBeNull();expect(media.getStreamInfo).toHaveBeenCalled();
  });
});
