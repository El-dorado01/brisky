import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SceneBoundary } from './pipeline.types';

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
