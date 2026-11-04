import {ConfigService} from '@nestjs/config';
export const META_EMBEDDING_MODEL='meta-laser2-4f82476d54ff';
export const metaOnly=(config:ConfigService)=>config.get('META_ONLY_RUNTIME','false')==='true';
export const metaEmbeddings=(config:ConfigService)=>metaOnly(config)||config.get('EMBEDDING_PROVIDER','')==='meta-local';
export function assertMetaOnlyProfile(config:ConfigService){
  if(!metaOnly(config))return;
  const required:Record<string,string>={AI_PROVIDER:'meta',EMBEDDING_PROVIDER:'meta-local',TRANSCRIPTION_PROVIDER:'ai',VOICE_CONVERSATION_MODE:'meta-mms',FACE_RECOGNITION_ENABLED:'false',FACE_ARCHIVE_WORKER_ENABLED:'false'};
  for(const [key,value] of Object.entries(required))if(config.get(key,'')!==value)throw new Error(`Meta-only runtime requires ${key}=${value}`);
  const allowed=new Set(['muse-spark-1.1','muse-spark-1.2','muse-spark-1.3','muse-wonder-1.0']);
  for(const key of ['META_MODEL','META_VIDEO_MODEL','META_AUDIO_MODEL','META_VOICE_MODEL'])if(!allowed.has(config.get(key,'')))throw new Error('Unsupported Meta-only model: '+key);
  for(const key of ['META_FALLBACK_MODELS','META_VIDEO_FALLBACK_MODELS','META_AUDIO_FALLBACK_MODELS'])for(const model of config.get<string>(key,'').split(',').map(v=>v.trim()).filter(Boolean))if(!allowed.has(model))throw new Error('Unsupported Meta-only fallback: '+key);
}
