import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { GeminiIntelligenceService } from './gemini-intelligence.service';
import { LocalEmbeddingService } from './local-embedding.service';
import { aggregateFrameObservations, unique } from './scene-sampling';
import {
  ANALYSIS_VERSION,
  FrameObservation,
  GeminiVideoAnalysis,
  ModelUsage,
  PipelineArtifacts,
  PipelineCost,
  SceneBoundary,
  StageTiming,
  TranscriptCue,
  UnifiedSegment,
  VideoMetadata,
} from './pipeline.types';

@Injectable()
export class IntelligenceMergerService {
  private readonly logger = new Logger(IntelligenceMergerService.name);

  constructor(
    private readonly geminiService: GeminiIntelligenceService,
    private readonly localEmbeddingService: LocalEmbeddingService,
    private readonly configService: ConfigService,
  ) {}

  async mergeAndPersist(input: {
    assetId: string;
    originalFilename: string;
    checksum: string;
    originalPath: string;
    proxyPath: string;
    thumbnailPath: string;
    scratchDir: string;
    metadata: VideoMetadata;
    scenes: SceneBoundary[];
    visual: FrameObservation[];
    transcript: TranscriptCue[];
    gemini: GeminiVideoAnalysis;
    usages: ModelUsage[];
    timings: StageTiming[];
    indexStartedAt: number;
  }): Promise<PipelineArtifacts> {
    const {
      assetId,
      scratchDir,
      scenes,
      visual,
      transcript,
      gemini,
      metadata,
    } = input;

    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    const segments: UnifiedSegment[] = [];
    const embeddingUsages: ModelUsage[] = [];
    const modelLabel = this.geminiService.getPrimaryModel();

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const start = scene.startTime;
      const end = scene.endTime;

      const frameObs = visual.filter(
        (obs) => obs.timestamp >= start - 0.05 && obs.timestamp <= end + 0.05,
      );
      const nearestFrame =
        frameObs[0] ||
        visual.reduce<FrameObservation | undefined>((best, obs) => {
          if (!best) return obs;
          return Math.abs(obs.timestamp - scene.representativeTimestamp) <
            Math.abs(best.timestamp - scene.representativeTimestamp)
            ? obs
            : best;
        }, undefined);

      const aggregated = aggregateFrameObservations(
        frameObs.map((obs) => ({
          objects: obs.objects || [],
          activity: obs.activity || [],
          onScreenText: obs.onScreenText || [],
        })),
      );

      const overlappingTranscript = transcript
        .filter((cue) => cue.start_time < end && cue.end_time > start && (cue.text || '').trim())
        .map((cue) => cue.text.trim())
        .join(' ');

      const overlappingGemini = (gemini.segments || []).filter(
        (seg) => seg.start_time < end && seg.end_time > start,
      );

      const objects = unique([
        ...aggregated.objects,
        ...overlappingGemini.flatMap((g) => g.visual_objects || []),
      ]);
      const actions = unique([
        ...aggregated.activity,
        ...overlappingGemini.flatMap((g) => g.actions || []),
      ]);
      const onScreenText = unique([
        ...aggregated.onScreenText,
        ...overlappingGemini
          .flatMap((g) => [g.title || ''])
          .filter((t) => /overlay|caption|text/i.test(t)),
      ]);

      const title =
        overlappingGemini[0]?.title ||
        nearestFrame?.scene ||
        `Scene ${i + 1}`;
      const description =
        [nearestFrame?.description, overlappingGemini[0]?.description]
          .filter(Boolean)
          .join(' ') || `Scene from ${start.toFixed(1)}s to ${end.toFixed(1)}s`;

      const sources: string[] = [];
      if (nearestFrame) sources.push('visual');
      if (overlappingTranscript) sources.push('transcript');
      if (overlappingGemini.length) sources.push('gemini');

      const embeddingText = [
        title,
        description,
        objects.join(', '),
        actions.join(', '),
        overlappingTranscript,
        nearestFrame?.onScreenText?.join(' '),
      ]
        .filter(Boolean)
        .join('. ');

      this.logger.log(`Embedding segment ${i + 1} (${start}s-${end}s)`);
      const preferredProvider = this.configService.get<string>('EMBEDDING_PROVIDER', 'gemini');
      let embedded: { values: number[]; usage: ModelUsage };
      if (preferredProvider === 'local' && this.localEmbeddingService.isAvailable()) {
        try {
          embedded = await this.localEmbeddingService.generateEmbedding(embeddingText);
        } catch (localErr) {
          this.logger.warn(`Local embedding failed, falling back to Gemini: ${localErr}`);
          embedded = await this.geminiService.generateEmbedding(embeddingText);
        }
      } else {
        embedded = await this.geminiService.generateEmbedding(embeddingText);
      }
      embeddingUsages.push(embedded.usage);

      segments.push({
        id: `${assetId}_seg_${String(i + 1).padStart(3, '0')}`,
        assetId,
        startTime: start,
        endTime: end,
        title,
        description,
        visualObjects: objects,
        actions,
        transcriptText: overlappingTranscript,
        onScreenText,
        keyframePath: scene.keyframePath,
        keyframePaths: scene.keyframes,
        embedding: embedded.values,
        embeddingDim: embedded.values.length,
        sources,
        analysisVersion: ANALYSIS_VERSION,
        provider: embedded.usage.provider || 'local-onnx',
        model: embedded.usage.model || (nearestFrame?.model || (overlappingGemini.length ? modelLabel : 'hybrid')),
      });
    }

    const allUsages = [...input.usages, ...embeddingUsages];
    const indexDurationMs = Date.now() - input.indexStartedAt;
    const sourceMinutes = Math.max(metadata.duration / 60, 1 / 60);
    const estimatedUsd = Number(
      allUsages.reduce((sum, u) => sum + (u.estimatedUsd || 0), 0).toFixed(6),
    );

    const cost: PipelineCost = {
      stages: allUsages,
      timings: input.timings,
      framesAnalyzed: visual.length,
      sceneCount: scenes.length,
      sourceDurationSec: metadata.duration,
      indexDurationMs,
      estimatedUsd,
      costPerSourceMinuteUsd: Number((estimatedUsd / sourceMinutes).toFixed(6)),
    };

    fs.writeFileSync(path.join(scratchDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    fs.writeFileSync(path.join(scratchDir, 'scenes.json'), JSON.stringify(scenes, null, 2));
    fs.writeFileSync(path.join(scratchDir, 'visual.json'), JSON.stringify(visual, null, 2));
    fs.writeFileSync(path.join(scratchDir, 'transcript.json'), JSON.stringify(transcript, null, 2));
    fs.writeFileSync(path.join(scratchDir, 'gemini.json'), JSON.stringify(gemini, null, 2));
    fs.writeFileSync(
      path.join(scratchDir, 'segments.json'),
      JSON.stringify(
        segments.map((s) => ({ ...s, embedding: undefined })),
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(scratchDir, 'embeddings.json'),
      JSON.stringify(
        segments.map((s) => ({ id: s.id, embedding: s.embedding })),
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(scratchDir, 'cost.json'), JSON.stringify(cost, null, 2));

    const artifacts: PipelineArtifacts = {
      assetId,
      sourceType: 'upload',
      originalFilename: input.originalFilename,
      checksum: input.checksum,
      status: 'indexed',
      stage: 'completed',
      progress: 100,
      originalDeleted: false,
      metadata,
      scenes,
      visual,
      transcript,
      gemini,
      segments,
      proxyPath: input.proxyPath,
      thumbnailPath: input.thumbnailPath,
      originalPath: input.originalPath,
      cost,
      indexedAt: new Date().toISOString(),
      analysisVersion: ANALYSIS_VERSION,
    };

    fs.writeFileSync(path.join(scratchDir, 'pipeline_summary.json'), JSON.stringify(artifacts, null, 2));
    this.logger.log(`Persisted hybrid intelligence for ${assetId} to ${scratchDir}`);
    return artifacts;
  }
}
