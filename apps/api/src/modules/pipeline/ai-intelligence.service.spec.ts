import { ConfigService } from '@nestjs/config';
import { AiIntelligenceService } from './ai-intelligence.service';
import { GoogleAiProvider } from './providers/google-ai.provider';

describe('AI provider boundary', () => {
  const config = (values: Record<string, unknown>) => new ConfigService({
    AI_API_KEY: '', AI_API_KEYS: '', AI_PROVIDER: 'google', ...values,
  });
  it('uses provider-neutral settings through the application facade', () => {
    const service = new AiIntelligenceService(config({ AI_MODEL: 'selected-model',
      AI_EMBEDDING_MODEL: 'embedding-model', AI_FALLBACK_MODELS: '', AI_FALLBACK_MODEL: '' }), {} as any);
    expect(service.getPrimaryModel()).toBe('selected-model');
    expect(service.getModelCascade()).toEqual(['selected-model']);
    expect(service.getEmbeddingModel()).toBe('embedding-model');
    expect(service.isConfigured()).toBe(false);
  });
  it('keeps legacy deployment configuration compatible', () => {
    const provider = new GoogleAiProvider(new ConfigService({ GEMINI_API_KEY: '', GEMINI_API_KEYS: '',
      GEMINI_MODEL: 'legacy-model', GEMINI_FALLBACK_MODELS: '', GEMINI_FALLBACK_MODEL: '' }), {} as any);
    expect(provider.getPrimaryModel()).toBe('legacy-model');
    expect(provider.getModelCascade()).toEqual(['legacy-model']);
  });
  it('prefers neutral settings and respects explicitly empty fallbacks', () => {
    const service = new AiIntelligenceService(config({ AI_MODEL: 'new-model', GEMINI_MODEL: 'old-model',
      AI_FALLBACK_MODELS: '', AI_FALLBACK_MODEL: '', GEMINI_FALLBACK_MODELS: 'old-fallback' }), {} as any);
    expect(service.getModelCascade()).toEqual(['new-model']);
  });
  it('rejects unsupported providers instead of sending their keys to Google', () => {
    expect(() => new AiIntelligenceService(config({ AI_PROVIDER: 'unsupported' }), {} as any)).toThrow('Unsupported AI_PROVIDER');
  });
  it('keeps Google selected even when dormant Meta settings are present', () => {
    const service = new AiIntelligenceService(config({ AI_MODEL:'gemini-selected',META_MODEL:'meta-dormant',META_API_KEY:'meta-test-key' }),{} as any);
    expect(service.getPrimaryModel()).toBe('gemini-selected');
    expect(service.isConfigured()).toBe(false);
  });
  it('selects Meta only explicitly and preserves the existing embedding model', () => {
    const service = new AiIntelligenceService(config({ AI_PROVIDER:'meta',AI_MODEL:'gemini-selected',
      META_MODEL:'meta-selected',META_API_KEY:'meta-test-key',AI_EMBEDDING_MODEL:'existing-embedding' }),{} as any);
    expect(service.getPrimaryModel()).toBe('meta-selected');
    expect(service.getEmbeddingModel()).toBe('existing-embedding');
    expect(service.isConfigured()).toBe(true);
  });
  it('never treats generic or Gemini credentials as Meta credentials', () => {
    const service = new AiIntelligenceService(config({ AI_PROVIDER:'meta',META_MODEL:'meta-selected',META_API_KEY:'',MODEL_API_KEY:'',
      AI_API_KEY:'google-test-key',GEMINI_API_KEY:'legacy-google-test-key' }),{} as any);
    expect(service.isConfigured()).toBe(false);
  });
});
