import { TranscriptCue } from './pipeline.types';

export interface AudioWindow { index: number; start: number; end: number; readStart: number; readEnd: number; }
export const audioWindowId = (index: number) => `audio_window_${String(index).padStart(6, '0')}`;
export function planAudioWindows(duration: number, seconds = 60, overlap = 2): AudioWindow[] {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(seconds) || seconds < 10 || seconds > 300 ||
      !Number.isFinite(overlap) || overlap < 0 || overlap > 10 || overlap >= seconds / 2 || Math.ceil(duration / seconds) > 10000) {
    throw new Error('Invalid audio window limits');
  }
  return Array.from({ length: Math.ceil(duration / seconds) }, (_, index) => {
    const start = index * seconds, end = Math.min(duration, start + seconds);
    return { index, start, end, readStart: Math.max(0, start - overlap), readEnd: Math.min(duration, end + overlap) };
  });
}

/** Keep whole cues; midpoint assigns overlap ownership without cutting words at the core boundary. */
export function absoluteWindowCues(window: AudioWindow, cues: TranscriptCue[]): TranscriptCue[] {
  if (!Array.isArray(cues) || cues.length > 5000) throw new Error('Invalid window transcript');
  return cues.flatMap((cue) => {
    if (typeof cue.text !== 'string' || !Number.isFinite(cue.start_time) || !Number.isFinite(cue.end_time) ||
        cue.start_time < 0 || cue.end_time <= cue.start_time || cue.end_time > window.readEnd - window.readStart + 0.05) {
      throw new Error('Invalid window transcript timestamps');
    }
    const start = cue.start_time + window.readStart;
    const end = Math.min(window.readEnd, cue.end_time + window.readStart);
    const middle = (start + end) / 2;
    if (!cue.text.trim() || middle < window.start || middle >= window.end) return [];
    return [{ start_time: start, end_time: end, text: cue.text.trim() }];
  });
}

export interface PreparedAudioWindow { path: string; cleanup(): void | Promise<void>; }
export async function processAudioWindows(options: {
  windows: AudioWindow[]; completed: Set<number>;
  prepare(window: AudioWindow, signal: AbortSignal): Promise<PreparedAudioWindow>;
  transcribe(audio: string, signal: AbortSignal): Promise<TranscriptCue[]>;
  publish(window: AudioWindow, cues: TranscriptCue[]): Promise<void>;
  assertActive(): Promise<void>;
}): Promise<void> {
  const todo = options.windows.filter((window) => !options.completed.has(window.index));
  const controller = new AbortController();
  type Prepared = { value: PreparedAudioWindow; error?: never } | { error: unknown; value?: never };
  const prepare = (window: AudioWindow): Promise<Prepared> => options.prepare(window, controller.signal)
    .then((value) => ({ value }), (error) => ({ error }));
  let next: Promise<Prepared> | undefined;
  let current: PreparedAudioWindow | undefined;
  try {
    if (!todo.length) return;
    await options.assertActive();
    const first = await prepare(todo[0]);
    if ('error' in first) throw first.error;
    current = first.value;
    for (let index = 0; index < todo.length; index++) {
      await options.assertActive();
      if (index + 1 < todo.length) next = prepare(todo[index + 1]);
      const cues = absoluteWindowCues(todo[index], await options.transcribe(current!.path, controller.signal));
      await options.assertActive();
      await options.publish(todo[index], cues);
      await current!.cleanup(); current = undefined;
      if (next) {
        const ready = await next; next = undefined;
        if ('error' in ready) throw ready.error;
        current = ready.value;
      }
    }
  } finally {
    controller.abort();
    try { await current?.cleanup(); }
    finally { const pending = await next; await pending?.value?.cleanup(); }
  }
}
