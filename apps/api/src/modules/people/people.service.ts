import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { appearanceInput, listInput, ownerId, personInput, uuid } from './people.validation';

const personColumns = `id, name, aliases, is_me AS "isMe", created_at AS "createdAt", updated_at AS "updatedAt"`;
const appearanceColumns = `id, person_id AS "personId", asset_id AS "assetId", start_s, end_s, frame_s,
  box, status, origin, created_at AS "createdAt", updated_at AS "updatedAt"`;
function page(rows: any[], limit: number) {
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return { items, count: items.length, hasMore, nextAfter: hasMore ? items[items.length - 1].id : null };
}

@Injectable()
export class PeopleService {
  constructor(private readonly db: DatabaseService) {}

  async list(owner: string, limit?: unknown, after?: unknown) {
    ownerId(owner);
    const p = listInput(limit, after);
    const result = await this.db.query(`SELECT ${personColumns} FROM people
      WHERE user_id = $1 AND ($2::uuid IS NULL OR id > $2) ORDER BY id LIMIT $3`, [owner, p.after, p.limit + 1]);
    return page(result.rows, p.limit);
  }

  async save(owner: string, body: unknown, id?: string) {
    ownerId(owner);
    if (id !== undefined) uuid(id);
    const input = personInput(body);
    try {
      const result = id === undefined
        ? await this.db.query(`INSERT INTO people (user_id, name, aliases, is_me) VALUES ($1,$2,$3,$4)
            RETURNING ${personColumns}`, [owner, input.name, input.aliases, input.isMe])
        : await this.db.query(`UPDATE people SET name=$3, aliases=$4, is_me=$5, updated_at=NOW()
            WHERE user_id=$1 AND id=$2 RETURNING ${personColumns}`, [owner, id, input.name, input.aliases, input.isMe]);
      if (!result.rows.length) throw new NotFoundException('Person not found');
      return result.rows[0];
    } catch (error) {
      if ((error as any).code === '23505') throw new ConflictException('Only one person can be marked as me; unset the existing selection first');
      throw error;
    }
  }

  async remove(owner: string, id: string) {
    ownerId(owner); uuid(id);
    const result = await this.db.query('DELETE FROM people WHERE user_id=$1 AND id=$2 RETURNING id', [owner, id]);
    if (!result.rows.length) throw new NotFoundException('Person not found');
    return { deleted: true };
  }

  async addAppearance(owner: string, personId: string, body: unknown) {
    ownerId(owner); uuid(personId);
    const input = appearanceInput(body);
    // Lock the source row against ownership/duration updates until this statement commits.
    const result = await this.db.query(`WITH source AS (
        SELECT id FROM media_assets WHERE user_id=$1 AND id=$3 AND duration >= $5 FOR SHARE
      ) INSERT INTO person_appearances (user_id, person_id, asset_id, start_s, end_s, frame_s, box)
      SELECT $1, p.id, s.id, $4, $5, $6, $7 FROM people p CROSS JOIN source s
      WHERE p.user_id=$1 AND p.id=$2 RETURNING ${appearanceColumns}`,
      [owner, personId, input.assetId, input.start_s, input.end_s, input.frame_s, input.box]);
    if (!result.rows.length) throw new NotFoundException('Person or source not found, or range exceeds known source duration');
    return result.rows[0];
  }

  async appearances(owner: string, personId: string, limit?: unknown, after?: unknown) {
    ownerId(owner); uuid(personId);
    const p = listInput(limit, after);
    const person = await this.db.query('SELECT id FROM people WHERE user_id=$1 AND id=$2', [owner, personId]);
    if (!person.rows.length) throw new NotFoundException('Person not found');
    const result = await this.db.query(`SELECT ${appearanceColumns} FROM person_appearances a
      WHERE a.user_id=$1 AND a.person_id=$2 AND ($3::uuid IS NULL OR a.id > $3)
        AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id=a.asset_id AND m.user_id=$1)
      ORDER BY a.id LIMIT $4`, [owner, personId, p.after, p.limit + 1]);
    return page(result.rows, p.limit);
  }

  async review(owner: string, id: string, status: 'confirmed' | 'rejected') {
    ownerId(owner); uuid(id);
    const result = await this.db.query(`UPDATE person_appearances a SET status=$3, updated_at=NOW()
      WHERE a.user_id=$1 AND a.id=$2
        AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id=a.asset_id AND m.user_id=$1)
      RETURNING ${appearanceColumns}`, [owner, id, status]);
    if (!result.rows.length) throw new NotFoundException('Appearance not found');
    return result.rows[0];
  }

  async removeAppearance(owner: string, id: string) {
    ownerId(owner); uuid(id);
    const result = await this.db.query('DELETE FROM person_appearances WHERE user_id=$1 AND id=$2 RETURNING id', [owner, id]);
    if (!result.rows.length) throw new NotFoundException('Appearance not found');
    return { deleted: true };
  }
}
