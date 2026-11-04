import { boundedText, invalidRequest } from '../../common/request-validation';
import { uuid } from './people.validation';

export interface KnownPerson { id: string; name: string; aliases: string[]; isMe: boolean; }
export interface PersonReference { reference: string; candidates: Array<{ id: string; name: string }>; personId?: string; }
export interface IdentitySearchInput {
  query: string; assetId?: string; limit: number; references?: string[];
  selections: Array<{ reference: string; personId: string }>;
}
export function peopleSearchOptions(value: unknown): Pick<IdentitySearchInput,'references'|'selections'> | undefined {
  if (value===undefined) return undefined;
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!['references','selections'].includes(k))) invalidRequest('people must contain only references and selections');
  const input=searchInput({query:'validation',...value});
  return {references:input.references,selections:input.selections};
}
export function canonical(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export function searchInput(body: any): IdentitySearchInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalidRequest('Body must be an object');
  if (Object.keys(body).some(k => !['query','assetId','limit','references','selections'].includes(k))) invalidRequest('Unknown identity search field');
  const query = boundedText(body.query, 'query', 2000).trim();
  const assetId = body.assetId === undefined ? undefined : boundedText(body.assetId, 'assetId', 64);
  const limit = body.limit ?? 15;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalidRequest('limit must be an integer from 1 to 100');
  let references: string[] | undefined;
  if (body.references !== undefined) {
    if (!Array.isArray(body.references) || !body.references.length || body.references.length > 8) invalidRequest('references must contain 1 to 8 names or aliases');
    references = body.references.map((v: unknown) => {
      const text = boundedText(v, 'reference', 120);
      if (!canonical(text)) invalidRequest('reference must contain letters or numbers');
      return text;
    });
  }
  const raw = body.selections ?? [];
  if (!Array.isArray(raw) || raw.length > 8) invalidRequest('selections must contain at most 8 entries');
  const seen = new Set<string>();
  const selections = raw.map((s: any) => {
    if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).some(k => !['reference','personId'].includes(k))) invalidRequest('Invalid selection');
    const reference = boundedText(s.reference, 'selection.reference', 120);
    const key = canonical(reference);
    if (!key || seen.has(key)) invalidRequest('Selection references must be distinct');
    seen.add(key);
    return { reference, personId: uuid(s.personId, 'selection.personId') };
  });
  return { query, assetId, limit, references, selections };
}

export function resolveReferences(query: string, people: KnownPerson[], explicit?: string[],
  selections: IdentitySearchInput['selections'] = []): PersonReference[] {
  const text = canonical(query);
  const labels = new Map<string, KnownPerson[]>();
  const add = (label: string, person: KnownPerson) => {
    const key = canonical(label);
    if (!key) return;
    const list = labels.get(key) ?? [];
    if (!list.some(p => p.id === person.id)) list.push(person);
    labels.set(key, list);
  };
  for (const person of people) for (const label of [person.name, ...person.aliases]) add(label, person);
  // Personal pronouns are reserved for the explicitly selected self profile.
  const selves = people.filter(p => p.isMe);
  for (const label of ['me','i','myself']) labels.set(label, selves);
  let references = explicit?.map(canonical);
  if (!references) {
    const candidates: Array<{ key: string; start: number; end: number }> = [];
    for (const key of labels.keys()) {
      if (['me','i','myself'].includes(key)) continue;
      const padded = ` ${text} `;
      let offset = 0;
      while ((offset = padded.indexOf(` ${key} `, offset)) >= 0) {
        candidates.push({ key, start: offset, end: offset + key.length + 1 });
        offset++;
      }
    }
    // Longer names take precedence over nested labels, e.g. Ann within Ann Marie.
    const picked: typeof candidates = [];
    for (const item of candidates.sort((a,b) => b.key.length - a.key.length || a.start - b.start)) {
      if (!picked.some(p => item.start < p.end && item.end > p.start)) picked.push(item);
    }
    references = picked.sort((a,b) => a.start - b.start).map(p => p.key);
    if (/\b(?:where|when) i (?:was|am|appear|appeared|talk|talked|spoke|met)\b/.test(text) ||
        /\bme (?:with|and|talking|speaking|standing|sitting)\b|\b(?:with|and|of|showing|featuring) me\b|\bmyself\b/.test(text) || text === 'me') {
      references.push('me');
    }
    // Unknown relationships must not disappear just because nobody has taught them yet.
    for (const match of text.matchAll(/\bmy (?:uncle|aunt|mother|father|mom|mum|dad|brother|sister|cousin|wife|husband|friend|son|daughter|grandmother|grandfather)\b/g)) {
      const relationshipStart = match.index! + 3;
      if (!picked.some(p => p.start <= relationshipStart && p.end > relationshipStart)) references.push(match[0]);
    }
  }
  const resolved = [...new Set(references)].map(reference => {
    const matches = labels.get(reference) ?? (reference.startsWith('my ') ? labels.get(reference.slice(3)) : undefined) ?? [];
    const selected = selections.find(s => canonical(s.reference) === reference);
    if (selected && !matches.some(p => p.id === selected.personId)) invalidRequest('Selected person is not an owned candidate for that reference');
    return { reference, candidates: matches.map(({id,name}) => ({id,name})),
      personId: selected?.personId ?? (matches.length === 1 ? matches[0].id : undefined) };
  });
  if (selections.some(s => !resolved.some(r => r.reference === canonical(s.reference)))) invalidRequest('Selection does not match a reference in this search');
  return resolved;
}

// Start-boundary sweep: intersect each person's union of confirmed ranges, then
// merge overlapping intersections. Rejected tags and other owners never participate.
export const confirmedOverlapSql = `WITH eligible AS MATERIALIZED (
  SELECT a.asset_id, a.person_id, a.start_s, a.end_s FROM person_appearances a
  JOIN people p ON p.id=a.person_id AND p.user_id=a.user_id
  JOIN media_assets m ON m.id=a.asset_id AND m.user_id=a.user_id
  WHERE a.user_id=$1 AND a.person_id=ANY($2::uuid[]) AND a.status='confirmed' AND a.origin IN ('manual','face_match')
    AND ($3::text IS NULL OR a.asset_id=$3) AND a.end_s<=m.duration
    AND (m.availability IS NULL OR m.availability!='offline')
), anchors AS (SELECT DISTINCT asset_id,start_s FROM eligible), intersections AS (
  SELECT b.asset_id,b.start_s,min(active.end_s) AS end_s FROM anchors b
  CROSS JOIN LATERAL (
    SELECT e.person_id,max(e.end_s) AS end_s FROM eligible e
    WHERE e.asset_id=b.asset_id AND e.start_s<=b.start_s AND e.end_s>b.start_s GROUP BY e.person_id
  ) active GROUP BY b.asset_id,b.start_s HAVING count(*)=$4
), prior AS (
  SELECT *,max(end_s) OVER(PARTITION BY asset_id ORDER BY start_s ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS previous_end FROM intersections
), islands AS (
  SELECT *,sum(CASE WHEN previous_end IS NULL OR start_s>previous_end THEN 1 ELSE 0 END)
    OVER(PARTITION BY asset_id ORDER BY start_s) AS island FROM prior
), moments AS (
  SELECT asset_id,min(start_s) AS start_s,max(end_s) AS end_s FROM islands GROUP BY asset_id,island
) SELECT r.*,m.original_filename FROM moments r JOIN media_assets m ON m.id=r.asset_id AND m.user_id=$1
  ORDER BY r.asset_id,r.start_s LIMIT $5`;
