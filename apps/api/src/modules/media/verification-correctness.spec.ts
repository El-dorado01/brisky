import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MediaService } from './media.service';
import { parseSearchQuery } from './query-parse';
import { ConfigService } from '@nestjs/config';
import { publishSearchResults } from '../../common/search-progress';

describe('scene verification correctness', () => {
  let root: string;
  let service: any;
  let entries: any[];
  let cache: Map<string, string>;
  const candidate = { assetId: 'asset', segmentId: 'segment', startTime: 0, endTime: 10,
    score: 0.8, matchQuality: 'direct', transcriptSnippet: '', winningPath: 'visual' };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-verification-'));
    const frame = path.join(root, 'scene.jpg');
    fs.writeFileSync(frame, 'scene evidence');
    entries = [{ timestamp: 5, path: 'scene.jpg' }];
    cache = new Map();
    service = Object.create(MediaService.prototype);
    Object.assign(service, {
      storageRoot: root, scratchDir: root, thumbnailDir: root,
      logger: { warn: jest.fn() },
      prepareSearchEvidence: jest.fn(async () => ({
        frames: entries.map((entry) => ({ ...entry, path: path.join(root, entry.path) })),
        kind: 'original', cleanup: jest.fn(),
      })),
      aiService: { getModelCascade: () => ['test-model'], verifyCandidate: jest.fn().mockResolvedValue({
        status: 'evaluated', matched: true, confidence: 0.9, explanation: 'Visible in supplied frame', matchedTimestamp: 5,
      }) },
      db: { query: jest.fn(async (sql: string, args: any[]) => {
        if (sql.includes('SELECT keyframe_paths')) return { rows: [{ keyframe_paths: entries }] };
        if (sql.includes('SELECT explanation')) {
          const key = `${args[0]}:${args[1]}`;
          return { rows: cache.has(key) ? [{ explanation: cache.get(key) }] : [] };
        }
        if (sql.includes('INSERT INTO verified_queries')) cache.set(`${args[0]}:${args[2]}`, args[5]);
        return { rows: [] };
      }) },
    });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = (s: any, detail = false) => s.verifySceneResults([candidate], parseSearchQuery('red bottle'), detail);

  it('checks dancing with moving video instead of inferring it from a pose or caption',async()=>{
    const clip=path.join(root,'dance.mp4');fs.writeFileSync(clip,'fixture video');
    service.prepareSearchEvidence.mockResolvedValue({frames:[],clipPath:clip,kind:'original',cleanup:jest.fn()});
    service.aiService.verifyClip=jest.fn().mockResolvedValue({status:'evaluated',matched:true,confidence:.9,explanation:'Moving video shows the person dancing beside the counter.',matchedTimestamp:5});
    const result=await service.verifySceneResults([candidate],parseSearchQuery('lady dancing in the kitchen with a big hijab'),false);
    expect(service.prepareSearchEvidence).toHaveBeenCalledWith(expect.anything(),'sequence',undefined);
    expect(service.aiService.verifyCandidate).not.toHaveBeenCalled();expect(service.aiService.verifyClip).toHaveBeenCalledWith(clip,expect.stringContaining('dancing'),0,10,'');
    expect(result[0]).toMatchObject({verificationStatus:'matched',verificationEvidenceKind:'original'});
  });

  it.each([false, true])('preserves narrowed timestamps on fresh and cached searches (detail=%s)', async (detail) => {
    const fresh = await run(service, detail);
    const warm = await run(service, detail);
    expect(fresh[0]).toMatchObject({ startTime: 3.5, endTime: 6.5, stage2Verified: true, verificationStatus: 'matched', score: 0.8 });
    expect(warm).toEqual(fresh);
    expect(service.aiService.verifyCandidate).toHaveBeenCalledTimes(1);
  });
  it('does not substitute an asset thumbnail for missing scene evidence', async () => {
    entries = [];
    fs.writeFileSync(path.join(root, 'asset.jpg'), 'cover image');
    expect((await run(service))[0]).toMatchObject({ stage2Verified: false, verificationStatus: 'insufficient_evidence', matchQuality: 'related' });
    expect(service.aiService.verifyCandidate).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });
  it('retries after an operational error instead of caching it as a negative', async () => {
    service.aiService.verifyCandidate.mockResolvedValueOnce({ status: 'error', matched: false, confidence: 0, explanation: 'Timeout' });
    expect((await run(service))[0].verificationStatus).toBe('error');
    expect(cache.size).toBe(0);
    expect((await run(service))[0].verificationStatus).toBe('matched');
  });
  it('invalidates cached results when evidence bytes change', async () => {
    await run(service);
    fs.writeFileSync(path.join(root, entries[0].path), 'replacement evidence');
    await run(service);
    expect(service.aiService.verifyCandidate).toHaveBeenCalledTimes(2);
  });
  it('does not call a rejected scene a verified match', async () => {
    service.aiService.verifyCandidate.mockResolvedValue({ status: 'evaluated', matched: false, confidence: 0.9, explanation: 'No bottle visible' });
    expect((await run(service))[0]).toMatchObject({ stage2Verified: false, verificationStatus: 'not_matched', matchQuality: 'related' });
  });
  it.each([0.95, 0.4])('verifies explicit details despite retrieval score %s', async (score) => {
    service.aiService.isConfigured = () => true;
    service.searchTranscriptPhrases = jest.fn().mockResolvedValue([]);
    service.searchSegments = jest.fn().mockResolvedValue([{ ...candidate, score }]);
    const results = await service.searchSingleTopic('holding red bottle', undefined, 15);
    expect(service.aiService.verifyCandidate).toHaveBeenCalledTimes(1);
    expect(results[0].verificationStatus).toBe('matched');
  });
  it('keeps a valid inference result if the cache write fails', async () => {
    const query = service.db.query;
    service.db.query = jest.fn((sql: string, args: any[]) => {
      if (sql.includes('INSERT INTO verified_queries')) throw new Error('cache unavailable');
      return query(sql, args);
    });
    expect((await run(service))[0].verificationStatus).toBe('matched');
  });
  it('uses video evidence for action order and cleans it after verification', async () => {
    const clip = path.join(root, 'clip.mp4');
    fs.writeFileSync(clip, 'clip bytes');
    const cleanup = jest.fn();
    service.prepareSearchEvidence.mockResolvedValue({ frames: [], clipPath: clip, kind: 'original', cleanup });
    service.aiService.verifyClip = jest.fn().mockResolvedValue({ status: 'evaluated', matched: true,
      confidence: 0.9, explanation: 'Correct order', matchedTimestamp: 5 });
    const result = await service.verifySceneResults([candidate], parseSearchQuery('bottle before bag'), false, 'user');
    expect(service.aiService.verifyCandidate).not.toHaveBeenCalled();
    expect(service.aiService.verifyClip).toHaveBeenCalledWith(clip, expect.any(String), 0, 10, '');
    expect(result[0]).toMatchObject({ verificationStatus: 'matched', verificationEvidenceKind: 'original' });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('does not confirm a sequence from sparse frames when its source is unavailable', async () => {
    service.prepareSearchEvidence.mockResolvedValue(null);
    const result = await service.verifySceneResults([candidate], parseSearchQuery('bottle before bag'), false, 'user');
    expect(result[0].verificationStatus).toBe('insufficient_evidence');
    expect(service.aiService.verifyCandidate).not.toHaveBeenCalled();
  });
  it('expands beyond the first five candidates when they do not confirm the request', async () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({ ...candidate, segmentId: `segment-${i}` }));
    service.aiService.verifyCandidate.mockResolvedValue({ status: 'evaluated', matched: false,
      confidence: 0.9, explanation: 'Wrong scene' });
    for (let i = 0; i < 5; i++) service.aiService.verifyCandidate.mockResolvedValueOnce({
      status: 'evaluated', matched: false, confidence: 0.9, explanation: 'Wrong scene',
    });
    service.aiService.verifyCandidate.mockResolvedValueOnce({ status: 'evaluated', matched: true,
      confidence: 0.9, explanation: 'Correct scene', matchedTimestamp: 5 });
    const results = await service.verifySceneResults(candidates, parseSearchQuery('bottle'), false);
    expect(results[0].segmentId).toBe('segment-5');
    expect(results[0].stage2Verified).toBe(true);
    expect(service.aiService.verifyCandidate).toHaveBeenCalledTimes(6);
  });
  it('checks a bounded video excerpt before claiming an action in a long scene',async()=>{
    const clip=path.join(root,'sequence.mp4');fs.writeFileSync(clip,'fixture');
    service.prepareSearchEvidence.mockResolvedValue({frames:[],clipPath:clip,kind:'original',cleanup:jest.fn()});
    service.aiService.verifyClip=jest.fn().mockResolvedValue({status:'evaluated',matched:true,confidence:.9,explanation:'Action occurs in this excerpt',matchedTimestamp:8});
    const results=await service.verifySceneResults([{...candidate,endTime:50}],parseSearchQuery('man hits a stick on a leg'),false,'owner');
    expect(service.prepareSearchEvidence.mock.calls[0][0]).toMatchObject({startTime:0,endTime:20});
    expect(service.aiService.verifyClip.mock.calls[0].slice(2,4)).toEqual([0,20]);
    expect(results[0]).toMatchObject({stage2Verified:true,startTime:5,endTime:13});
  });
  it.each([true,false])('accepts a shorter action window only after its own positive video check (%s)',async(focusedMatches)=>{
    const clip=path.join(root,'focus.mp4');fs.writeFileSync(clip,'fixture');
    service.prepareSearchEvidence.mockResolvedValue({frames:[],clipPath:clip,kind:'original',cleanup:jest.fn()});
    service.aiService.verifyClip=jest.fn().mockResolvedValueOnce({status:'evaluated',matched:true,confidence:.9,explanation:'A brief hug',matchedTimestamp:26}).mockResolvedValueOnce({status:'evaluated',matched:focusedMatches,confidence:.9,explanation:focusedMatches?'The hug is visible in this shorter clip':'Action not established',...(focusedMatches?{matchedTimestamp:26}:{})});
    const results=await service.verifySceneResults([{...candidate,startTime:14,endTime:34}],parseSearchQuery('the two were hugging'),false,'owner');
    expect(service.aiService.verifyClip.mock.calls.map((call:any[])=>call.slice(2,4))).toEqual([[14,34],[23,31]]);
    expect(results[0]).toMatchObject({stage2Verified:true,startTime:focusedMatches?23:14,endTime:focusedMatches?31:34});
  });
  it('does not tighten temporal context requests around a single anchor',async()=>{
    const clip=path.join(root,'order.mp4');fs.writeFileSync(clip,'fixture');
    service.prepareSearchEvidence.mockResolvedValue({frames:[],clipPath:clip,kind:'original',cleanup:jest.fn()});
    service.aiService.verifyClip=jest.fn().mockResolvedValue({status:'evaluated',matched:true,confidence:.9,explanation:'Correct order',matchedTimestamp:10});
    const results=await service.verifySceneResults([{...candidate,endTime:20}],parseSearchQuery('hugging after the hit'),false,'owner');
    expect(results[0]).toMatchObject({startTime:0,endTime:20});expect(service.aiService.verifyClip).toHaveBeenCalledTimes(1);
  });
  it('does not treat missing actions in bounded excerpts as a full-scene negative',async()=>{
    const clip=path.join(root,'sequence.mp4');fs.writeFileSync(clip,'fixture');
    service.prepareSearchEvidence.mockResolvedValue({frames:[],clipPath:clip,kind:'original',cleanup:jest.fn()});
    service.aiService.verifyClip=jest.fn().mockResolvedValue({status:'evaluated',matched:false,confidence:.9,explanation:'Not visible in this excerpt'});
    const results=await service.verifySceneResults([{...candidate,endTime:50}],parseSearchQuery('man hits a stick on a leg'),false,'owner');
    expect(results[0].verificationStatus).toBe('insufficient_evidence');
    expect(service.prepareSearchEvidence).toHaveBeenCalledTimes(3);
    expect(service.prepareSearchEvidence.mock.calls.every((call:any[])=>call[0].startTime>=0&&call[0].endTime<=50&&call[0].endTime-call[0].startTime<=20)).toBe(true);
  });
  it('caps inspections at fifteen and never labels uninspected candidates as direct', async () => {
    const candidates = Array.from({ length: 30 }, (_, i) => ({ ...candidate, segmentId: `segment-${i}` }));
    service.aiService.verifyCandidate.mockResolvedValue({ status: 'evaluated', matched: false,
      confidence: 0.9, explanation: 'Not confirmed' });
    const results = await service.verifySceneResults(candidates, parseSearchQuery('bottle'), false);
    expect(service.aiService.verifyCandidate).toHaveBeenCalledTimes(15);
    expect(results.every((hit: any) => hit.matchQuality === 'related')).toBe(true);
    expect(results.filter((hit: any) => hit.verificationStatus === 'insufficient_evidence')).toHaveLength(15);
  });
  it('preserves the original constraints when retrieval uses a rewritten phrase', async () => {
    service.getUnderstoodQuery = jest.fn().mockResolvedValue({ cleanSearchPhrase: 'bottle',
      coreSubject: 'bottle', aliases: [], isCompound: false });
    service.searchSingleTopic = jest.fn().mockResolvedValue([]);
    await service.searchDetailed('bottle before bag, not drinking', undefined, 15, 'user');
    expect(service.searchSingleTopic.mock.calls[0][0]).toBe('bottle');
    expect(service.searchSingleTopic.mock.calls[0][7]).toBe('bottle before bag, not drinking');
  });
  it('scopes local source lookup to the current asset owner', async () => {
    service.searchEvidenceService = { prepare: jest.fn() };
    service.db.query = jest.fn().mockResolvedValue({ rows: [] });
    await (MediaService.prototype as any).prepareSearchEvidence.call(service, candidate, 'sequence', 'user-owner');
    expect(service.db.query).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), ['asset', 'user-owner']);
    expect(service.searchEvidenceService.prepare).not.toHaveBeenCalled();
  });
  it('returns an incomplete search rather than claiming absence at the deadline', async () => {
    service.configService = new ConfigService({ SEARCH_DEADLINE_MS: 10 });
    service.searchWithinDeadline = jest.fn(() => new Promise(() => undefined));
    expect(await service.searchDetailed('bottle')).toMatchObject({
      searchStatus: 'incomplete', hasExactMatch: false, results: [],
      explanation: expect.stringContaining('does not establish'),
    });
  });
  it('does not switch a failed local query embedding to an incompatible remote model', async () => {
    service.configService = new ConfigService({ EMBEDDING_PROVIDER: 'local' });
    service.embeddingCache = new Map();
    service.localEmbeddingService = { isAvailable: () => true,
      generateEmbedding: jest.fn().mockRejectedValue(new Error('local unavailable')) };
    service.aiService.generateEmbedding = jest.fn();
    await expect(service.getCachedOrGenerateEmbedding('bottle')).rejects.toThrow('local unavailable');
    expect(service.aiService.generateEmbedding).not.toHaveBeenCalled();
  });
  it('retains candidates and completed checks when later verification exceeds the deadline', async () => {
    service.configService = new ConfigService({ SEARCH_DEADLINE_MS: 10 });
    service.searchWithinDeadline = jest.fn(async () => {
      publishSearchResults([{ ...candidate, segmentId: 'pending', matchQuality: 'related', verificationStatus: 'pending' } as any]);
      publishSearchResults([{ ...candidate, segmentId: 'confirmed', stage2Verified: true, verificationStatus: 'matched' } as any]);
      await new Promise(() => undefined);
    });
    const response = await service.searchDetailed('bottle');
    expect(response.searchStatus).toBe('incomplete');
    expect(response.results).toHaveLength(2);
    expect(response.results[0].segmentId).toBe('confirmed');
    expect(response.hasExactMatch).toBe(true);
  });
  it('returns browseable candidates without invoking verification in the retrieval phase', async () => {
    service.getUnderstoodQuery = jest.fn().mockResolvedValue({ cleanSearchPhrase: 'red bottle',
      coreSubject: 'bottle', aliases: [], isCompound: false });
    service.searchTranscriptPhrases = jest.fn().mockResolvedValue([]);
    service.searchSegments = jest.fn().mockResolvedValue([candidate]);
    service.aiService.isConfigured = () => true;
    const response = await service.searchDetailed('red bottle', undefined, 15, 'user', 'retrieve');
    expect(response.searchStatus).toBe('refining');
    expect(response.results[0].verificationStatus).toBe('pending');
    expect(response.hasExactMatch).toBe(false);
    expect(service.aiService.verifyCandidate).not.toHaveBeenCalled();
  });
  it('does not invite repeated checking when the AI allowance blocks verification', async () => {
    service.searchWithinDeadline = jest.fn().mockResolvedValue({ results: [{ ...candidate,
      matchQuality: 'related', verificationStatus: 'error', verificationIssue: 'budget' }], hasExactMatch: false });
    const response = await service.searchDetailed('bottle');
    expect(response.canContinue).toBe(false);
    expect(response.explanation).toContain('paused');
  });
});
