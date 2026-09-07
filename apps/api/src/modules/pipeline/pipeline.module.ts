import { Module } from '@nestjs/common';
import { FfmpegPipelineService } from './ffmpeg-pipeline.service';
import { GeminiIntelligenceService } from './gemini-intelligence.service';
import { IntelligenceMergerService } from './intelligence-merger.service';
import { WhisperTranscriptionService } from './whisper-transcription.service';
import { LocalEmbeddingService } from './local-embedding.service';

@Module({
  providers: [
    FfmpegPipelineService,
    GeminiIntelligenceService,
    IntelligenceMergerService,
    WhisperTranscriptionService,
    LocalEmbeddingService,
  ],
  exports: [
    FfmpegPipelineService,
    GeminiIntelligenceService,
    IntelligenceMergerService,
    WhisperTranscriptionService,
    LocalEmbeddingService,
  ],
})
export class PipelineModule {}
