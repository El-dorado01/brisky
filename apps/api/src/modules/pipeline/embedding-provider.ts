import { ConfigService } from '@nestjs/config';

/** Explicit owner-scoped opt-in; never compare vectors from different model spaces. */
export function embeddingProviderForUser(config:ConfigService,userId?:string):string {
  const users=config.get<string>('LOCAL_EMBEDDING_USER_IDS','').split(',').map(value=>value.trim()).filter(Boolean);
  if(users.some(value=>! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) throw new Error('Invalid LOCAL_EMBEDDING_USER_IDS');
  return userId && users.includes(userId) ? 'local' : config.get<string>('EMBEDDING_PROVIDER','gemini');
}
