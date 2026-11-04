import { SearchDeadlineError } from './search-deadline';

export interface SearchResource { cleanup(): void; }
interface Entry {
  pending: Promise<SearchResource | null>;
  value?: SearchResource | null;
  users: number;
}

/** Request-owned resources survive individual inspections, but never cross searches. */
export class SearchResources {
  private readonly entries = new Map<string, Entry>();
  private closed = false;

  async acquire<T extends SearchResource>(key: string, create: () => Promise<T | null>):
    Promise<{ value: T; release(): void } | null> {
    if (this.closed) throw new SearchDeadlineError();
    let entry = this.entries.get(key);
    if (!entry) {
      const fresh: Entry = { pending: Promise.resolve(null), users: 0 };
      fresh.pending = Promise.resolve().then(create).then((value) => { fresh.value = value; return value; });
      entry = fresh;
      this.entries.set(key, entry);
    }
    entry.users++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      entry!.users--;
      this.dispose(entry!);
    };
    try {
      const value = await entry.pending as T | null;
      if (this.closed) throw new SearchDeadlineError();
      if (!value) { release(); return null; }
      return { value, release };
    } catch (error) { release(); throw error; }
  }

  close(): void {
    this.closed = true;
    for (const entry of this.entries.values()) this.dispose(entry);
  }

  private dispose(entry: Entry): void {
    if (!this.closed || entry.users || !entry.value) return;
    const value = entry.value;
    entry.value = null;
    value.cleanup();
  }
}
