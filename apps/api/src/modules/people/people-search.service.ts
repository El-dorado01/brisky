import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ownerId } from './people.validation';
import { confirmedOverlapSql, KnownPerson, resolveReferences, searchInput } from './people-search';
import type { SearchResponse } from '../media/media.types';

@Injectable()
export class PeopleSearchService {
  constructor(private readonly db: DatabaseService) {}

  async search(owner: string, body: unknown, automatic = false): Promise<SearchResponse | null> {
    ownerId(owner);
    const input = searchInput(body);
    // Fail visibly on overflow instead of silently resolving an incomplete directory.
    const directory = await this.db.query<KnownPerson>(`SELECT id,name,aliases,is_me AS "isMe"
      FROM people WHERE user_id=$1 ORDER BY id LIMIT 1001`, [owner]);
    const base: SearchResponse = { results: [], hasExactMatch: false, queryIntent: 'visual', searchStatus: 'complete', canContinue: false };
    if (directory.rows.length > 1000) return { ...base, identitySearch: { status: 'needs_clarification', references: [], hasMore: false,
      evidenceScope: 'manual_appearance_overlap', queryConditionsVerified: false }, explanation: 'The people directory exceeds this search limit. Identity resolution was not attempted.' };
    const references = resolveReferences(input.query, directory.rows, input.references, input.selections);
    if (!references.length && automatic) return null;
    const metadata = { status: 'resolved' as const, references, hasMore: false,
      evidenceScope: 'manual_appearance_overlap' as const, queryConditionsVerified: false as const };
    if (!references.length || references.some(r => !r.personId)) return { ...base,
      identitySearch: { ...metadata, status: 'needs_clarification' },
      explanation: 'Identify the missing person or select one of the listed candidates, then repeat this query through /people/search with selections. No identity was guessed.' };
    if (references.length > 8 || /\b(?:not|without|except|excluding|or|either|before|after|then)\b/i.test(input.query)) return { ...base,
      identitySearch: { ...metadata, status: 'needs_clarification' },
      explanation: 'This search supports up to eight people appearing together. Exclusions, alternatives and temporal sequences need a more specific request; no matches were assumed.' };
    if (/\b(?:mention|mentions|mentioned|quote|quotes|named|name|about)\b/i.test(input.query)) return { ...base,
      identitySearch: { ...metadata, status: 'needs_clarification' },
      explanation: 'Do you mean these people appear in the video, or that someone mentions them? Confirmed appearance tags cannot establish spoken mentions.' };
    const ids = [...new Set(references.map(r => r.personId!))];
    const matches = await this.db.query(confirmedOverlapSql, [owner, ids, input.assetId ?? null, ids.length, input.limit + 1]);
    return { ...base, identitySearch: { ...metadata, hasMore: matches.rows.length > input.limit },
      explanation: 'These are overlapping, user-confirmed appearance ranges. Conversation, actions, dates and other query conditions have not been verified. These tags are not automatic recognition results.',
      results: matches.rows.slice(0, input.limit).map(row => ({
        assetId: row.asset_id, segmentId: `identity:${row.asset_id}:${row.start_s}:${row.end_s}`,
        startTime: row.start_s, endTime: row.end_s, title: 'Confirmed people appearances',
        description: 'User-confirmed appearance overlap; other requested conditions remain unverified.',
        transcriptSnippet: '', score: 1, matchType: 'identity', winningPath: 'identity', matchQuality: 'related',
        thumbnailUrl: `/api/v1/media/${encodeURIComponent(row.asset_id)}/thumbnail`, filename: row.original_filename,
        playbackUrl: `/api/v1/media/${encodeURIComponent(row.asset_id)}/stream#t=${row.start_s},${row.end_s}`,
        stage2Verified: false, verificationStatus: 'insufficient_evidence',
        verificationExplanation: 'Manual appearance tags do not verify the full query.',
      })) };
  }
}
