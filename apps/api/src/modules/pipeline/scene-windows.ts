import { planAudioWindows, AudioWindow } from './audio-windows';
import { SceneBoundary } from './pipeline.types';

export type SceneWindow = AudioWindow;
export const sceneWindowId = (index: number) => `scene_window_${String(index).padStart(6, '0')}`;
export const planSceneWindows = (duration: number, seconds = 60, context = 2): SceneWindow[] =>
  planAudioWindows(duration, seconds, context);

/** Independent decoder windows are evidence units, not a claim of global natural scene boundaries. */
export function ownWindowScenes(window: SceneWindow, scenes: SceneBoundary[]): SceneBoundary[] {
  if (!Array.isArray(scenes) || scenes.length > 9998) throw new Error('Invalid scene window output');
  const ordered = [...scenes].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  const kept: SceneBoundary[] = [];
  for (const scene of ordered) {
    if (!Number.isFinite(scene.startTime) || !Number.isFinite(scene.endTime) || scene.endTime <= scene.startTime ||
      scene.startTime < window.readStart - 0.05 || scene.endTime > window.readEnd + 0.05 ||
      !Number.isFinite(scene.representativeTimestamp) || scene.representativeTimestamp < scene.startTime ||
      scene.representativeTimestamp > scene.endTime || !scene.keyframes?.length ||
      scene.keyframes.some((frame) => !Number.isFinite(frame.timestamp) || frame.timestamp < scene.startTime - 0.05 || frame.timestamp > scene.endTime + 0.05)) {
      throw new Error('Invalid source-time scene window evidence');
    }
    // Keep any interval intersecting the core: midpoint ownership loses short final windows.
    if (scene.endTime <= window.start || scene.startTime >= window.end) continue;
    kept.push({ ...scene, sceneId: window.index * 10000 + kept.length + 1 });
  }
  return kept;
}

export function boundaryContext(window: SceneWindow, duration: number, context: number): { start: number; end: number; sceneId: number } | null {
  if (context <= 0 || window.end >= duration) return null;
  return { start: Math.max(0, window.end - context), end: Math.min(duration, window.end + context),
    sceneId: window.index * 10000 + 9999 };
}

export function hasSceneEvidence(scenes: SceneBoundary[], exists: (file: string) => boolean): boolean {
  return scenes.length > 0 && scenes.every((scene) => scene.keyframes?.length && scene.keyframes.every((frame) => {
    const inline = (frame as { data?: string }).data;
    return typeof inline === 'string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(inline) || exists(frame.path);
  }));
}
