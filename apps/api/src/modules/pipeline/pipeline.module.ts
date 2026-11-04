import { Module } from '@nestjs/common';
import { FfmpegPipelineService } from './ffmpeg-pipeline.service';
import { AiIntelligenceService } from './ai-intelligence.service';
import { IntelligenceMergerService } from './intelligence-merger.service';
import { WhisperTranscriptionService } from './whisper-transcription.service';
import { LocalEmbeddingService } from './local-embedding.service';
import { ProcessingUnitsService } from './processing-units.service';
import { ProxyCacheService } from './proxy-cache.service';
import { SearchEvidenceService } from './search-evidence.service';

@Module({
  providers: [
    SearchEvidenceService,
    FfmpegPipelineService,
    AiIntelligenceService,
    IntelligenceMergerService,
    WhisperTranscriptionService,
    LocalEmbeddingService,
    ProcessingUnitsService,
    ProxyCacheService,
  ],
  exports: [
    SearchEvidenceService,
    FfmpegPipelineService,
    AiIntelligenceService,
    IntelligenceMergerService,
    WhisperTranscriptionService,
    LocalEmbeddingService,
    ProcessingUnitsService,
    ProxyCacheService,
  ],
})
export class PipelineModule {}
