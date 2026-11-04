import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { SearchEvidenceService, evidenceMode } from './search-evidence.service';

describe('bounded search evidence', () => {
  let root: string;
  let source: string;
  let ffmpeg: any;
  let service: SearchEvidenceService;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-evidence-'));
    source = path.join(root, 'source.mp4');
    fs.writeFileSync(source, 'fixture');
    ffmpeg = {
      extractInspectionFrame: jest.fn(async (_: string, output: string) => {
        fs.writeFileSync(output, 'frame'); return output;
      }),
      extractClip: jest.fn(async (_: string, output: string) => {
        fs.writeFileSync(output, 'clip'); return output;
      }),
    };
    service = new SearchEvidenceService(new ConfigService({ STORAGE_ROOT: root,
      SCRATCH_DIR: path.join(root, 'scratch') }), ffmpeg);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it('routes order and exclusion constraints to video', () => {
    expect(evidenceMode('puts bottle into bag', true)).toBe('sequence');
    expect(evidenceMode('the two were hugging', false)).toBe('sequence');
    expect(evidenceMode('a brief embrace', false)).toBe('sequence');
    expect(evidenceMode('red bottle, not drinking', false)).toBe('sequence');
    expect(evidenceMode('small silver watch', true)).toBe('detail');
    expect(evidenceMode('budget discussion', false)).toBe('frames');
    for(const query of ['lady dancing in the kitchen with a big hijab','she dances','they danced','a dance','swaying by the counter','twirling around'])expect(evidenceMode(query,false)).toBe('sequence');
  });
  it('extracts bounded source-resolution samples at absolute source timestamps', async () => {
    const evidence = await service.prepare(source, 'original', 100, 110, 'detail');
    expect(evidence!.frames).toHaveLength(12);
    expect(evidence!.frames.every((f) => f.timestamp > 100 && f.timestamp < 110)).toBe(true);
    expect(ffmpeg.extractInspectionFrame).toHaveBeenCalledTimes(12);
    const directory = path.dirname(evidence!.frames[0].path);
    evidence!.cleanup();
    expect(fs.existsSync(directory)).toBe(false);
  });
  it.each(['throws fruit at a hippo','a watermelon was thrown','she tossed something','a hippo catches fruit','the animal caught it','feeding a hippo'])('uses moving video for %s',query=>{
    expect(evidenceMode(query,false)).toBe('sequence');
  });
  it('extracts the actual source interval for temporal verification', async () => {
    const evidence = await service.prepare(source, 'preview', 100, 110, 'sequence');
    expect(ffmpeg.extractClip).toHaveBeenCalledWith(source, evidence!.clipPath, 100, 110);
    expect(evidence!.kind).toBe('preview');
    expect(evidence!.frames).toEqual([]);
    evidence!.cleanup();
  });
  it('refuses overlong windows instead of silently omitting part of the sequence', async () => {
    expect(await service.prepare(source, 'original', 0, 21, 'sequence')).toBeNull();
    expect(ffmpeg.extractClip).not.toHaveBeenCalled();
  });
  it('removes temporary evidence after extraction fails', async () => {
    ffmpeg.extractInspectionFrame.mockRejectedValue(new Error('decoder failed'));
    await expect(service.prepare(source, 'original', 0, 5, 'detail')).rejects.toThrow('decoder failed');
    expect(fs.readdirSync(path.join(root, 'scratch', 'search-inspection'))).toEqual([]);
  });
  it('rejects source paths outside storage', async () => {
    await expect(service.prepare(__filename, 'original', 0, 5, 'detail')).rejects.toThrow('escapes allowed root');
    expect(ffmpeg.extractInspectionFrame).not.toHaveBeenCalled();
  });
  it('rejects oversized prepared clips and cleans their files', async () => {
    const limited = new SearchEvidenceService(new ConfigService({ STORAGE_ROOT: root,
      SCRATCH_DIR: path.join(root, 'scratch'), SEARCH_INSPECTION_MAX_MB: 0.000001 }), ffmpeg);
    expect(await limited.prepare(source, 'original', 0, 5, 'sequence')).toBeNull();
    expect(fs.readdirSync(path.join(root, 'scratch', 'search-inspection'))).toEqual([]);
  });
  it('checks remote source stability before handing evidence to verification', async () => {
    const reader = { url: 'http://127.0.0.1:12345/' + 'a'.repeat(48), bytesRead: 0,
      validate: jest.fn().mockResolvedValue(undefined), close: jest.fn() };
    const evidence = await service.prepareRemote(reader, 0, 5, 'sequence');
    expect(ffmpeg.extractClip).toHaveBeenCalledWith(reader.url, evidence!.clipPath, 0, 5);
    expect(reader.validate).toHaveBeenCalledTimes(1);
    evidence!.cleanup();
    reader.validate.mockRejectedValue(new Error('source changed'));
    await expect(service.prepareRemote(reader, 0, 5, 'sequence')).rejects.toThrow('source changed');
    expect(fs.readdirSync(path.join(root, 'scratch', 'search-inspection'))).toEqual([]);
  });
});
