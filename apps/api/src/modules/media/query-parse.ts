export type QueryIntent = 'spoken' | 'visual' | 'mixed';

export interface ParsedSearchQuery {
  raw: string;
  cleaned: string;
  phrases: string[];
  contentTerms: string[];
  andTsQuery: string | null;
  orTsQuery: string | null;
  intent: QueryIntent;
  primaryModifier: string | null;
  headTerm: string | null;
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
  'us',
  'our',
  'ours',
  'they',
  'them',
  'their',
  'theirs',
  'he',
  'him',
  'his',
  'she',
  'her',
  'hers',
  'it',
  'its',
  'gallery',
  'library',
  'collection',
  'want',
  'need',
  'exact',
  'timestamp',
  'timestamps',
]);

const SPOKEN_PATTERNS = /\b(said|talked|mention(ed|s)?|quote|phrase|spoken|words|discussed|discussing|explain(ed|s|ing)?|speech|conversation|saying)\b/i;
const VISUAL_PATTERNS = /\b(wearing|holding|carrying|standing|walking|running|sitting|dressed|car|vehicle|screen|shirt|red|blue|green|black|white|shoes|jacket|celebrat(ing|ion)|gesture|background|diagram|slide|illustration|graphic|appearance|looks like|seen)\b/i;

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectQueryIntent(raw: string): QueryIntent {
  const isSpoken = SPOKEN_PATTERNS.test(raw);
  const isVisual = VISUAL_PATTERNS.test(raw);
  if (isSpoken && !isVisual) return 'spoken';
  if (isVisual && !isSpoken) return 'visual';
  return 'mixed';
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  let working = raw.trim();
  const intent = detectQueryIntent(working);
  const phrases: string[] = [];

  working = working.replace(/["“”']([^"“”']+)["“”']/g, (_, phrase: string) => {
    const normalized = normalizeSpeech(phrase);
    if (normalized) phrases.push(normalized);
    return ' ';
  });

  // Strip conversational / meta instruction clauses (e.g. "i want the exact timestamps", "give me the timestamp")
  working = working.replace(
    /\b(i\s+)?(want|need|give\s+me|show\s+me|tell\s+me|get\s+me)\s+(the\s+)?(exact\s+)?(timestamps?|times?|duration|seconds?|minutes?|intervals?)\b/gi,
    ' ',
  );
  working = working.replace(/\b(exact\s+)?timestamps?\b/gi, ' ');

  // Strip library / location scoping directives (e.g. "from my library", "in my gallery", "across my videos")
  working = working.replace(
    /\b(from|in|within|inside|across|out\s+of)\s+(my|the|our)?\s*(library|gallery|collection|videos?|clips?|files?|storage)\b/gi,
    ' ',
  );

  // Strip conversational politeness and assistant prefixes
  working = working.replace(/\b(can\s+you|could\s+you|would\s+you|please|hey\s+ai|assistant)\b/gi, ' ');

  working = working.replace(/[-–—]/g, ' ');
  working = working.replace(
    /^(find(\s+me)?|show(\s+me)?|tell(\s+me)?|look(\s+for)?|search(\s+for)?)\s+/i,
    ' ',
  );
  // Strip generic filler wrappers like "a clip of", "the scene where", or trailing "clip/video"
  working = working.replace(/\b(a|the)\s+(moment|part|clip|scene|video|footage)\s+(where|when|of|about)\b/gi, ' ');
  working = working.replace(/\b(moment|moments|part|parts|clip|clips|scene|scenes|video|videos|footage)\b/gi, ' ');
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

  let primaryModifier: string | null = null;
  let headTerm: string | null = null;
  if (contentTerms.length >= 2) {
    primaryModifier = contentTerms[0];
    headTerm = contentTerms[contentTerms.length - 1];
  } else if (contentTerms.length === 1) {
    primaryModifier = contentTerms[0];
  }

  return {
    raw,
    cleaned,
    phrases,
    contentTerms,
    andTsQuery,
    orTsQuery,
    intent,
    primaryModifier,
    headTerm,
  };
}
