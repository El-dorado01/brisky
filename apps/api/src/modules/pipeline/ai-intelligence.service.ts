import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FfmpegPipelineService } from './ffmpeg-pipeline.service';
import { GoogleAiProvider } from './providers/google-ai.provider';
import { AiIntelligenceProvider } from './ai-provider';
import { MetaAiProvider } from './providers/meta-ai.provider';
import { BasetenAiProvider } from './providers/baseten-ai.provider';
import {assertMetaOnlyProfile,metaOnly,META_EMBEDDING_MODEL} from '../../common/meta-only-profile';

/** Application-facing intelligence boundary. Provider SDK details stay in adapters. */
@Injectable()
export class AiIntelligenceService {
  private readonly provider: AiIntelligenceProvider;

  constructor(config: ConfigService, ffmpeg: FfmpegPipelineService) {
    assertMetaOnlyProfile(config);
    const name = config.get<string>('AI_PROVIDER', 'google');
    switch (name) {
      case 'google': this.provider = new GoogleAiProvider(config, ffmpeg); break;
      case 'meta': this.provider = new MetaAiProvider(config, ffmpeg, metaOnly(config)?{getEmbeddingModel:()=>META_EMBEDDING_MODEL,generateEmbedding:async()=>{throw new Error('Use the isolated local Meta embedding service; no Google fallback is allowed');}}:new GoogleAiProvider(config, ffmpeg)); break;
      case 'baseten': this.provider = new BasetenAiProvider(config,ffmpeg,new GoogleAiProvider(config,ffmpeg));break;
      default: throw new Error(`Unsupported AI_PROVIDER '${name}': install an adapter before switching providers`);
    }
  }

  isConfigured() { return this.provider.isConfigured(); }
  spaceConversation(...args:Parameters<AiIntelligenceProvider['spaceConversation']>) { return this.provider.spaceConversation(...args); }
  getPrimaryModel() { return this.provider.getPrimaryModel(); }
  getModelCascade() { return this.provider.getModelCascade(); }
  getEmbeddingModel() { return this.provider.getEmbeddingModel(); }
  verifyConversation(...args: Parameters<AiIntelligenceProvider['verifyConversation']>) { return this.provider.verifyConversation(...args); }
  studioDocument(...args:Parameters<AiIntelligenceProvider['studioDocument']>){return this.provider.studioDocument(...args);}
  analyzeVideo(...args: Parameters<AiIntelligenceProvider['analyzeVideo']>) { return this.provider.analyzeVideo(...args); }
  transcribeAudio(...args: Parameters<AiIntelligenceProvider['transcribeAudio']>) { return this.provider.transcribeAudio(...args); }
  analyzeFrames(...args: Parameters<AiIntelligenceProvider['analyzeFrames']>) { return this.provider.analyzeFrames(...args); }
  generateEmbedding(...args: Parameters<AiIntelligenceProvider['generateEmbedding']>) { return this.provider.generateEmbedding(...args); }
  understandQuery(...args: Parameters<AiIntelligenceProvider['understandQuery']>) { return this.provider.understandQuery(...args); }
  decomposeQuery(...args: Parameters<AiIntelligenceProvider['decomposeQuery']>) { return this.provider.decomposeQuery(...args); }
  verifyCandidate(...args: Parameters<AiIntelligenceProvider['verifyCandidate']>) { return this.provider.verifyCandidate(...args); }
  verifyClip(...args: Parameters<AiIntelligenceProvider['verifyClip']>) { return this.provider.verifyClip(...args); }
}
