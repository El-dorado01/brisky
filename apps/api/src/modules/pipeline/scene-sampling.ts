
export function framesPerWindow(lengthSec: number, maxFrames: number): number {
  if (lengthSec <= 6) return 1;
  if (lengthSec <= 12) return 2;
  if (lengthSec <= 20) return Math.min(3, maxFrames);
  return maxFrames;
}

export function computeFrameTimestamps(startTime: number, endTime: number, count: number): number[] {
  const span = endTime - startTime;
  const timestamps: number[] = [];
  for (let i = 1; i <= count; i++) {
    const t = startTime + (span * i) / (count + 1);
    timestamps.push(Number(t.toFixed(2)));
  }
  return timestamps;
}

export interface FlatFrame {
  timestamp: number;
  path: string;
}

export function flattenSceneKeyframes(scenes: Array<{ keyframes: FlatFrame[] }>): FlatFrame[] {
  const flat: FlatFrame[] = [];
  for (const scene of scenes) {
    for (const kf of scene.keyframes || []) {
      flat.push(kf);
    }
  }
  return flat.sort((a, b) => a.timestamp - b.timestamp);
}

export function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = (value || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export interface AggregatableFrame {
  objects: string[];
  activity: string[];
  onScreenText: string[];
}

export interface AggregatedFrameFields {
  objects: string[];
  activity: string[];
  onScreenText: string[];
}

export function aggregateFrameObservations(frameObs: AggregatableFrame[]): AggregatedFrameFields {
  return {
    objects: unique(frameObs.flatMap((f) => f.objects || [])),
    activity: unique(frameObs.flatMap((f) => f.activity || [])),
    onScreenText: unique(frameObs.flatMap((f) => f.onScreenText || [])),
  };
}

export interface RawKeyframeEntry {
  timestamp: number;
  path: string;
}

export function parseKeyframePaths(raw: unknown): RawKeyframeEntry[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (f): f is RawKeyframeEntry =>
          Boolean(f) && typeof f.path === 'string' && f.path.length > 0 && typeof f.timestamp === 'number',
      )
      .map((f) => ({ timestamp: f.timestamp, path: f.path }));
  } catch {
    return [];
  }
}

export function narrowResultWindow(
  startTime: number,
  endTime: number,
  matchedTimestamp: number | undefined,
  paddingSec = 1.5,
): { startTime: number; endTime: number } {
  if (matchedTimestamp === undefined || matchedTimestamp < startTime || matchedTimestamp > endTime) {
    return { startTime, endTime };
  }
  return {
    startTime: Number(Math.max(startTime, matchedTimestamp - paddingSec).toFixed(2)),
    endTime: Number(Math.min(endTime, matchedTimestamp + paddingSec).toFixed(2)),
  };
}
