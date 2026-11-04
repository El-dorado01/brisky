import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SceneBoundary } from './pipeline.types';
import { TranscriptCue } from './pipeline.types';
import { AudioWindow, audioWindowId } from './audio-windows';

export const MAX_UNIT_ATTEMPTS = 3;

export interface PlannedUnit {
  asset_id: string;
  unit_id: string;
  unit_type: string;
  start_s: number | null;
  end_s: number | null;
  status: string;
  metadata?: Record<string, unknown>;
  index_version?: number;
}

@Injectable()
export class ProcessingUnitsService {
  constructor(private readonly db: DatabaseService) {}

  async planUnits(
    assetId: string,
    scenes: SceneBoundary[],
    hasAudio: boolean,
    indexVersion = 1,
  ): Promise<PlannedUnit[]> {
    const units: PlannedUnit[] = [];

    if (hasAudio) {
      units.push({
        asset_id: assetId,
        unit_id: 'audio_transcribe',
        unit_type: 'transcribe',
        start_s: null,
        end_s: null,
        status: 'waiting',
        metadata: {},
        index_version: indexVersion,
      });
    }

    for (const scene of scenes) {
      const sceneMeta = {
        sceneId: scene.sceneId,
        startTime: scene.startTime,
        endTime: scene.endTime,
        representativeTimestamp: scene.representativeTimestamp,
        keyframePath: scene.keyframePath,
        keyframes: scene.keyframes,
      };
      units.push({
        asset_id: assetId,
        unit_id: `scene_${scene.sceneId}`,
        unit_type: 'analyze_frames',
        start_s: scene.startTime,
        end_s: scene.endTime,
        status: 'waiting',
        metadata: sceneMeta,
        index_version: indexVersion,
      });
      units.push({
        asset_id: assetId,
        unit_id: `embed_scene_${scene.sceneId}`,
        unit_type: 'embed',
        start_s: scene.startTime,
        end_s: scene.endTime,
        status: 'waiting',
        metadata: sceneMeta,
        index_version: indexVersion,
      });
    }

    units.push({
      asset_id: assetId,
      unit_id: 'gemini_video',
      unit_type: 'gemini_video',
      start_s: null,
      end_s: null,
      status: 'waiting',
      metadata: {},
      index_version: indexVersion,
    });

    units.push({
      asset_id: assetId,
      unit_id: 'finalize',
      unit_type: 'finalize_asset',
      start_s: null,
      end_s: null,
      status: 'waiting',
      metadata: {},
      index_version: indexVersion,
    });

    for (const unit of units) {
      await this.db.query(
        `INSERT INTO media_processing_units
           (asset_id, unit_id, unit_type, start_s, end_s, status, metadata, index_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         ON CONFLICT (asset_id, unit_id) DO UPDATE SET
           start_s = EXCLUDED.start_s,
           end_s = EXCLUDED.end_s,
           index_version = EXCLUDED.index_version,
           metadata = CASE
             WHEN media_processing_units.status = 'completed' THEN media_processing_units.metadata
             ELSE EXCLUDED.metadata
           END,
           updated_at = NOW()`,
        [
          unit.asset_id,
          unit.unit_id,
          unit.unit_type,
          unit.start_s,
          unit.end_s,
          unit.status,
          JSON.stringify(unit.metadata || {}),
          unit.index_version || 1,
        ],
      );
    }

    return units;
  }

  async getCompletedUnitIds(assetId: string): Promise<Set<string>> {
    const res = await this.db.query<{ unit_id: string }>(
      `SELECT unit_id FROM media_processing_units WHERE asset_id = $1 AND status = 'completed'`,
      [assetId],
    );
    return new Set(res.rows.map((r) => r.unit_id));
  }

  /** Local preparation only; never dispatch this checkpoint as an AI analysis job. */
  async saveSourcePreparation(assetId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `INSERT INTO media_processing_units (asset_id, unit_id, unit_type, status, metadata)
       VALUES ($1, 'source_preparation', 'source_preparation', 'completed', $2::jsonb)
       ON CONFLICT (asset_id, unit_id) DO UPDATE SET
         metadata = EXCLUDED.metadata, status = 'completed', error = NULL, updated_at = NOW()`,
      [assetId, JSON.stringify(metadata)],
    );
  }

  /** Owner-locked source guard and checkpoint commit; never mix windows from different sources. */
  async saveSceneWindow(assetId: string, userId: string, fingerprint: string, unitId = 'scene_windows', scenes?: SceneBoundary[], complete = false): Promise<void> {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const owner = await client.query('SELECT id FROM media_assets WHERE id=$1 AND user_id=$2 FOR UPDATE', [assetId, userId]);
      if (!owner.rows.length) throw new Error('Scene source does not belong to this account');
      const guard = await client.query("SELECT metadata FROM media_processing_units WHERE asset_id=$1 AND unit_id='scene_windows'", [assetId]);
      if (guard.rows.length && this.parseMeta(guard.rows[0].metadata).fingerprint !== fingerprint) {
        throw new Error('Scene source or window policy changed; reindex is required');
      }
      if (!guard.rows.length && unitId !== 'scene_windows') throw new Error('Missing scene window source guard');
      await client.query(`INSERT INTO media_processing_units(asset_id,unit_id,unit_type,status,metadata)
        VALUES($1,$2,'scene_window',$3,$4::jsonb)
        ON CONFLICT(asset_id,unit_id) DO UPDATE SET status=EXCLUDED.status, metadata=EXCLUDED.metadata,error=NULL,updated_at=NOW()`,
        [assetId, unitId, scenes || complete ? 'completed' : 'waiting', JSON.stringify({ fingerprint, ...(scenes ? { scenes } : {}) })]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async beginTranscriptWindows(assetId: string, userId: string, fingerprint: string): Promise<void> {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const owner = await client.query('SELECT id FROM media_assets WHERE id = $1 AND user_id = $2 FOR UPDATE', [assetId, userId]);
      if (!owner.rows.length) throw new Error('Transcript source does not belong to this account');
      const guard = await client.query("SELECT metadata FROM media_processing_units WHERE asset_id=$1 AND unit_id='audio_windows'", [assetId]);
      if (guard.rows.length && this.parseMeta(guard.rows[0].metadata).fingerprint !== fingerprint) {
        throw new Error('Audio source or window policy changed; reindex is required');
      }
      await client.query(`INSERT INTO media_processing_units(asset_id,unit_id,unit_type,status,metadata)
        VALUES($1,'audio_windows','transcript_window','waiting',$2::jsonb)
        ON CONFLICT(asset_id,unit_id) DO NOTHING`, [assetId, JSON.stringify({ fingerprint, published: false })]);
      await client.query(`INSERT INTO media_processing_units(asset_id,unit_id,unit_type,status)
        VALUES($1,'audio_transcribe','transcribe','waiting') ON CONFLICT(asset_id,unit_id) DO NOTHING`, [assetId]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async getCompletedTranscriptWindows(assetId: string): Promise<Map<string, any>> {
    const rows = await this.db.query(`SELECT unit_id,metadata FROM media_processing_units
      WHERE asset_id=$1 AND unit_type='transcript_window' AND unit_id<>'audio_windows' AND status='completed'`, [assetId]);
    return new Map(rows.rows.map((row) => [row.unit_id, this.parseMeta(row.metadata)]));
  }

  /** Publish observations and their resume marker in one transaction: never mark an unpublished window done. */
  async publishTranscriptWindow(assetId: string, userId: string, fingerprint: string,
    window: AudioWindow, cues: TranscriptCue[], execution?: Record<string, unknown>): Promise<void> {
    const unitId = audioWindowId(window.index);
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const owner = await client.query('SELECT id FROM media_assets WHERE id=$1 AND user_id=$2 FOR UPDATE', [assetId, userId]);
      if (!owner.rows.length) throw new Error('Transcript source does not belong to this account');
      const guard = await client.query("SELECT metadata FROM media_processing_units WHERE asset_id=$1 AND unit_id='audio_windows' FOR UPDATE", [assetId]);
      const metadata = this.parseMeta(guard.rows[0]?.metadata);
      if (metadata.fingerprint !== fingerprint) throw new Error('Audio checkpoint policy mismatch');
      if (!metadata.published) await client.query("DELETE FROM media_observations WHERE asset_id=$1 AND observation_type='transcript'", [assetId]);
      else await client.query(`DELETE FROM media_observations WHERE asset_id=$1 AND observation_type='transcript'
        AND raw_data->>'window_checkpoint'=$2`, [assetId, unitId]);
      const rows = cues.map((cue) => ({ ...cue, window_checkpoint: unitId, source_fingerprint: fingerprint }));
      await client.query(`INSERT INTO media_observations(asset_id,user_id,observation_type,timestamp_start,timestamp_end,raw_data)
        SELECT $1,$2,'transcript',(cue->>'start_time')::double precision,(cue->>'end_time')::double precision, cue
        FROM jsonb_array_elements($3::jsonb) AS cue`, [assetId, userId, JSON.stringify(rows)]);
      await client.query(`INSERT INTO media_processing_units(asset_id,unit_id,unit_type,start_s,end_s,status,metadata)
        VALUES($1,$2,'transcript_window',$3,$4,'completed',$5::jsonb)
        ON CONFLICT(asset_id,unit_id) DO UPDATE SET metadata=EXCLUDED.metadata,status='completed',error=NULL,updated_at=NOW()`,
        [assetId, unitId, window.start, window.end, JSON.stringify({ fingerprint, index: window.index, cues, execution })]);
      await client.query(`UPDATE media_processing_units SET metadata=metadata || '{"published":true}'::jsonb,updated_at=NOW()
        WHERE asset_id=$1 AND unit_id='audio_windows'`, [assetId]);
      await client.query(`UPDATE media_assets SET status=CASE WHEN status IN ('queued','processing','partially_indexed')
        THEN 'partially_indexed' ELSE status END,
        stage=CASE WHEN status IN ('queued','processing','partially_indexed') THEN 'transcribing_windows' ELSE stage END,
        updated_at=NOW() WHERE id=$1 AND user_id=$2`, [assetId, userId]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async finishTranscriptWindows(assetId: string, fingerprint: string): Promise<void> {
    const result = await this.db.query(`UPDATE media_processing_units SET status='completed',error=NULL,
      metadata=metadata || jsonb_build_object('fingerprint',$2::text,'windowed',true),updated_at=NOW()
      WHERE asset_id=$1 AND unit_id IN ('audio_windows','audio_transcribe')
      AND EXISTS(SELECT 1 FROM media_processing_units guard WHERE guard.asset_id=$1 AND guard.unit_id='audio_windows'
        AND guard.metadata->>'fingerprint'=$2) RETURNING unit_id`, [assetId, fingerprint]);
    if (result.rows.length !== 2) throw new Error('Incomplete audio checkpoint state');
  }

  async failTranscriptWindows(assetId: string, error: string): Promise<void> {
    await this.db.query(`UPDATE media_processing_units SET status='failed',error=$2,attempts=attempts+1,updated_at=NOW()
      WHERE asset_id=$1 AND unit_id IN ('audio_windows','audio_transcribe') AND status<>'completed'`, [assetId, error]);
  }

  async getCompletedUnits(assetId: string): Promise<Map<string, any>> {
    const res = await this.db.query<{ unit_id: string; metadata: any }>(
      `SELECT unit_id, metadata FROM media_processing_units WHERE asset_id = $1 AND status = 'completed'`,
      [assetId],
    );
    const map = new Map<string, any>();
    for (const r of res.rows) {
      map.set(r.unit_id, this.parseMeta(r.metadata));
    }
    return map;
  }

  async getUnit(assetId: string, unitId: string): Promise<any | null> {
    const res = await this.db.query(
      `SELECT * FROM media_processing_units WHERE asset_id = $1 AND unit_id = $2 LIMIT 1`,
      [assetId, unitId],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return { ...row, metadata: this.parseMeta(row.metadata) };
  }

  async hasFailedUnits(assetId: string): Promise<boolean> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM media_processing_units WHERE asset_id = $1 AND status = 'failed'`,
      [assetId],
    );
    return Number(res.rows[0]?.count || 0) > 0;
  }

  async getFailedUnits(assetId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT * FROM media_processing_units WHERE asset_id = $1 AND status = 'failed' ORDER BY created_at ASC`,
      [assetId],
    );
    return res.rows.map((r) => ({ ...r, metadata: this.parseMeta(r.metadata) }));
  }

  async pendingSiblingUnits(assetId: string, exceptUnitId?: string): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM media_processing_units
       WHERE asset_id = $1
         AND status IN ('waiting', 'active')
         AND unit_id <> ALL($2::varchar[])`,
      [assetId, exceptUnitId ? [exceptUnitId, 'finalize'] : ['finalize']],
    );
    return Number(res.rows[0]?.count || 0);
  }

  async markUnitCompleted(assetId: string, unitId: string, metadata: any = {}): Promise<void> {
    await this.db.query(
      `UPDATE media_processing_units
       SET status = 'completed', error = NULL,
           metadata = CASE WHEN $1::text = '{}' THEN metadata ELSE $1::jsonb END,
           updated_at = NOW()
       WHERE asset_id = $2 AND unit_id = $3`,
      [JSON.stringify(metadata), assetId, unitId],
    );
  }

  async markUnitFailed(assetId: string, unitId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE media_processing_units
       SET status = 'failed', error = $1, attempts = attempts + 1, updated_at = NOW()
       WHERE asset_id = $2 AND unit_id = $3`,
      [error, assetId, unitId],
    );
  }

  async resetAssetUnits(assetId: string): Promise<void> {
    await this.db.query(`DELETE FROM media_processing_units WHERE asset_id = $1`, [assetId]);
  }

  async resetFailedUnits(assetId: string): Promise<void> {
    await this.db.query(
      `UPDATE media_processing_units
       SET status = 'waiting', error = NULL, updated_at = NOW()
       WHERE asset_id = $1 AND status = 'failed'`,
      [assetId],
    );
    await this.db.query(
      `UPDATE media_processing_units
       SET status = 'waiting', error = NULL, updated_at = NOW()
       WHERE asset_id = $1 AND unit_id = 'finalize' AND status IN ('completed', 'failed')`,
      [assetId],
    );
  }

  async getUnits(assetId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT * FROM media_processing_units WHERE asset_id = $1 ORDER BY created_at ASC`,
      [assetId],
    );
    return res.rows.map((r) => ({ ...r, metadata: this.parseMeta(r.metadata) }));
  }

  private parseMeta(meta: unknown): any {
    if (!meta) return {};
    if (typeof meta === 'string') {
      try {
        return JSON.parse(meta);
      } catch {
        return {};
      }
    }
    return meta;
  }
}
