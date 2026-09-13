/**
 * Adaptive proxy dimension calculator per Section 3 of 03-media-storage-brief.md:
 * "The current fixed: 4K/1080p -> 720p approach is insufficient.
 * A 360p video may actually become larger after being transcoded to 720p.
 * Therefore proxy generation must be adaptive:
 *   4K       -> 720p
 *   1080p    -> 720p
 *   720p     -> 480p
 *   480p     -> 360p
 *   360p     -> 360p/240p or original"
 */
export function computeAdaptiveProxyTarget(height?: number): number {
  if (!height || height <= 0) return 720;
  if (height <= 360) return height;
  if (height <= 480) return 360;
  if (height <= 720) return 480;
  return 720;
}
