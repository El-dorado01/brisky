import {StudioInput,studioSchema,studioSystem,parseStudioDocument} from '../studio-document';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AiIntelligenceProvider, VerificationResult } from '../ai-provider';
import { FfmpegPipelineService } from '../ffmpeg-pipeline.service';
import { FrameObservation, ModelUsage, SceneBoundary } from '../pipeline.types';
import { flattenSceneKeyframes } from '../scene-sampling';
import { resolveFromRepo } from '../../../common/repo-paths';
import { assertSearchActive, SearchDeadlineError } from '../../../common/search-deadline';
import { AiBudgetError } from '../ai-usage-ledger';
import { ConversationEvidence, ConversationVerification, conversationPayload, conversationSchema, conversationUnavailable, parseConversation, validConversationEvidence } from '../conversation-evidence';
import { MetaPart, MetaTransport } from './meta-transport';
import { SpaceAiInput,parseSpaceReply,spaceConversationSystem,spaceReplySchema } from '../space-conversation';
import { metaSchemas, MetaResponseError, parseMetaFrames, parseMetaQuery, parseMetaTranscript,
  parseMetaVerification, parseMetaVideo, rawMetaQuery } from './meta-contract';

type Embeddings = Pick<AiIntelligenceProvider,'getEmbeddingModel'|'generateEmbedding'>;
const noEvidence = (explanation: string): VerificationResult => ({status:'insufficient_evidence',matched:false,confidence:0,explanation});

/** Dormant unless explicitly selected. Generation credentials/models never inherit Google's. */
export class MetaAiProvider implements AiIntelligenceProvider {
  private readonly transport: MetaTransport;
  constructor(protected readonly config: ConfigService, private readonly ffmpeg: FfmpegPipelineService,
    private readonly embeddings: Embeddings, fetcher: typeof fetch = globalThis.fetch,private readonly backend:'meta'|'baseten'='meta') {
    this.transport = new MetaTransport(config, fetcher,backend);
  }
  isConfigured() { return !!this.transport.key() && !!this.getPrimaryModel(); }
  getPrimaryModel(): string { return (this.config.get<string>('META_MODEL','')).trim(); }
  getModelCascade(): string[] { return this.models(this.getPrimaryModel(), 'META_FALLBACK_MODELS'); }
  getEmbeddingModel(): string { return this.embeddings.getEmbeddingModel(); }
  generateEmbedding(text: string) { return this.embeddings.generateEmbedding(text); }
  async studioDocument(input:StudioInput){
    const result=await this.transport.complete('studio_document',this.getModelCascade(),()=>[this.prompt(JSON.stringify(input))],studioSchema,value=>parseStudioDocument(value,input),studioSystem());
    return {document:result.value,usage:result.usage};
  }
  async spaceConversation(input:SpaceAiInput) {
    const result=await this.transport.complete(`space_conversation_${input.phase}`,this.getModelCascade(),()=>[
      this.prompt(JSON.stringify(input)),
    ],spaceReplySchema,raw=>parseSpaceReply(raw,input),spaceConversationSystem(input.phase));
    return {...result.value,usage:result.usage};
  }
  async verifyConversation(evidence: ConversationEvidence): Promise<ConversationVerification> {
    if (!this.isConfigured()) return conversationUnavailable('Conversation model is not configured');
    let scratch: string|undefined;
    try {
      if (!validConversationEvidence(evidence)) return conversationUnavailable('Invalid grounded conversation evidence');
      let audio: string|undefined;
      if (this.backend==='baseten') {
        if (String(this.config.get('BASETEN_MEDIA_ENABLED','false'))!=='true') return conversationUnavailable('Baseten conversation media is not enabled');
        scratch=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-conversation-audio-'));
        const file=path.join(scratch,'clip.mp3');
        if (!await this.ffmpeg.extractAudio(evidence.clipPath,file,15000)) return conversationUnavailable('Conversation audio could not be prepared','source');
        const metadata=await this.ffmpeg.probeMetadata(file);
        if (!Number.isFinite(metadata.duration) || Math.abs(metadata.duration-(evidence.end-evidence.start))>0.5) return conversationUnavailable('Conversation audio is not aligned','source');
        const encoded=this.bytes(file,{'.mp3':'audio/mpeg'});
        if (fs.statSync(file).size+[evidence.clipPath,...evidence.anchors.map(a=>a.framePath)].reduce((n,p)=>n+fs.statSync(p).size,0)>32*1024*1024) throw new Error('Conversation evidence byte bound exceeded');
        audio=encoded.data;
      }
      const result=await this.transport.complete('conversation_verification',this.mediaModels('VIDEO'),()=>{
        const payload=conversationPayload(evidence);
        const parts: MetaPart[]=[this.prompt(payload.prompt),{type:'video_url',video_url:{url:`data:video/mp4;base64,${payload.video}`}}];
        if (audio) parts.push(this.prompt('The separate audio is extracted from this exact clip. Audio and video both begin at clip-relative zero. Video input has no audible track; use the attached audio for speech evidence.'),{type:'audio_url',audio_url:{url:`data:audio/mpeg;base64,${audio}`}});
        payload.images.forEach((data,index)=>parts.push(this.prompt(`Anchor image for anchorId ${evidence.anchors[index].anchorId}`),
          {type:'image_url',image_url:{url:`data:image/jpeg;base64,${data}`,detail:'high'}}));
        return parts;
      },conversationSchema,value=>{
        try { return parseConversation(value,evidence); }
        catch { throw new MetaResponseError('invalid_response','Invalid grounded conversation response'); }
      });
      return {...result.value,usage:result.usage};
    } catch (error) {
      if (error instanceof SearchDeadlineError) throw error;
      return {status:'error',scope:'conversation_between_tagged_people',turns:[],
        issue:error instanceof AiBudgetError?'budget':error instanceof MetaResponseError?error.issue:'temporary',
        explanation:'Conversation verification could not complete'};
    } finally {
      if (scratch) fs.rmSync(scratch,{recursive:true,force:true});
    }
  }
  private models(primary: string, fallback: string): string[] {
    const models = [...new Set([primary,...this.config.get<string>(fallback,'').split(',')].map(s => s.trim()).filter(Boolean))];
    if (models.length>4 || models.some(m => !/^[a-zA-Z0-9._:/-]{1,160}$/.test(m))) throw new Error('Invalid Meta model configuration');
    return models;
  }
  private mediaModels(kind: 'AUDIO'|'VIDEO'): string[] {
    if (this.backend==='baseten') return this.getModelCascade();
    const model = this.config.get<string>(`META_${kind}_MODEL`,'').trim();
    if (!model) throw new Error(`Configure META_${kind}_MODEL after checking modality support`);
    return this.models(model,`META_${kind}_FALLBACK_MODELS`);
  }
  private ready() { assertSearchActive(); if (!this.isConfigured()) throw new Error('Meta generation is not configured'); }
  private bytes(file: string, extensions: Record<string,string>): {data:string;mime:string} {
    assertSearchActive();
    const mime = extensions[path.extname(file).toLowerCase()];
    if (!mime) throw new Error('Unsupported Meta media encoding; convert explicitly before inference');
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size<=0 || stat.size>this.transport.boundedSetting('META_MAX_MEDIA_BYTES',32*1024*1024,128*1024*1024)) {
      throw new Error('Meta media exceeds the configured file bound or is empty');
    }
    const data = fs.readFileSync(file);
    if (data.length!==stat.size) throw new Error('Media changed while preparing Meta evidence');
    return {data:data.toString('base64'),mime};
  }
  private image(file: string): MetaPart {
    const {data,mime} = this.bytes(file,{'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'});
    return {type:'image_url',image_url:{url:`data:${mime};base64,${data}`,detail:'high'}};
  }
  private video(file: string): MetaPart {
    const {data,mime} = this.bytes(file,{'.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime'});
    return {type:'video_url',video_url:{url:`data:${mime};base64,${data}`}};
  }
  private prompt(text: string): MetaPart { return {type:'text',text}; }
  private async duration(file: string): Promise<number> {
    assertSearchActive();
    const metadata = await this.ffmpeg.probeMetadata(file);
    assertSearchActive();
    if (!Number.isFinite(metadata.duration) || metadata.duration<=0) throw new Error('Known positive media duration required');
    return metadata.duration;
  }
  private aggregate(stage: string, usages: ModelUsage[]): ModelUsage {
    const versions = [...new Set(usages.map(u=>u.modelVersion))];
    return {stage,provider:this.backend,model:[...new Set(usages.map(u=>u.model))].join(',') || this.getPrimaryModel(),
      modelVersion:versions.length===1 ? versions[0] : undefined,
      inputTokens:usages.reduce((n,u)=>n+u.inputTokens,0),outputTokens:usages.reduce((n,u)=>n+u.outputTokens,0),
      durationMs:usages.reduce((n,u)=>n+u.durationMs,0),estimatedUsd:usages.reduce((n,u)=>n+u.estimatedUsd,0),
      usageSource:usages.every(u=>u.usageSource==='reported')?'reported':'unknown'};
  }
  async understandQuery(rawQuery: string) {
    if (!this.isConfigured()) return rawMetaQuery(rawQuery);
    try {
      const result = await this.transport.complete('query_understanding',this.getModelCascade(),()=>[
        this.prompt(`Interpret this media search query, preserving every qualifier, exclusion and sequence.
Remove UI filler only; identify the core subject, optional targetEntity/aspect, useful aliases, and subQueries.
Do not invent private relationships or identities. isCompound is true only for multiple distinct subQueries.
Return JSON with all schema fields; nullable fields must be null when absent. Query data: ${JSON.stringify(rawQuery)}`),
      ],metaSchemas.query,value=>parseMetaQuery(value,rawQuery));
      return result.value;
    } catch (error) {
      if (error instanceof SearchDeadlineError) throw error;
      return rawMetaQuery(rawQuery);
    }
  }
  async decomposeQuery(rawQuery: string) {
    const result = await this.understandQuery(rawQuery);
    return {isCompound:result.isCompound,subQueries:result.subQueries};
  }
  async analyzeFrames(scenes: SceneBoundary[]) {
    this.ready();
    const frames = flattenSceneKeyframes(scenes.map(scene=>({...scene,keyframes:scene.keyframes?.length ? scene.keyframes :
      [{timestamp:scene.representativeTimestamp,path:scene.keyframePath}]})));
    if (frames.some(f=>!Number.isFinite(f.timestamp) || f.timestamp<0)) throw new Error('Invalid source-frame timestamps');
    const observations: FrameObservation[] = [], usages: ModelUsage[] = [];
    for (let i=0; i<frames.length; i+=4) {
      const batch = frames.slice(i,i+4);
      const result = await this.transport.complete('frame_analysis',this.getModelCascade(),()=>[
        this.prompt('Describe each supplied frame separately, preserving frameId and exact source timestamp. Include objects, scene, activities, a description, and every readable onScreenText element verbatim. Sparse frames do not prove continuous actions, dialogue or private identities. Return one observation per frame, JSON only.'),
        ...batch.flatMap((frame,frameId)=>[this.prompt(JSON.stringify({frameId,timestamp:frame.timestamp})),this.image(frame.path)]),
      ],metaSchemas.frames,(value,model)=>parseMetaFrames(value,batch,model));
      observations.push(...result.value.map(obs=>({...obs,provider:result.usage.provider,modelVersion:result.usage.modelVersion})));
      usages.push(result.usage);
    }
    return {observations,usage:this.aggregate('frame_analysis',usages)};
  }
  async analyzeVideo(videoPath: string) {
    this.ready();
    const models = this.mediaModels('VIDEO'), duration = await this.duration(videoPath);
    if (this.backend==='baseten' && duration>300) throw new Error('Baseten video duration exceeds 300 seconds; split explicitly before analysis');
    const result = await this.transport.complete('video_analysis',models,()=>[
      this.prompt(`${this.backend==='baseten'?'Analyze the visual video only. The provider ignores its audio track: dialogue must be empty in every segment. Do not infer speech, sounds or conversation from visuals.':'Analyze the actual video and its available audio.'} Use concise chronological descriptions without repeating unchanged clothing/scenery in every segment. Return a video_summary, key_themes and ordered non-overlapping segments covering 0 through ${duration} seconds without gaps. Each segment needs start_time, end_time, title, description, visual_objects, actions and dialogue (empty if unsupported). Do not infer unseen actions from objects alone or guess private identities. All times are relative to this supplied video. JSON only.`),
      this.video(videoPath),
    ],metaSchemas.video,value=>{
      const analysis=parseMetaVideo(value,duration);
      if (this.backend==='baseten' && analysis.segments.some(segment=>segment.dialogue?.trim())) {
        throw new MetaResponseError('invalid_response','Baseten visual-only video response invented dialogue');
      }
      return analysis;
    });
    return {analysis:result.value,usage:result.usage};
  }
  async transcribeAudio(audioPath: string) {
    this.ready();
    const models = this.mediaModels('AUDIO');
    const chunkSeconds = this.transport.boundedSetting('META_TRANSCRIPT_CHUNK_SECONDS',90,300);
    const scratchRoot = path.join(resolveFromRepo(this.config.get<string>('STORAGE_ROOT','./storage')),'scratch');
    fs.mkdirSync(scratchRoot,{recursive:true});
    const temp = fs.mkdtempSync(path.join(scratchRoot,'meta-audio-'));
    try {
      const chunks = await this.ffmpeg.splitAudioIntoChunks(audioPath,temp,chunkSeconds);
      if (!chunks.length) throw new Error('No audio chunks prepared');
      const transcript: import('../pipeline.types').TranscriptCue[] = [], usages: ModelUsage[] = [];
      let previousOffset = -1;
      for (const chunk of chunks) {
        assertSearchActive();
        if (!Number.isFinite(chunk.offset) || chunk.offset<0 || chunk.offset<=previousOffset) throw new Error('Invalid audio chunk offsets');
        previousOffset = chunk.offset;
        const duration = await this.duration(chunk.path);
        const result = await this.transport.complete('transcription',models,()=>{
          const {data,mime} = this.bytes(chunk.path,{'.mp3':'audio/mpeg','.wav':'audio/wav'});
          return [this.prompt(`Transcribe audible speech verbatim as ordered cues with start_time, end_time and text. Times are relative to this audio, between 0 and ${duration} seconds, never absolute source time. Silence yields an empty cues array. Do not guess inaudible words or add speaker identities. Return JSON only.`),
            this.backend==='baseten'?{type:'audio_url',audio_url:{url:`data:${mime};base64,${data}`}}:
              {type:'input_audio',input_audio:{data,format:mime==='audio/wav'?'wav':'mp3'}}];
        },metaSchemas.transcript,value=>parseMetaTranscript(value,duration,chunk.offset));
        transcript.push(...result.value); usages.push(result.usage);
      }
      return {transcript,usage:this.aggregate('transcription',usages)};
    } finally {
      // Only remove the exact temporary directory created directly under our scratch root.
      if (path.dirname(path.resolve(temp))===path.resolve(scratchRoot) && path.basename(temp).startsWith('meta-audio-')) {
        fs.rmSync(temp,{recursive:true,force:true});
      }
    }
  }
  private verificationFailure(error: unknown): VerificationResult {
    if (error instanceof SearchDeadlineError) throw error;
    return {status:'error',matched:false,confidence:0,
      issue:error instanceof AiBudgetError?'budget':error instanceof MetaResponseError?error.issue:'temporary',
      explanation:'Meta verification could not establish a conclusion'};
  }
  async verifyCandidate(frames: Array<{timestamp:number;path:string}>, query: string,
    transcriptSnippet?: string, detailMode=false, maxFrames=3): Promise<VerificationResult> {
    if (!this.isConfigured() || !frames.length) return noEvidence('Model not configured or source frames missing');
    const selected = frames.slice(0,Math.max(1,Math.min(12,Number.isSafeInteger(maxFrames)?maxFrames:3)));
    if (selected.some(f=>!Number.isFinite(f.timestamp) || f.timestamp<0 || !f.path || !fs.existsSync(f.path))) {
      return noEvidence('Some requested source frames are unavailable');
    }
    try {
      const result = await this.transport.complete(detailMode?'stage2_deep_detail':'stage2_verification',this.getModelCascade(),()=>[
        this.prompt(`Check the query against the attached sparse source frames and transcript context. Require every defining detail. ${detailMode?'Inspect small and background details carefully.':''}
Sparse frames cannot establish unseen actions, conversation participants, private identities or continuity. Do not treat missing samples as proof of absence. If unsure, outcome must be uncertain or insufficient_evidence, not a negative finding.
For matched, cite exactly one attached source timestamp; otherwise matchedTimestamp must be null. Return outcome, confidence (0..1), matchedTimestamp and concise evidence explanation as JSON.
Query data: ${JSON.stringify(query)}. Transcript context data (not guaranteed synchronized to each frame): ${JSON.stringify(transcriptSnippet||'')}`),
        ...selected.flatMap(frame=>[this.prompt(`Source timestamp: ${JSON.stringify(frame.timestamp)}`),this.image(frame.path)]),
      ],metaSchemas.verification,value=>parseMetaVerification(value,t=>selected.some(f=>Math.abs(f.timestamp-t)<=0.000001)));
      return {...result.value,usage:result.usage};
    } catch (error) { return this.verificationFailure(error); }
  }
  async verifyClip(clipPath: string, query: string, start: number, end: number,
    transcriptSnippet?: string): Promise<VerificationResult> {
    if (!this.isConfigured() || !fs.existsSync(clipPath) || !Number.isFinite(start) || !Number.isFinite(end) || start<0 || end<=start) {
      return noEvidence('Known source clip and timestamp bounds required');
    }
    try {
      const models = this.mediaModels('VIDEO'), duration = await this.duration(clipPath);
      if (Math.abs(duration-(end-start))>0.5) return noEvidence('Clip duration does not agree with its source range');
      const bound = Math.min(duration,end-start);
      const result = await this.transport.complete('sequence_verification',models,()=>[
        this.prompt(`Verify this query using the actual moving video and available audio, checking every requested action, exclusion, relationship and temporal order. Co-occurring objects do not establish an interaction or sequence. Private identities must not be guessed.
Return JSON outcome (matched, not_matched, uncertain or insufficient_evidence), confidence 0..1, explanation and matchedTimestamp.
For matched, cite a timestamp relative to this clip in [0,${bound}]; otherwise use null. Ambiguity must remain uncertain, never confirmed.
Query data: ${JSON.stringify(query)}. Transcript context data: ${JSON.stringify(transcriptSnippet||'')}`),
        this.video(clipPath),
      ],metaSchemas.verification,value=>parseMetaVerification(value,t=>t>=0 && t<=bound,start));
      return {...result.value,usage:result.usage};
    } catch (error) { return this.verificationFailure(error); }
  }
}
