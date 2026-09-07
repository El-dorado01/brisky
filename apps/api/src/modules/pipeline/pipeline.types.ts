export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
  fps: number;
  bitrate: number;
  hasAudio: boolean;
}

export interface SceneBoundary {
  sceneId: number;
  startTime: number;
  endTime: number;
  representativeTimestamp: number;
  keyframePath: string;
}

export interface FrameObservation {
  timestamp: number;
  objects: string[];
  scene: string;
  activity: string[];
  onScreenText: string[];
  description: string;
  provider: string;
  model: string;
  modelVersion?: string;
}

export interface TranscriptCue {
  start_time: number;
  end_time: number;
  text: string;
}

export interface GeminiTemporalSegment {
  start_time: number;
  end_time: number;
  title: string;
  description: string;
  visual_objects: string[];
  actions: string[];
  dialogue?: string;
}

export interface GeminiVideoAnalysis {
  video_summary: string;
  key_themes: string[];
  segments: GeminiTemporalSegment[];
}

export interface ModelUsage {
  stage: string;
  provider: string;
  model: string;
  modelVersion?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  durationMs: number;
}

export interface StageTiming {
  stage: string;
  durationMs: number;
}

export interface PipelineCost {
  stages: ModelUsage[];
  timings: StageTiming[];
  framesAnalyzed: number;
  sceneCount: number;
  sourceDurationSec: number;
  indexDurationMs: number;
  estimatedUsd: number;
  costPerSourceMinuteUsd: number;
}

export interface UnifiedSegment {
  id: string;
  assetId: string;
  startTime: number;
  endTime: number;
  title: string;
  description: string;
  visualObjects: string[];
  actions: string[];
  transcriptText: string;
  onScreenText: string[];
  keyframePath?: string;
  embedding?: number[];
  embeddingDim?: number;
  sources: string[];
  analysisVersion: number;
  provider: string;
  model: string;
}

export interface PipelineArtifacts {
  assetId: string;
  sourceType: 'upload';
  originalFilename: string;
  checksum: string;
  status: 'queued' | 'processing' | 'indexed' | 'failed';
  stage: string;
  progress: number;
  error?: string;
  originalDeleted: boolean;
  metadata: VideoMetadata;
  scenes: SceneBoundary[];
  visual: FrameObservation[];
  transcript: TranscriptCue[];
  gemini: GeminiVideoAnalysis;
  segments: UnifiedSegment[];
  proxyPath: string;
  thumbnailPath: string;
  originalPath: string;
  cost: PipelineCost;
  indexedAt: string;
  analysisVersion: number;
}

export const ANALYSIS_VERSION = 2;
