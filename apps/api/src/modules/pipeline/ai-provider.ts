import { QueryDecomposition, UnderstoodQuery } from '../media/media.types';
import { FrameObservation, ModelUsage, SceneBoundary, TranscriptCue, VideoAnalysis } from './pipeline.types';
import { ConversationEvidence, ConversationVerification } from './conversation-evidence';
import { StudioInput,StudioResult } from './studio-document';
import { SpaceAiInput,SpaceAiOutput } from './space-conversation';

export interface VerificationResult {
  issue?: 'budget' | 'temporary' | 'invalid_response';
  status: 'evaluated' | 'insufficient_evidence' | 'error';
  matched: boolean;
  confidence: number;
  explanation: string;
  matchedTimestamp?: number;
  usage?: ModelUsage;
}

/** Implementations must meter each paid attempt and preserve evidence timestamps. */
export interface AiIntelligenceProvider {
  studioDocument(input:StudioInput):Promise<StudioResult>;
  spaceConversation(input:SpaceAiInput):Promise<SpaceAiOutput>;
  isConfigured(): boolean;
  getPrimaryModel(): string;
  getModelCascade(): string[];
  getEmbeddingModel(): string;
  verifyConversation(evidence: ConversationEvidence): Promise<ConversationVerification>;
  analyzeVideo(videoPath: string): Promise<{ analysis: VideoAnalysis; usage: ModelUsage }>;
  transcribeAudio(audioPath: string): Promise<{ transcript: TranscriptCue[]; usage: ModelUsage }>;
  analyzeFrames(scenes: SceneBoundary[]): Promise<{ observations: FrameObservation[]; usage: ModelUsage }>;
  generateEmbedding(text: string): Promise<{ values: number[]; usage: ModelUsage }>;
  understandQuery(rawQuery: string): Promise<UnderstoodQuery>;
  decomposeQuery(rawQuery: string): Promise<QueryDecomposition>;
  verifyCandidate(frames: { timestamp: number; path: string }[], query: string,
    transcriptSnippet?: string, detailMode?: boolean, maxFrames?: number): Promise<VerificationResult>;
  verifyClip(clipPath: string, query: string, start: number, end: number,
    transcriptSnippet?: string): Promise<VerificationResult>;
}
