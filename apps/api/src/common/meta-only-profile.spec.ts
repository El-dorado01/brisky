import { ConfigService } from '@nestjs/config';
import { assertMetaOnlyProfile, metaEmbeddings } from './meta-only-profile';
import { embeddingProviderForUser } from '../modules/pipeline/embedding-provider';

const profile = {
  META_ONLY_RUNTIME: 'true', AI_PROVIDER: 'meta', EMBEDDING_PROVIDER: 'meta-local',
  TRANSCRIPTION_PROVIDER: 'ai', VOICE_CONVERSATION_MODE: 'meta-mms',
  FACE_RECOGNITION_ENABLED: 'false', FACE_ARCHIVE_WORKER_ENABLED: 'false',
  META_MODEL: 'muse-spark-1.3', META_VIDEO_MODEL: 'muse-spark-1.2',
  META_AUDIO_MODEL: 'muse-spark-1.2', META_VOICE_MODEL: 'muse-wonder-1.0',
};
describe('Meta-only runtime admission', () => {
  it('accepts the explicit Meta profile', () => {
    expect(() => assertMetaOnlyProfile(new ConfigService(profile))).not.toThrow();
  });
  it.each([
    ['AI_PROVIDER', 'gemini'], ['EMBEDDING_PROVIDER', 'local'],
    ['TRANSCRIPTION_PROVIDER', 'whisper'], ['VOICE_CONVERSATION_MODE', 'gemini-live'],
    ['FACE_RECOGNITION_ENABLED', 'true'], ['FACE_ARCHIVE_WORKER_ENABLED', 'true'],
    ['META_FALLBACK_MODELS', 'gemini-flash'], ['META_VIDEO_MODEL', 'unknown'],
  ])('rejects an incompatible %s before serving requests', (key, value) => {
    expect(() => assertMetaOnlyProfile(new ConfigService({ ...profile, [key]: value }))).toThrow();
  });
  it('overrides a retained MiniLM owner whitelist', () => {
    const config = new ConfigService({ ...profile, LOCAL_EMBEDDING_USER_IDS: 'owner' });
    expect(metaEmbeddings(config)).toBe(true);
    expect(embeddingProviderForUser(config, 'owner')).toBe('meta-local');
  });
  it('leaves the development profile available', () => {
    expect(() => assertMetaOnlyProfile(new ConfigService({ AI_PROVIDER: 'gemini' }))).not.toThrow();
  });
});
