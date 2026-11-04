import { AsyncLocalStorage } from 'async_hooks';
import type { SearchResult } from '../modules/media/media.types';
import { SearchResource, SearchResources } from './search-resources';

const progress = new AsyncLocalStorage<{ retrieveOnly: boolean; publish: (hits: SearchResult[]) => void; cloudBytes: number; resources: SearchResources }>();
export const retrievalOnly = () => progress.getStore()?.retrieveOnly ?? false;
export const publishSearchResults = (hits: SearchResult[]) => progress.getStore()?.publish(hits);
export const withSearchProgress = async <T>(retrieveOnly: boolean, publish: (hits: SearchResult[]) => void,
  work: () => Promise<T>): Promise<T> => {
  const resources = new SearchResources();
  try { return await progress.run({ retrieveOnly, publish, cloudBytes: 0, resources }, work); }
  finally { resources.close(); }
};
export const acquireSearchResource = <T extends SearchResource>(key: string, create: () => Promise<T | null>) =>
  progress.getStore()?.resources.acquire(key, create) ?? Promise.resolve(null);
export function reserveCloudBytes(bytes: number, limit: number): boolean {
  const current = progress.getStore();
  if (!current) return false;
  if (current.cloudBytes + bytes > limit) return false;
  current.cloudBytes += bytes;
  return true;
}
