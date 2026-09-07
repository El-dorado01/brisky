export interface ParsedSearchQuery {
  raw: string;
  cleaned: string;
  phrases: string[];
  contentTerms: string[];
  andTsQuery: string | null;
  orTsQuery: string | null;
}

const STOP = new Set([
  'find',
  'me',
  'a',
  'an',
  'the',
  'moment',
  'moments',
  'where',
  'when',
  'is',
  'are',
  'was',
  'were',
  'mentioned',
  'mention',
  'mentions',
  'show',
  'tell',
  'please',
  'looking',
  'look',
  'for',
  'part',
  'clip',
  'video',
  'scene',
  'that',
  'this',
  'of',
  'in',
  'on',
  'to',
  'and',
  'or',
  'my',
  'your',
  'any',
  'some',
  'about',
  'talks',
  'talk',
  'talking',
  'says',
  'said',
  'speaking',
  'with',
  'from',
  'into',
  'there',
  'here',
  'can',
  'you',
  'i',
  'we',
  'they',
  'gallery',
  'library',
  'collection',
]);

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  let working = raw.trim();
  const phrases: string[] = [];

  working = working.replace(/["“”']([^"“”']+)["“”']/g, (_, phrase: string) => {
    const normalized = normalizeSpeech(phrase);
    if (normalized) phrases.push(normalized);
    return ' ';
  });

  working = working.replace(/[-–—]/g, ' ');
  working = working.replace(
    /^(find(\s+me)?|show(\s+me)?|tell(\s+me)?|look(\s+for)?|search(\s+for)?)\s+/i,
    ' ',
  );
  working = working.replace(/\b(a|the)\s+(moment|part|clip|scene|video)\s+(where|when|of)\b/gi, ' ');
  working = working.replace(/\b(is|are|was)\s+mentioned\b/gi, ' ');
  working = working.replace(/\bwhere\b/gi, ' ');

  const cleaned = normalizeSpeech(working);
  const contentTerms = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));

  if (phrases.length === 0 && contentTerms.length >= 2 && contentTerms.length <= 8) {
    phrases.push(contentTerms.join(' '));
  }

  const cleanedTerms = contentTerms
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  const andTsQuery =
    cleanedTerms.length > 0
      ? cleanedTerms.map((t) => `${t}:*`).join(' & ')
      : null;

  const orTsQuery =
    cleanedTerms.length > 0
      ? cleanedTerms.map((t) => `${t}:*`).join(' | ')
      : null;

  return { raw, cleaned, phrases, contentTerms, andTsQuery, orTsQuery };
}
