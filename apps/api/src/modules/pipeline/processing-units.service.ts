import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SceneBoundary } from './pipeline.types';

export interface PlannedUnit {
  asset_id: string;
  unit_id: string;
  unit_type: string;
  start_s: number | null;
  end_s: number | null;
  status: string;
}

@Injectable()
export class ProcessingUnitsService {
  constructor(private readonly db: DatabaseService) {}

  async planUnits(
    assetId: string,
    scenes: SceneBoundary[],
    hasAudio: boolean,
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
      });
    }

    for (const scene of scenes) {
      units.push({
        asset_id: assetId,
        unit_id: `scene_${scene.sceneId}`,
        unit_type: 'analyze_frames',
        start_s: scene.startTime,
        end_s: scene.endTime,
        status: 'waiting',
      });
    }

    units.push({
      asset_id: assetId,
      unit_id: 'gemini_video',
      unit_type: 'gemini_video',
      start_s: null,
      end_s: null,
      status: 'waiting',
    });

    units.push({
      asset_id: assetId,
      unit_id: 'finalize',
      unit_type: 'finalize_asset',
      start_s: null,
      end_s: null,
      status: 'waiting',
    });

    for (const unit of units) {
      await this.db.query(
        `INSERT INTO media_processing_units (asset_id, unit_id, unit_type, start_s, end_s, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (asset_id, unit_id) DO NOTHING`,
        [unit.asset_id, unit.unit_id, unit.unit_type, unit.start_s, unit.end_s, unit.status],
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
      let meta = r.metadata;
      if (typeof meta === 'string') {
        try {
          meta = JSON.parse(meta);
        } catch {
          meta = {};
        }
      }
      map.set(r.unit_id, meta || {});
    }
    return map;
  }

  async hasFailedUnits(assetId: string): Promise<boolean> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM media_processing_units WHERE asset_id = $1 AND status = 'failed'`,
      [assetId],
    );
    return Number(res.rows[0]?.count || 0) > 0;
  }

  async markUnitCompleted(assetId: string, unitId: string, metadata: any = {}): Promise<void> {
    await this.db.query(
      `UPDATE media_processing_units
       SET status = 'completed', error = NULL, metadata = $1, updated_at = NOW()
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

  async getUnits(assetId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT * FROM media_processing_units WHERE asset_id = $1 ORDER BY created_at ASC`,
      [assetId],
    );
    return res.rows;
  }
}
