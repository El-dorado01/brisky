"""Read-only local video inventory; writes private metadata, never runs recognition."""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import subprocess


def fingerprint(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def inventory(root, ffprobe, previous):
    root = root.resolve(strict=True)
    if not root.is_dir(): raise ValueError('Expected a local video directory')
    previous_hashes = {r['sha256'] for r in previous.get('records', [])}
    files = sorted((p for p in root.rglob('*') if p.is_file() and p.suffix.lower() in
                    ('.mp4','.mov','.mkv','.webm','.avi','.m4v')),key=lambda p:str(p.relative_to(root)).casefold())
    records = []
    for index, path in enumerate(files,1):
        if not path.resolve().is_relative_to(root): raise ValueError('Video link leaves selected directory')
        before = path.stat()
        checksum = fingerprint(path)
        row = {'id':f'fresh-{index:03}','file':str(path),'bytes':before.st_size,'sha256':checksum,
               'duplicates_previous':checksum in previous_hashes,'labels':None,
               'consent':'not_assessed_by_inventory'}
        try:
            completed = subprocess.run([str(ffprobe),'-v','error','-show_entries',
                'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate:stream_tags=rotate:stream_side_data=rotation',
                '-of','json',str(path)],capture_output=True,text=True,check=True,timeout=20)
            info = json.loads(completed.stdout)
            video = next(s for s in info['streams'] if s['codec_type']=='video')
            duration = float(info['format']['duration'])
            if not math.isfinite(duration) or duration <= 0: raise ValueError('Invalid duration')
            row.update(duration=duration,video=video,
                       audio=any(s['codec_type']=='audio' for s in info['streams']))
        except (subprocess.SubprocessError,ValueError,KeyError,StopIteration):
            row['error']='metadata_unavailable'
        after = path.stat()
        if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns):
            raise ValueError('Source changed during inventory; retry with a fresh output')
        records.append(row)
    return {'version':1,'stage':'fresh_intake_no_model_inference','records':records}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--ffprobe',type=Path,required=True)
    parser.add_argument('--previous',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.output.exists(): raise ValueError('Use a fresh private inventory path')
    data=inventory(args.root,args.ffprobe,json.loads(args.previous.read_text(encoding='utf-8')))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open('x',encoding='utf-8') as output: json.dump(data,output,indent=2,allow_nan=False);output.write('\n')
    rows=data['records']; good=[r for r in rows if 'error' not in r]
    print(json.dumps({'files':len(rows),'readable':len(good),'totalMiB':round(sum(r['bytes'] for r in rows)/1024**2,1),
        'durationSeconds':round(sum(r['duration'] for r in good),1),
        'withinBatchDuplicateCopies':sum(n-1 for n in Counter(r['sha256'] for r in rows).values()),
        'duplicatesPrevious':sum(r['duplicates_previous'] for r in rows),'recognitionRun':False}))
