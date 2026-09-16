import {
  normalizeJobEnvelope,
  priorityToBullNumber,
  FactoryJobEnvelope,
  IndexingJobData,
} from './indexing.types';

describe('Factory Job Envelope Seam (Phase F1)', () => {
  it('maps priority classes to BullMQ numeric priorities', () => {
    expect(priorityToBullNumber('interactive')).toBe(1);
    expect(priorityToBullNumber('normal')).toBe(5);
    expect(priorityToBullNumber('batch')).toBe(10);
    // fallback
    expect(priorityToBullNumber(undefined as any)).toBe(5);
  });

  it('normalizes a standard FactoryJobEnvelope', () => {
    const envelope: FactoryJobEnvelope = {
      job_id: 'job_123',
      job_type: 'index_asset',
      asset_id: 'vid_456',
      user_id: 'user_789',
      source: {
        provider: 'google_drive',
        connectorAccountId: 'acc_1',
        remoteId: 'drive_file_1',
        originalFilename: 'test.mp4',
        checksum: 'md5_123',
        fileSize: 5000,
      },
      segment: null,
      priority: 'interactive',
      attempt: 1,
      processing_config: {
        analysisVersion: 3,
        model: 'gemini-2.5-flash',
      },
    };

    const normalized = normalizeJobEnvelope(envelope);
    expect(normalized.job_type).toBe('index_asset');
    expect(normalized.asset_id).toBe('vid_456');
    expect(normalized.priority).toBe('interactive');
    expect(normalized.source.provider).toBe('google_drive');
    expect(normalized.segment).toBeNull();
  });

  it('normalizes legacy IndexingJobData into compliant FactoryJobEnvelope', () => {
    const legacyData: IndexingJobData = {
      assetId: 'vid_legacy_1',
      userId: 'user_1',
      sourcePath: '/storage/uploads/vid.mp4',
      originalFilename: 'my_video.mp4',
      checksum: 'chk_123',
      fileSize: 10485760,
      sourceType: 'upload',
      provider: 'upload',
    };

    const normalized = normalizeJobEnvelope(legacyData);
    expect(normalized.job_type).toBe('index_asset');
    expect(normalized.asset_id).toBe('vid_legacy_1');
    expect(normalized.user_id).toBe('user_1');
    expect(normalized.priority).toBe('normal');
    expect(normalized.source.provider).toBe('upload');
    expect(normalized.source.sourcePath).toBe('/storage/uploads/vid.mp4');
    expect(normalized.source.originalFilename).toBe('my_video.mp4');
    expect(normalized.source.checksum).toBe('chk_123');
    expect(normalized.source.fileSize).toBe(10485760);
    expect(normalized.segment).toBeNull();
  });
});
