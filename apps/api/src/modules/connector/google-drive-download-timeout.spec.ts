jest.mock('googleapis',()=>({google:{drive:jest.fn()}}));
import {google} from 'googleapis';
import {PassThrough} from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {GoogleDriveConnector} from './google-drive.connector';

describe('Drive transfer timeout boundaries',()=>{
  let root:string;
  beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-drive-deadline-'));});
  afterEach(()=>{jest.useRealTimers();fs.rmSync(root,{recursive:true,force:true});});
  it('allows a progressing body to arrive after 30 seconds without a connection timeout abort',async()=>{
    jest.useFakeTimers();
    const stream=new PassThrough();
    const get=jest.fn().mockResolvedValueOnce({data:{size:'4'}}).mockResolvedValueOnce({data:stream});
    (google.drive as jest.Mock).mockReturnValue({files:{get}});
    const connector=new GoogleDriveConnector({get:(_key:string,fallback:any)=>fallback} as any);
    const dest=path.join(root,'source.mp4');
    const downloading=connector.downloadAsset({} as any,'fixture',dest);
    await jest.advanceTimersByTimeAsync(31000);
    expect(get.mock.calls[1][1].timeout).toBe(900000);
    expect(get.mock.calls[1][1].signal.aborted).toBe(false);
    stream.end('data');
    await downloading;
    expect(fs.readFileSync(dest,'utf8')).toBe('data');
  });
});
