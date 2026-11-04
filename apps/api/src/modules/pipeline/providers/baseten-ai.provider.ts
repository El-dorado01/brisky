import { ConfigService } from '@nestjs/config';
import { MetaAiProvider } from './meta-ai.provider';
import { AiIntelligenceProvider,VerificationResult } from '../ai-provider';
import { FfmpegPipelineService } from '../ffmpeg-pipeline.service';
import { ModelUsage,TranscriptCue,VideoAnalysis } from '../pipeline.types';

export const BASETEN_HACKATHON_MODEL='meta-models/muse-spark-open-1026';

/** The sponsor key is model-scoped. Never route it to Meta/Google or another model. */
export class BasetenAiProvider extends MetaAiProvider {
  constructor(config:ConfigService,ffmpeg:FfmpegPipelineService,
    embeddings:Pick<AiIntelligenceProvider,'getEmbeddingModel'|'generateEmbedding'>,fetcher:typeof fetch=globalThis.fetch){
    const model=config.get<string>('BASETEN_MODEL',BASETEN_HACKATHON_MODEL);
    if(model!==BASETEN_HACKATHON_MODEL)throw new Error(`Use exactly ${BASETEN_HACKATHON_MODEL} with the hackathon key`);
    super(config,ffmpeg,embeddings,fetcher,'baseten');
  }
  getPrimaryModel(){return BASETEN_HACKATHON_MODEL;}
  getModelCascade(){return [BASETEN_HACKATHON_MODEL];}
  // Text and frame-image request paths reuse the existing structured contracts.
  // Media requires explicit opt-in; source bounds and structured evidence stay shared.
  async analyzeVideo(videoPath:string):Promise<{analysis:VideoAnalysis;usage:ModelUsage}>{
    if (String(this.config.get('BASETEN_MEDIA_ENABLED','false'))!=='true') throw new Error('Baseten original-video analysis is not enabled; validate and set BASETEN_MEDIA_ENABLED explicitly');
    return super.analyzeVideo(videoPath);
  }
  async transcribeAudio(audioPath:string):Promise<{transcript:TranscriptCue[];usage:ModelUsage}>{
    if (String(this.config.get('BASETEN_MEDIA_ENABLED','false'))!=='true') throw new Error('Baseten audio transcription is not enabled; validate and set BASETEN_MEDIA_ENABLED explicitly');
    return super.transcribeAudio(audioPath);
  }
  async verifyClip(_clipPath:string,_query:string,_start:number,_end:number,_transcriptSnippet?:string):Promise<VerificationResult>{
    return {status:'insufficient_evidence',matched:false,confidence:0,explanation:'Baseten original-video verification is not enabled in this pilot'};
  }
}
