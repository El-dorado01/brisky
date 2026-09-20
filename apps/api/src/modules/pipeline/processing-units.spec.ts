import { ProcessingUnitsService } from './processing-units.service';
import { SceneBoundary } from './pipeline.types';

describe('Processing Units Planning & Checkpointing Seam (Phase F2)', () => {
  let service: ProcessingUnitsService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    service = new ProcessingUnitsService(mockDb);
  });

  it('plans discrete processing units for an asset with scenes and audio', async () => {
    const scenes: SceneBoundary[] = [
      { sceneId: 0, startTime: 0, endTime: 5, representativeTimestamp: 2, keyframePath: '', keyframes: [] },
      { sceneId: 1, startTime: 5, endTime: 12, representativeTimestamp: 8, keyframePath: '', keyframes: [] },
    ];

    const planned = await service.planUnits('asset_100', scenes, true);

    expect(planned.length).toBe(7); // audio, scene_0, embed_0, scene_1, embed_1, gemini_video, finalize
    expect(planned.map((u: any) => u.unit_id)).toEqual([
      'audio_transcribe',
      'scene_0',
      'embed_scene_0',
      'scene_1',
      'embed_scene_1',
      'gemini_video',
      'finalize',
    ]);

    // Check that database batch insert or upsert was invoked
    expect(mockDb.query).toHaveBeenCalled();
  });

  it('retrieves completed unit ids to enable skipping completed work on restart', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ unit_id: 'audio_transcribe' }, { unit_id: 'scene_0' }],
    });

    const completed = await service.getCompletedUnitIds('asset_100');

    expect(completed.has('audio_transcribe')).toBe(true);
    expect(completed.has('scene_0')).toBe(true);
    expect(completed.has('scene_1')).toBe(false);
  });

  it('marks a unit completed with optional metadata', async () => {
    await service.markUnitCompleted('asset_100', 'scene_0', { observationsCount: 3 });

    const updateCall = mockDb.query.mock.calls.find((c: any[]) =>
      c[0]?.includes('UPDATE media_processing_units') && c[0]?.includes("status = 'completed'"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toContain('asset_100');
    expect(updateCall[1]).toContain('scene_0');
  });

  it('marks a unit failed and increments attempts', async () => {
    await service.markUnitFailed('asset_100', 'scene_1', 'Corrupt frame packet');

    const updateCall = mockDb.query.mock.calls.find((c: any[]) =>
      c[0]?.includes('UPDATE media_processing_units') && c[0]?.includes("status = 'failed'"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toContain('Corrupt frame packet');
  });

  it('retrieves completed units as a map of unit_id to metadata', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { unit_id: 'audio_transcribe', metadata: JSON.stringify({ transcript: [{ text: 'hi' }] }) },
        { unit_id: 'scene_0', metadata: { observations: [{ desc: 'tree' }] } },
      ],
    });

    const map = await service.getCompletedUnits('asset_100');
    expect(map.get('audio_transcribe')?.transcript).toEqual([{ text: 'hi' }]);
    expect(map.get('scene_0')?.observations).toEqual([{ desc: 'tree' }]);
  });

  it('checks if asset has failed units', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    const hasFailed = await service.hasFailedUnits('asset_100');
    expect(hasFailed).toBe(true);

    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    const noneFailed = await service.hasFailedUnits('asset_100');
    expect(noneFailed).toBe(false);
  });
});
