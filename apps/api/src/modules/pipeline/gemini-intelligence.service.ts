import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { guessMime } from '../../common/repo-paths';
import { FfmpegPipelineService } from './ffmpeg-pipeline.service';
import {
  FrameObservation,
  GeminiVideoAnalysis,
  ModelUsage,
  SceneBoundary,
  TranscriptCue,
} from './pipeline.types';
import { QueryDecomposition } from '../media/media.types';

interface GenerateResult {
  text: string;
  model: string;
  modelVersion?: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export class AsyncSemaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.maxConcurrency) {
      this.active++;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.active--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get queueLength(): number {
    return this.queue.length;
  }
}

@Injectable()
export class GeminiIntelligenceService {
  private readonly logger = new Logger(GeminiIntelligenceService.name);
  private aiClients: GoogleGenAI[] = [];
  private currentKeyIndex = 0;
  private readonly semaphore: AsyncSemaphore;

  constructor(
    private readonly configService: ConfigService,
    private readonly ffmpegPipeline: FfmpegPipelineService,
  ) {
    const maxConcurrency = Number(this.configService.get('GEMINI_MAX_CONCURRENCY', 2));
    this.semaphore = new AsyncSemaphore(Math.max(1, maxConcurrency));

    const keysStr =
      this.configService.get<string>('GEMINI_API_KEYS') ||
      this.configService.get<string>('GEMINI_API_KEY') ||
      '';
    const keys = keysStr
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    for (const key of keys) {
      this.aiClients.push(new GoogleGenAI({ apiKey: key }));
    }

    if (this.aiClients.length > 0) {
      this.logger.log(
        `Gemini GenAI SDK initialized (${this.aiClients.length} API key(s) in pool; max concurrent requests: ${maxConcurrency}; models: ${this.getModelCascade().join(' → ')}).`,
      );
    } else {
      this.logger.warn('No GEMINI_API_KEY or GEMINI_API_KEYS found in environment.');
    }
  }

  isConfigured(): boolean {
    return this.aiClients.length > 0;
  }

  private getClient(offset = 0): GoogleGenAI {
    if (this.aiClients.length === 0) {
      throw new Error('Gemini client not configured. Set GEMINI_API_KEY or GEMINI_API_KEYS.');
    }
    const idx = (this.currentKeyIndex + offset) % this.aiClients.length;
    return this.aiClients[idx];
  }

  private rotateKey(): void {
    if (this.aiClients.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.aiClients.length;
      this.logger.log(
        `Rotated to Gemini API key #${this.currentKeyIndex + 1}/${this.aiClients.length}`,
      );
    }
  }

  getPrimaryModel(): string {
    return this.configService.get<string>('GEMINI_MODEL', 'gemini-3.5-flash-lite');
  }

  getModelCascade(): string[] {
    const primary = this.getPrimaryModel();
    const extra = this.configService.get<string>(
      'GEMINI_FALLBACK_MODELS',
      'gemini-3.1-flash-lite,gemini-2.5-flash',
    );
    const legacy = this.configService.get<string>('GEMINI_FALLBACK_MODEL', '');
    const names = [primary, ...extra.split(','), legacy]
      .map((name) => name.trim())
      .filter(Boolean);
    return [...new Set(names)];
  }

  getEmbeddingModel(): string {
    return this.configService.get<string>('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001');
  }

  estimateUsd(inputTokens: number, outputTokens: number, embedding = false): number {
    const inRate = Number(
      this.configService.get(
        embedding ? 'GEMINI_EMBEDDING_USD_PER_MILLION' : 'GEMINI_INPUT_USD_PER_MILLION',
        embedding ? 0.15 : 0.15,
      ),
    );
    const outRate = Number(this.configService.get('GEMINI_OUTPUT_USD_PER_MILLION', 0.6));
    return Number(
      ((inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate).toFixed(6),
    );
  }

  usageFromGenerate(stage: string, result: GenerateResult): ModelUsage {
    return {
      stage,
      provider: 'google',
      model: result.model,
      modelVersion: result.modelVersion,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedUsd: this.estimateUsd(result.inputTokens, result.outputTokens),
      durationMs: result.durationMs,
    };
  }

  async analyzeVideo(
    videoPath: string,
  ): Promise<{ analysis: GeminiVideoAnalysis; usage: ModelUsage }> {
    if (!this.isConfigured()) throw new Error('Gemini client not configured. Set GEMINI_API_KEY or GEMINI_API_KEYS.');

    const prompt = `Analyze this video with high temporal precision.
Return JSON with this schema:
{
  "video_summary": "1-2 sentence summary",
  "key_themes": ["theme"],
  "segments": [
    {
      "start_time": 0.0,
      "end_time": 5.0,
      "title": "short title",
      "description": "what is happening visually and contextually",
      "visual_objects": ["object"],
      "actions": ["action"],
      "dialogue": "spoken words in this window if any"
    }
  ]
}
Break the video into non-overlapping temporal segments covering the full duration.
Do not transcribe the entire video word-for-word; note dialogue only when it helps describe the moment.
Timestamps are seconds. Return JSON only.`;

    const { text, usage } = await this.withUploadedFile(
      videoPath,
      'gemini_video',
      prompt,
      guessMime(videoPath) || 'video/mp4',
    );

    const parsed = this.parseJson<GeminiVideoAnalysis>(text);
    return {
      analysis: {
        video_summary: parsed.video_summary || '',
        key_themes: parsed.key_themes || [],
        segments: parsed.segments || [],
      },
      usage,
    };
  }

  async transcribeAudio(
    audioPath: string,
  ): Promise<{ transcript: TranscriptCue[]; usage: ModelUsage }> {
    if (!this.isConfigured()) throw new Error('Gemini client not configured. Set GEMINI_API_KEY or GEMINI_API_KEYS.');
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file missing; cannot transcribe: ${audioPath}`);
    }

    const chunkSeconds = Number(this.configService.get('TRANSCRIPT_CHUNK_SECONDS', 150));
    const chunkDir = path.join(path.dirname(audioPath), 'audio-chunks');
    const chunks = await this.ffmpegPipeline.splitAudioIntoChunks(
      audioPath,
      chunkDir,
      chunkSeconds,
    );

    const allCues: TranscriptCue[] = [];
    const usages: ModelUsage[] = [];
    let failedChunks = 0;

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        this.logger.log(
          `Transcribing chunk ${i + 1}/${chunks.length} (offset ${chunk.offset}s)`,
        );
        try {
          const result = await this.transcribeOneChunk(chunk.path, chunk.offset, chunkSeconds);
          allCues.push(...result.transcript);
          usages.push(result.usage);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Chunk ${i + 1} failed (${message}); retrying once after 5s backoff`);
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const result = await this.transcribeOneChunk(chunk.path, chunk.offset, chunkSeconds);
            allCues.push(...result.transcript);
            usages.push(result.usage);
          } catch (retryErr) {
            failedChunks += 1;
            const retryMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
            this.logger.error(`Chunk ${i + 1} failed permanently: ${retryMessage}`);
          }
        }
      }
    } finally {
      fs.rmSync(chunkDir, { recursive: true, force: true });
    }

    if (allCues.length === 0) {
      throw new Error(
        `Transcription produced no spoken text (${chunks.length} chunks, ${failedChunks} failed).`,
      );
    }

    if (failedChunks > 0 && failedChunks / chunks.length > 0.4) {
      throw new Error(
        `Transcription coverage too low: ${failedChunks}/${chunks.length} audio chunks failed.`,
      );
    }

    allCues.sort((a, b) => a.start_time - b.start_time);
    this.logger.log(
      `Transcription complete: ${allCues.length} cues from ${chunks.length - failedChunks}/${chunks.length} chunks`,
    );

    return { transcript: allCues, usage: this.mergeUsages(usages) };
  }

  private async transcribeOneChunk(
    chunkPath: string,
    offset: number,
    chunkSeconds: number,
  ): Promise<{ transcript: TranscriptCue[]; usage: ModelUsage }> {
    const prompt = `Transcribe ALL spoken words in this audio clip.
Timestamps are relative to the START of this clip (0.0 is the beginning of this file).
Return JSON only:
{"cues":[{"start_time":0.0,"end_time":2.4,"text":"exact spoken words"}]}
Rules:
- Every cue MUST include a non-empty "text" field with the actual words. Never omit text.
- Preserve medical and scientific terms exactly as spoken (e.g. Frank-Starling, pharmacokinetics).
- Split on natural phrases of about 2-12 seconds.
- If there is no speech, return {"cues":[]}.`;

    const { text, usage } = await this.generateWithInlineAudio(
      'transcription',
      chunkPath,
      prompt,
    );
    const parsed = this.parseJson<unknown>(text);
    const cues = this.normalizeCues(parsed, offset, chunkSeconds);
    return { transcript: cues, usage };
  }

  private async generateWithInlineAudio(
    stage: string,
    audioPath: string,
    prompt: string,
  ): Promise<{ text: string; usage: ModelUsage }> {
    const audioBuffer = fs.readFileSync(audioPath);
    const base64Data = audioBuffer.toString('base64');
    const mimeType = guessMime(audioPath) || 'audio/mp3';

    const result = await this.generateContent(stage, [
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
      prompt,
    ]);
    return { text: result.text, usage: this.usageFromGenerate(stage, result) };
  }

  private normalizeCues(raw: unknown, offset: number, chunkSeconds: number): TranscriptCue[] {
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(record.cues)
        ? record.cues
        : Array.isArray(record.transcript)
          ? record.transcript
          : Array.isArray(record.segments)
            ? record.segments
            : [];

    const cues: TranscriptCue[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const text = String(
        row.text ?? row.transcript ?? row.content ?? row.dialogue ?? row.words ?? '',
      ).trim();
      if (!text) continue;
      let start = Number(row.start_time ?? row.start ?? row.startTime ?? 0);
      let end = Number(row.end_time ?? row.end ?? row.endTime ?? start);
      if (!Number.isFinite(start)) start = 0;
      if (!Number.isFinite(end) || end < start) end = start + 2;
      if (start <= chunkSeconds + 2) {
        start += offset;
        end += offset;
      }
      cues.push({
        start_time: Number(start.toFixed(2)),
        end_time: Number(end.toFixed(2)),
        text,
      });
    }
    return cues;
  }

  private mergeUsages(usages: ModelUsage[]): ModelUsage {
    if (usages.length === 0) return this.emptyUsage('transcription');
    return {
      stage: 'transcription',
      provider: usages[0].provider,
      model: usages[0].model,
      modelVersion: usages[0].modelVersion,
      inputTokens: usages.reduce((n, u) => n + u.inputTokens, 0),
      outputTokens: usages.reduce((n, u) => n + u.outputTokens, 0),
      estimatedUsd: Number(usages.reduce((n, u) => n + u.estimatedUsd, 0).toFixed(6)),
      durationMs: usages.reduce((n, u) => n + u.durationMs, 0),
    };
  }

  async analyzeFrames(
    scenes: SceneBoundary[],
  ): Promise<{ observations: FrameObservation[]; usage: ModelUsage }> {
    if (!this.isConfigured()) throw new Error('Gemini client not configured. Set GEMINI_API_KEY or GEMINI_API_KEYS.');

    const frames = scenes.filter((s) => s.keyframePath && fs.existsSync(s.keyframePath));
    if (frames.length === 0) {
      return { observations: [], usage: this.emptyUsage('frame_analysis') };
    }

    const BATCH_SIZE = 16;
    const allObservations: FrameObservation[] = [];
    const usages: ModelUsage[] = [];

    for (let b = 0; b < frames.length; b += BATCH_SIZE) {
      const batchFrames = frames.slice(b, b + BATCH_SIZE);
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        {
          text: `You are given representative frames from a video. Each image is labeled with its timestamp in seconds.
Return JSON:
{
  "observations": [
    {
      "timestamp": 1.5,
      "objects": ["person", "car"],
      "scene": "short scene type",
      "activity": ["sitting"],
      "on_screen_text": ["any readable text"],
      "description": "one sentence describing the frame"
    }
  ]
}
Use the provided timestamps. JSON only.`,
        },
      ];

      for (const frame of batchFrames) {
        const data = fs.readFileSync(frame.keyframePath).toString('base64');
        parts.push({ text: `Frame at ${frame.representativeTimestamp.toFixed(2)}s:` });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
      }

      const result = await this.generateContent('frame_analysis', [{ role: 'user', parts }]);
      const parsed = this.parseJson<{
        observations?: Array<{
          timestamp: number;
          objects?: string[];
          scene?: string;
          activity?: string[];
          on_screen_text?: string[];
          description?: string;
        }>;
      }>(result.text);

      const batchObs: FrameObservation[] = (parsed.observations || []).map((obs) => ({
        timestamp: Number(obs.timestamp),
        objects: obs.objects || [],
        scene: obs.scene || '',
        activity: obs.activity || [],
        onScreenText: obs.on_screen_text || [],
        description: obs.description || '',
        provider: 'google',
        model: result.model,
        modelVersion: result.modelVersion,
      }));

      allObservations.push(...batchObs);
      usages.push(this.usageFromGenerate('frame_analysis', result));
    }

    allObservations.sort((a, b) => a.timestamp - b.timestamp);
    this.logger.log(
      `Frame analysis produced ${allObservations.length} observations from ${frames.length} frames across ${Math.ceil(frames.length / BATCH_SIZE)} batch(es)`,
    );
    return { observations: allObservations, usage: this.mergeUsages(usages) };
  }

  async generateEmbedding(
    text: string,
  ): Promise<{ values: number[]; usage: ModelUsage }> {
    if (!this.isConfigured()) throw new Error('Gemini client not configured. Set GEMINI_API_KEY or GEMINI_API_KEYS.');
    const release = await this.semaphore.acquire();
    const model = this.getEmbeddingModel();
    const t0 = Date.now();
    try {
      const client = this.getClient();
      const res = await client.models.embedContent({
        model,
        contents: text,
      });
      const values = res.embeddings?.[0]?.values || [];
      const inputTokens = Math.ceil(text.length / 4);
      return {
        values,
        usage: {
          stage: 'embedding',
          provider: 'google',
          model,
          inputTokens,
          outputTokens: 0,
          estimatedUsd: this.estimateUsd(inputTokens, 0, true),
          durationMs: Date.now() - t0,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Embedding failed: ${message}`);
      return { values: [], usage: this.emptyUsage('embedding') };
    } finally {
      release();
    }
  }

  async decomposeQuery(rawQuery: string): Promise<QueryDecomposition> {
    if (!this.isConfigured()) {
      return {
        isCompound: false,
        subQueries: [{ topic: rawQuery, searchPhrase: rawQuery }],
      };
    }

    const prompt = `You are an AI query understanding engine for video search across a user's entire video library.
Analyze the user's search query and determine if it represents a compound search asking for multiple distinct topics or entities (e.g. "find X and Y in my gallery", "either X or Y", "videos of X as well as Y", "X, Y in my gallery").

Rules:
1. If the query asks for MULTIPLE distinct topics or entities that could exist in separate videos (e.g. "denovo synthesis and albuterol", "cars or bikes racing in the desert", "machine learning and cardiac surgery"), set "isCompound": true.
2. When "isCompound" is true:
   - Extract each distinct sub-query into "subQueries".
   - If there is shared context (e.g. "cars or bikes racing in the desert"), distribute the shared context to both ("cars racing in the desert", "bikes racing in the desert").
   - For each sub-query, provide "topic" (concise topic name) and "searchPhrase" (optimized natural search phrase).
3. If the query is a SINGLE cohesive concept, topic, or a single continuous action (e.g. "doctor examining a patient and prescribing medicine", "expansion plans", "respiratory pharmacology", "neuromuscular junction diagram"), set "isCompound": false with 1 item in "subQueries".

Respond with valid JSON:
{
  "isCompound": boolean,
  "subQueries": [
    {
      "topic": string,
      "searchPhrase": string
    }
  ]
}

User query: "${rawQuery.replace(/"/g, '\\"')}"`;

    try {
      const result = await this.generateContent('query_decomposition', [prompt]);
      const parsed = JSON.parse(result.text || '{}');
      if (Array.isArray(parsed.subQueries) && parsed.subQueries.length > 0) {
        const isCompound = Boolean(parsed.isCompound && parsed.subQueries.length > 1);
        return {
          isCompound,
          subQueries: parsed.subQueries.map((sq: any) => ({
            topic: String(sq.topic || sq.searchPhrase || rawQuery).trim(),
            searchPhrase: String(sq.searchPhrase || sq.topic || rawQuery).trim(),
          })),
        };
      }
    } catch (err) {
      this.logger.warn(`Query decomposition fallback to single query: ${err}`);
    }

    return {
      isCompound: false,
      subQueries: [{ topic: rawQuery, searchPhrase: rawQuery }],
    };
  }

  private emptyUsage(stage: string): ModelUsage {
    return {
      stage,
      provider: 'google',
      model: this.getPrimaryModel(),
      inputTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
      durationMs: 0,
    };
  }

  private async withUploadedFile(
    filePath: string,
    stage: string,
    prompt: string,
    mimeType: string,
  ): Promise<{ text: string; usage: ModelUsage }> {
    if (!this.isConfigured()) throw new Error('Gemini client not configured.');

    const client = this.getClient();
    const releaseUpload = await this.semaphore.acquire();
    let uploaded: any;
    try {
      uploaded = await client.files.upload({
        file: filePath,
        config: { mimeType },
      });
    } finally {
      releaseUpload();
    }

    try {
      let file = uploaded;
      const deadline = Date.now() + 240000;
      while (file.state === 'PROCESSING' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        file = await client.files.get({ name: uploaded.name as string });
      }
      if (file.state !== 'ACTIVE') {
        throw new Error(`Gemini file processing failed (${file.state})`);
      }

      const result = await this.generateContent(stage, [
        {
          fileData: {
            fileUri: file.uri,
            mimeType: file.mimeType || mimeType,
          },
        },
        prompt,
      ]);
      return { text: result.text, usage: this.usageFromGenerate(stage, result) };
    } finally {
      if (uploaded?.name) {
        await client.files.delete({ name: uploaded.name }).catch(() => undefined);
      }
    }
  }

  private async generateContent(
    stage: string,
    contents: unknown,
  ): Promise<GenerateResult> {
    if (!this.isConfigured()) throw new Error('Gemini client not configured.');
    const release = await this.semaphore.acquire();
    const models = this.getModelCascade();
    this.logger.log(`Model cascade for ${stage}: ${models.join(' → ')}`);

    let lastError: unknown;
    try {
      for (const model of models) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const t0 = Date.now();
          const client = this.getClient();
          try {
            this.logger.log(
              `Calling ${model} for ${stage} (attempt ${attempt}, key #${this.currentKeyIndex + 1})`,
            );
            const response = await client.models.generateContent({
              model,
              contents: contents as never,
              config: { responseMimeType: 'application/json' },
            });
            return {
              text: response.text || '{}',
              model,
              modelVersion: response.modelVersion,
              inputTokens: response.usageMetadata?.promptTokenCount || 0,
              outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
              durationMs: Date.now() - t0,
            };
          } catch (err) {
            lastError = err;
            const message = err instanceof Error ? err.message : String(err);
            const quotaExhausted =
              message.includes('RESOURCE_EXHAUSTED') ||
              message.includes('exceeded your current quota') ||
              message.includes('Quota exceeded') ||
              message.includes('quotaId');
            const modelUnavailable =
              message.includes('"code":404') ||
              message.includes('NOT_FOUND') ||
              message.includes('no longer available') ||
              message.includes('is not found');
            const retryable =
              quotaExhausted ||
              modelUnavailable ||
              message.includes('503') ||
              message.includes('UNAVAILABLE') ||
              message.includes('demand') ||
              message.includes('429');
            this.logger.warn(`${model} failed for ${stage} (attempt ${attempt}): ${message}`);
            if (quotaExhausted) {
              this.rotateKey();
              if (this.aiClients.length > 1) {
                this.logger.log(`Rotating to alternate key in pool and retrying immediately...`);
                continue;
              }
              this.logger.warn(
                `Quota / Rate limit reached on ${model} for ${stage}. Sleeping 10s for quota refresh (attempt ${attempt}/3)...`,
              );
              await new Promise((r) => setTimeout(r, 10000));
              if (attempt < 3) continue;
            }
            if (modelUnavailable) {
              this.logger.warn(`Model ${model} unavailable (404/not found); skipping to next model`);
              break;
            }
            if (retryable && attempt < 3) {
              await new Promise((r) => setTimeout(r, 2000 * attempt));
              continue;
            }
            if (retryable && model !== models[models.length - 1]) {
              break;
            }
            throw err;
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    } finally {
      release();
    }
  }

  private parseJson<T>(text: string): T {
    const trimmed = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      }
      throw new Error(`Invalid JSON from Gemini: ${trimmed.slice(0, 240)}`);
    }
  }
}
