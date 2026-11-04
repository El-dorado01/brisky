import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IndexingProcessor } from './indexing.processor';
import { FactoryJobEnvelope } from './indexing.types';

describe('streamed indexing and preparation checkpoint reuse', () => {
  let root: string;
  let processor: any;
  let ffmpeg: any;
  let connector: any;
  let units: any;
  let jobs: any;
  let whisper: any;
  let ai: any;
  let version: string;
  let store: Map<string, any>;
  let validate: jest.Mock;
  let envelope: FactoryJobEnvelope;
  let settings: Record<string, string>;
  const job = () => ({ id: 'planning-job', attemptsMade: 0, opts: { attempts: 1 }, updateProgress: jest.fn().mockResolvedValue(undefined) });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-stream-index-'));
    version = 'v1';
    // These tests exercise range-only checkpoints; small-source caching has its own decoder tests.
    settings = { INDEX_SMALL_FILE_CACHE_MB: '0' };
    store = new Map();
    validate = jest.fn().mockResolvedValue(undefined);
    connector = { openReadSession: jest.fn(async () => ({ size: 1000, version, read: jest.fn(), validate })), downloadAsset: jest.fn() };
    ffmpeg = { probeMetadata: jest.fn().mockResolvedValue({ duration: 10, hasAudio: true, codec: 'h264', width: 640, height: 360, fps: 25 }),
      detectScenesAndExtractFrames: jest.fn(async (_source: string, _duration: number, frames: string) => {
        fs.mkdirSync(frames, { recursive: true });
        const file = path.join(frames, 'frame.jpg'); fs.writeFileSync(file, 'synthetic scene frame');
        return [{ sceneId: 1, startTime: 0, endTime: 10, representativeTimestamp: 5, keyframePath: file,
          keyframes: [{ timestamp: 5, path: file }] }];
      }),
      generateThumbnail: jest.fn(async (_source: string, destination: string) => { fs.writeFileSync(destination, 'thumbnail'); }),
      extractAudio: jest.fn(async (_source: string, destination: string) => { fs.writeFileSync(destination, 'audio'); return true; }),
      extractAudioWindow: jest.fn(async (_source: string, destination: string) => { fs.writeFileSync(destination, 'window audio'); }),
    };
    units = { getUnit: jest.fn(async (_asset, id) => store.get(id) || null),
      saveSceneWindow: jest.fn(async (_asset, _owner, fingerprint, id = 'scene_windows', scenes, complete = false) => {
        if (store.has('scene_windows') && store.get('scene_windows').metadata.fingerprint !== fingerprint) throw new Error('reindex is required');
        store.set(id, { unit_id: id, unit_type: 'scene_window', status: scenes || complete ? 'completed' : 'waiting', metadata: { fingerprint, scenes } });
      }),
      saveSourcePreparation: jest.fn(async (_asset, metadata) => store.set('source_preparation', {
        unit_id: 'source_preparation', unit_type: 'source_preparation', status: 'completed', metadata })),
      planUnits: jest.fn(async () => {
        for (const [id, type] of [['scene_1', 'analyze_frames'], ['audio_transcribe', 'transcribe']]) {
          if (!store.has(id)) store.set(id, { unit_id: id, unit_type: type, status: 'waiting', metadata: {} });
        }
      }),
      getCompletedUnits: jest.fn(async () => new Map([...store].filter(([, unit]) => unit.status === 'completed'))),
      getUnits: jest.fn(async () => [...store.values()]),
      markUnitCompleted: jest.fn(async (_asset, id, metadata) => store.set(id, { ...store.get(id), status: 'completed', metadata })),
      resetAssetUnits: jest.fn(async () => store.clear()),
      markUnitFailed: jest.fn().mockResolvedValue(undefined),
      beginTranscriptWindows: jest.fn(async (_asset, _owner, fingerprint) => {
        store.set('audio_windows', { unit_type: 'transcript_window', status: 'waiting', metadata: { fingerprint } });
        if (!store.has('audio_transcribe')) store.set('audio_transcribe', { status: 'waiting' });
      }),
      getCompletedTranscriptWindows: jest.fn(async () => new Map([...store].filter(([id, unit]) => id.startsWith('audio_window_') && unit.status === 'completed')
        .map(([id, unit]) => [id, unit.metadata]))),
      publishTranscriptWindow: jest.fn(async (_asset, _owner, fingerprint, window, cues) => {
        store.set(`audio_window_${String(window.index).padStart(6, '0')}`, { status: 'completed', metadata: { fingerprint, index: window.index, cues } });
      }),
      finishTranscriptWindows: jest.fn(async () => { store.set('audio_transcribe', { status: 'completed' }); store.get('audio_windows').status = 'completed'; }),
      failTranscriptWindows: jest.fn(async () => { store.set('audio_transcribe', { status: 'failed' }); }),
    };
    jobs = { enqueueAsset: jest.fn().mockResolvedValue('child') };
    whisper = { isAvailable: () => true, transcribeAudio: jest.fn().mockResolvedValue({
      transcript: [{ start_time: 0, end_time: 3, text: 'hello' }] }) };
    ai = { transcribeAudio: jest.fn(), analyzeVideo: jest.fn() };
    processor = new IndexingProcessor({ query: jest.fn().mockResolvedValue({ rows: [] }) } as any,
      ffmpeg, ai, whisper, {} as any,
      { get: (key: string, fallback: unknown) => key === 'STORAGE_ROOT' ? root : settings[key] ?? fallback } as any,
      { get: () => connector } as any, { getAuthContext: jest.fn().mockResolvedValue({}) } as any,
      units, undefined, undefined, jobs);
    envelope = { job_type: 'plan_asset', job_id: 'planning-job', asset_id: 'asset', user_id: 'owner', priority: 'normal',
      source: { provider: 'google_drive', remoteId: 'file', connectorAccountId: 'account', fileSize: 1000, originalFilename: 'source.mp4' } };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  function controlledBudget(budget:string) {
    Object.assign(settings, { INDEX_BUDGET_PLAN_ENABLED:'true',AI_PROVIDER:'baseten',LOCAL_EMBEDDING_USER_IDS:'owner',
      AI_BUDGET_USD:budget, AI_USAGE_LEDGER_PATH:path.join(root,'usage.jsonl'),
      AI_MODEL_PRICING_JSON:JSON.stringify({'baseten/model':{reservationUsd:0.1,inputUsdPerMillion:1,outputUsdPerMillion:1}}) });
    ai.getPrimaryModel=()=> 'model';
  }
  it('rejects an unaffordable complete file before dispatching analysis or generating a preview', async () => {
    controlledBudget('0.1');
    await expect(processor.executeProcessing(job(),envelope)).rejects.toThrow('complete file');
    expect(jobs.enqueueAsset).not.toHaveBeenCalled();expect(ffmpeg.generateThumbnail).not.toHaveBeenCalled();
  });
  it('durably reserves scene/video and retry allowance before dispatching child jobs', async () => {
    controlledBudget('1');
    await processor.executeProcessing(job(),envelope);
    const events=fs.readFileSync(path.join(root,'usage.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    expect(events[0]).toMatchObject({event:'plan_reserved',attempt:{reservedUsd:0.4,requestId:'owner/asset'}});
    expect(jobs.enqueueAsset).toHaveBeenCalled();
  });
  it('plans explicit Meta frame and video models without changing local speech or scope guards',async()=>{
    controlledBudget('1');settings.AI_PROVIDER='meta';settings.META_VIDEO_MODEL='video-model';
    settings.AI_MODEL_PRICING_JSON=JSON.stringify({'meta/model':{reservationUsd:.1,inputUsdPerMillion:1,outputUsdPerMillion:2},'meta/video-model':{reservationUsd:.2,inputUsdPerMillion:1,outputUsdPerMillion:2}});
    await processor.executeProcessing(job(),envelope);
    const events=fs.readFileSync(path.join(root,'usage.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    expect(events[0].attempt).toMatchObject({provider:'meta',allowedModels:['model','video-model'],reservedUsd:.8});
    expect(jobs.enqueueAsset).toHaveBeenCalled();
  });
  it('records a blocked source against its owner without starting processing', async () => {
    controlledBudget('1');settings.INDEX_ALLOWED_CONNECTOR_ACCOUNT_IDS='different-account';
    await expect(processor.process({...job(),data:envelope})).rejects.toThrow('outside controlled');
    expect(processor.db.query).toHaveBeenCalledWith(expect.stringContaining("stage='blocked'"),expect.arrayContaining(['owner']));
    expect(ffmpeg.probeMetadata).not.toHaveBeenCalled();
  });
  it('reserves every video window rather than one call for a long source',async()=>{
    controlledBudget('5');settings.AI_VIDEO_CHUNK_SECONDS='4';
    await processor.executeProcessing(job(),envelope);
    const events=fs.readFileSync(path.join(root,'usage.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    // One frame call plus three video windows, with two attempts per call.
    expect(events[0].attempt.reservedUsd).toBeCloseTo(.8);
  });
  it('admits sources larger than the former test cap while retaining account scope', async () => {
    controlledBudget('1'); settings.INDEX_ALLOWED_CONNECTOR_ACCOUNT_IDS='account';
    envelope.source.fileSize=128*1024*1024;
    const scoped=jest.spyOn(processor,'processScoped').mockResolvedValue(undefined);
    await processor.process({...job(),data:envelope});
    expect(scoped).toHaveBeenCalledTimes(1);
  });
  it('still rejects sources above the configured resource ceiling and unknown source sizes', async () => {
    controlledBudget('1'); settings.INDEX_ALLOWED_CONNECTOR_ACCOUNT_IDS='account';
    processor.fullDownloadMaxBytes=64*1024*1024;
    envelope.source.fileSize=128*1024*1024;
    await expect(processor.process({...job(),data:envelope})).rejects.toThrow('WORKER_FULL_DOWNLOAD_MAX_MB');
    envelope.source.fileSize=0;
    await expect(processor.process({...job(),data:envelope})).rejects.toThrow('positive source size');
    expect(ffmpeg.probeMetadata).not.toHaveBeenCalled();
  });
  it('resumes completed scene windows and preserves boundary evidence without repeating decoding', async () => {
    settings.WINDOWED_SCENE_PREPARATION = 'true';
    ffmpeg.probeMetadata.mockResolvedValue({ duration: 124, hasAudio: true, codec: 'h264', width: 640, height: 360 });
    let fail = true;
    ffmpeg.detectScenesAndExtractFrames.mockImplementation(async (_source: string, duration: number, frames: string, _progress: unknown, start: number) => {
      if (start === 58 && fail) throw new Error('decoder interrupted');
      fs.mkdirSync(frames, { recursive: true });
      const file = path.join(frames, 'frame.jpg'); fs.writeFileSync(file, 'frame');
      return [{ sceneId: 1, startTime: start, endTime: start + duration, representativeTimestamp: start + duration / 2,
        keyframePath: file, keyframes: [{ timestamp: start + duration / 2, path: file }] }];
    });
    ffmpeg.extractSceneContext = jest.fn(async (_source, start, end, frames, sceneId) => {
      fs.mkdirSync(frames, { recursive: true });
      const file = path.join(frames, 'context.jpg'); fs.writeFileSync(file, 'context');
      return { sceneId, startTime: start, endTime: end, representativeTimestamp: (start + end) / 2,
        keyframePath: file, keyframes: [{ timestamp: (start + end) / 2, path: file }] };
    });
    await expect(processor.executeProcessing(job(), envelope)).rejects.toThrow('decoder interrupted');
    expect(store.get('scene_window_000000').status).toBe('completed');
    fail = false;
    await processor.executeProcessing({ ...job(), attemptsMade: 1 }, envelope);
    expect(ffmpeg.detectScenesAndExtractFrames.mock.calls.filter((args: any[]) => args[4] === 0)).toHaveLength(1);
    expect(store.get('source_preparation').metadata.scenes).toEqual(expect.arrayContaining([
      expect.objectContaining({ sceneId: 9999, startTime: 58, endTime: 62 }),
      expect.objectContaining({ sceneId: 19999, startTime: 118, endTime: 122 }),
    ]));
    expect(jobs.enqueueAsset.mock.calls.some(([data]: any[]) => data.processing_config.unitId?.startsWith('scene_window'))).toBe(false);
  });
  it('processes scenes from a reader, persists durable preparation and reuses it on retry', async () => {
    await processor.executeProcessing(job(), envelope);
    const endpoint = ffmpeg.probeMetadata.mock.calls[0][0];
    expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(connector.downloadAsset).not.toHaveBeenCalled();
    expect(units.saveSourcePreparation).toHaveBeenCalledTimes(1);
    expect(store.get('source_preparation').metadata.sourceVersion).toBe('v1');
    expect(jobs.enqueueAsset.mock.calls.some(([data]: any[]) => data.processing_config.unitId === 'source_preparation')).toBe(false);
    await expect(fetch(endpoint)).rejects.toThrow();
    await processor.executeProcessing({ ...job(), attemptsMade: 1 }, envelope);
    expect(ffmpeg.detectScenesAndExtractFrames).toHaveBeenCalledTimes(1);
    expect(units.saveSourcePreparation).toHaveBeenCalledTimes(1);
  });
  it('rejects preparation reuse when the source version changed', async () => {
    await processor.executeProcessing(job(), envelope);
    version = 'v2';
    await expect(processor.executeProcessing({ ...job(), attemptsMade: 1 }, envelope)).rejects.toThrow('reindex is required');
    expect(ffmpeg.detectScenesAndExtractFrames).toHaveBeenCalledTimes(1);
  });
  it('retains preparation across a retry of a force-reindex job', async () => {
    const forced = { ...envelope, processing_config: { forceReindex: true } };
    await processor.executeProcessing(job(), forced);
    await processor.executeProcessing({ ...job(), attemptsMade: 1 }, forced);
    expect(units.resetAssetUnits).toHaveBeenCalledTimes(1);
    expect(ffmpeg.detectScenesAndExtractFrames).toHaveBeenCalledTimes(1);
  });
  it('can reuse inline keyframes after the original worker files disappear', async () => {
    await processor.executeProcessing(job(), envelope);
    fs.rmSync(path.join(root, 'keyframes'), { recursive: true, force: true });
    await processor.executeProcessing({ ...job(), attemptsMade: 1 }, envelope);
    expect(ffmpeg.detectScenesAndExtractFrames).toHaveBeenCalledTimes(1);
  });
  it('does not save preparation when source validation fails after decoding', async () => {
    validate.mockRejectedValue(new Error('source changed'));
    await expect(processor.executeProcessing(job(), envelope)).rejects.toThrow('source changed');
    expect(units.saveSourcePreparation).not.toHaveBeenCalled();
    await expect(fetch(ffmpeg.probeMetadata.mock.calls[0][0])).rejects.toThrow();
  });
  it('extracts audio through the reader and skips completed transcription on retry', async () => {
    await processor.executeProcessing(job(), envelope);
    const audioJob = { ...envelope, job_type: 'transcribe', job_id: 'audio-job' };
    await processor.executeTranscribeOnly({ id: 'audio-job' }, audioJob);
    expect(ffmpeg.extractAudio.mock.calls[0][0]).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(connector.downloadAsset).not.toHaveBeenCalled();
    expect(whisper.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(ai.transcribeAudio).not.toHaveBeenCalled();
    await processor.executeTranscribeOnly({ id: 'audio-job' }, audioJob);
    expect(ffmpeg.extractAudio).toHaveBeenCalledTimes(1);
    expect(whisper.transcribeAudio).toHaveBeenCalledTimes(1);
  });
  it.each(['meta','baseten','google'])('honors %s AI speech even with Whisper installed and local window mode enabled',async(provider)=>{
    settings.AI_PROVIDER=provider;settings.TRANSCRIPTION_PROVIDER='ai';settings.WINDOWED_TRANSCRIPTION='true';
    ai.transcribeAudio.mockResolvedValue({transcript:[{start_time:1,end_time:2,text:'One, two, go!'}],usage:{provider:'meta',model:'audio-model'}});
    await processor.executeProcessing(job(),envelope);
    await processor.executeTranscribeOnly({id:'audio-job'},{...envelope,job_type:'transcribe',job_id:'audio-job'});
    expect(whisper.transcribeAudio).not.toHaveBeenCalled();expect(ai.transcribeAudio).toHaveBeenCalledTimes(1);
    expect(ai.transcribeAudio.mock.calls[0][0]).toMatch(/audio\.mp3$/);
    expect(store.get('audio_transcribe').metadata).toMatchObject({transcriptionProvider:'ai',usage:{model:'audio-model'}});
  });
  it('reserves the audio model and its chunks before dispatching AI speech',async()=>{
    controlledBudget('3');Object.assign(settings,{AI_PROVIDER:'meta',TRANSCRIPTION_PROVIDER:'ai',META_VIDEO_MODEL:'video-model',META_AUDIO_MODEL:'audio-model',META_TRANSCRIPT_CHUNK_SECONDS:'90'});
    settings.AI_MODEL_PRICING_JSON=JSON.stringify(Object.fromEntries(['model','video-model','audio-model'].map(m=>['meta/'+m,{reservationUsd:.1,inputUsdPerMillion:1,outputUsdPerMillion:2}])));
    await processor.executeProcessing(job(),envelope);
    const event=JSON.parse(fs.readFileSync(path.join(root,'usage.jsonl'),'utf8').trim().split('\n')[0]);
    expect(event.attempt.allowedModels).toContain('audio-model');expect(event.attempt.reservedUsd).toBeCloseTo(.8);
  });
  it('rejects audio from a different source version before transcription', async () => {
    await processor.executeProcessing(job(), envelope);
    version = 'v2';
    await expect(processor.executeTranscribeOnly({ id: 'audio-job' },
      { ...envelope, job_type: 'transcribe', job_id: 'audio-job' })).rejects.toThrow('changed since scene preparation');
    expect(ffmpeg.extractAudio).not.toHaveBeenCalled();
    expect(whisper.transcribeAudio).not.toHaveBeenCalled();
    expect(ai.transcribeAudio).not.toHaveBeenCalled();
  });
  it('blocks the whole-video AI pass when its source differs from prepared scenes', async () => {
    await processor.executeProcessing(job(), envelope);
    version = 'v2';
    await expect(processor.executeGeminiVideo({ id: 'video-job' },
      { ...envelope, job_type: 'gemini_video', job_id: 'video-job' })).rejects.toThrow('changed since scene preparation');
    expect(connector.downloadAsset).not.toHaveBeenCalled();
    expect(ai.analyzeVideo).not.toHaveBeenCalled();
  });
  it('publishes early audio windows and resumes without repeating successful inference', async () => {
    settings.WINDOWED_TRANSCRIPTION = 'true';
    ffmpeg.probeMetadata.mockResolvedValue({ duration: 130, hasAudio: true });
    const transcribe = jest.fn().mockResolvedValue({ transcript: [{ start_time: 2, end_time: 4, text: 'words' }] })
      .mockResolvedValueOnce({ transcript: [{ start_time: 2, end_time: 4, text: 'first words' }] })
      .mockRejectedValueOnce(new Error('interrupted'));
    const close = jest.fn().mockResolvedValue(undefined);
    whisper.createSession = jest.fn(() => ({ transcribeAudio: transcribe, close }));
    const audioEnvelope = { ...envelope, job_type: 'transcribe', job_id: 'audio-job' };
    await expect(processor.executeTranscribeOnly({ id: 'audio-job' }, audioEnvelope)).rejects.toThrow('interrupted');
    expect(units.publishTranscriptWindow).toHaveBeenCalledTimes(1);
    expect(store.get('audio_window_000000').metadata.cues).toEqual([{ start_time: 2, end_time: 4, text: 'first words' }]);
    await processor.executeTranscribeOnly({ id: 'audio-job' }, audioEnvelope);
    expect(transcribe).toHaveBeenCalledTimes(4);
    expect(units.publishTranscriptWindow.mock.calls.map((args: any[]) => args[3].index)).toEqual([0, 1, 2]);
    expect(store.get('audio_window_000001').metadata.cues[0].start_time).toBe(60);
    expect(store.get('audio_window_000002').metadata.cues[0].start_time).toBe(120);
    expect(store.get('audio_transcribe').status).toBe('completed');
    expect(close).toHaveBeenCalledTimes(2);
    expect(ai.transcribeAudio).not.toHaveBeenCalled();
    expect(connector.downloadAsset).not.toHaveBeenCalled();
  });
});
