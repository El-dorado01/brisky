import { planSceneWindows, ownWindowScenes, boundaryContext, hasSceneEvidence } from './scene-windows';

describe('scene window source evidence', () => {
  const scene = (start: number, end: number) => ({ sceneId: 0, startTime: start, endTime: end,
    representativeTimestamp: (start + end) / 2, keyframePath: 'frame.jpg',
    keyframes: [{ timestamp: (start + end) / 2, path: 'frame.jpg' }] });
  it('retains context with stable ownership and an interval crossing the split', () => {
    const windows = planSceneWindows(124);
    expect(windows[1]).toEqual({ index: 1, start: 60, end: 120, readStart: 58, readEnd: 122 });
    expect(ownWindowScenes(windows[1], [scene(58, 60), scene(60, 64)])[0]).toMatchObject({ sceneId: 10001, startTime: 60, endTime: 64 });
    expect(boundaryContext(windows[0], 124, 2)).toEqual({ start: 58, end: 62, sceneId: 9999 });
    expect(boundaryContext(windows[2], 124, 2)).toBeNull();
  });
  it('rejects relative timestamps and missing evidence', () => {
    expect(() => ownWindowScenes(planSceneWindows(124)[1], [scene(0, 4)])).toThrow('source-time');
    expect(hasSceneEvidence([scene(0, 4)], () => false)).toBe(false);
    const cached = scene(0, 4);
    (cached.keyframes[0] as any).data = 'data:image/jpeg;base64,YQ==';
    expect(hasSceneEvidence([cached], () => false)).toBe(true);
  });
  it('preserves a short final core even when the context interval midpoint precedes it', () => {
    const last = planSceneWindows(60.1)[1];
    expect(ownWindowScenes(last, [scene(58, 60.1)])).toHaveLength(1);
  });
});
