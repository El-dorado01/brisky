import { absoluteWindowCues, planAudioWindows, processAudioWindows } from './audio-windows';

describe('resumable audio windows', () => {
  it('covers the entire timeline with bounded context and a short final window', () => {
    expect(planAudioWindows(45, 20, 2)).toEqual([
      { index: 0, start: 0, end: 20, readStart: 0, readEnd: 22 },
      { index: 1, start: 20, end: 40, readStart: 18, readEnd: 42 },
      { index: 2, start: 40, end: 45, readStart: 38, readEnd: 45 },
    ]);
  });
  it('assigns overlap ownership by midpoint and preserves complete source-time cues', () => {
    const window = planAudioWindows(45, 20, 2)[1];
    expect(absoluteWindowCues(window, [
      { start_time: 0, end_time: 1, text: 'owned by previous' },
      { start_time: 1, end_time: 4, text: 'crossing boundary' },
      { start_time: 21, end_time: 23, text: 'owned by next' },
    ])).toEqual([{ start_time: 19, end_time: 22, text: 'crossing boundary' }]);
    expect(() => absoluteWindowCues(window, [{ start_time: 0, end_time: 999, text: 'invalid' }])).toThrow('timestamps');
  });
  it('overlaps one extraction with transcription, publishes early, and skips completed windows', async () => {
    const events: string[] = [];
    const cleanup = jest.fn();
    const windows = planAudioWindows(65, 20, 2);
    await processAudioWindows({ windows, completed: new Set([0]), assertActive: async () => {},
      prepare: async (window) => { events.push(`prepare${window.index}`); return { path: String(window.index), cleanup }; },
      transcribe: async (audio) => {
        events.push(`transcribe${audio}`);
        if (audio === '1') { expect(events).toContain('prepare2'); expect(events).not.toContain('prepare3'); }
        return [{ start_time: 2, end_time: 4, text: 'spoken words' }];
      },
      publish: async (window) => { events.push(`publish${window.index}`); },
    });
    expect(events).not.toContain('prepare0');
    expect(events.indexOf('publish1')).toBeLessThan(events.indexOf('transcribe2'));
    expect(events.indexOf('publish1')).toBeLessThan(events.indexOf('prepare3'));
    expect(cleanup).toHaveBeenCalledTimes(3);
  });
  it('cleans current and prefetched files after a failed publication and does not publish later windows', async () => {
    const cleanups: number[] = [];
    const publish = jest.fn(async () => { throw new Error('database unavailable'); });
    await expect(processAudioWindows({ windows: planAudioWindows(45, 20, 2), completed: new Set(),
      assertActive: async () => {}, prepare: async (window) => ({ path: String(window.index), cleanup: () => { cleanups.push(window.index); } }),
      transcribe: async () => [{ start_time: 2, end_time: 4, text: 'words' }], publish,
    })).rejects.toThrow('database unavailable');
    expect(cleanups.sort()).toEqual([0, 1]);
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it('does not checkpoint malformed model timestamps', async () => {
    const publish = jest.fn();
    await expect(processAudioWindows({ windows: planAudioWindows(20, 20), completed: new Set(), assertActive: async () => {},
      prepare: async () => ({ path: 'audio', cleanup: () => {} }),
      transcribe: async () => [{ start_time: -1, end_time: 2, text: 'bad' }], publish,
    })).rejects.toThrow('timestamps');
    expect(publish).not.toHaveBeenCalled();
  });
});
