import { Module } from '@nestjs/common';
import { FfmpegPipelineService } from './ffmpeg-pipeline.service';
import { GeminiIntelligenceService } from './gemini-intelligence.service';
import { IntelligenceMergerService } from './intelligence-merger.service';
import { WhisperTranscriptionService } from './whisper-transcription.service';
import { LocalEmbeddingService } from './local-embedding.service';
import { ProcessingUnitsService } from './processing-units.service';
import { ProxyCacheService } from './proxy-cache.service';

@Module({
  providers: [
    FfmpegPipelineService,
    GeminiIntelligenceService,
    IntelligenceMergerService,
    WhisperTranscriptionService,
    LocalEmbeddingService,
    ProcessingUnitsService,
    ProxyCacheService,
  ],
  exports: [
    FfmpegPipelineService,
    GeminiIntelligenceService,
    IntelligenceMergerService,
    WhisperTranscriptionService,
    LocalEmbeddingService,
    ProcessingUnitsService,
    ProxyCacheService,
  ],
})
export class PipelineModule {}
