import { TranscriptCue } from '../pipeline/pipeline.types';

export interface BenchmarkQuery {
  id: string;
  type: 'visual' | 'spoken' | 'mixed';
  query: string;
  expectedStartTime: number;
  expectedEndTime: number;
}

export interface BenchmarkSegmentInput {
  startTime: number;
  endTime: number;
  title?: string;
  description?: string;
  visualObjects?: string[];
  actions?: string[];
  transcriptText?: string;
  onScreenText?: string[];
}

const FIXTURES: Record<string, BenchmarkQuery[]> = {
  'you-must-continue-your-journey.mp4': [
    { id: 'Q1', type: 'spoken', query: 'my time has come', expectedStartTime: 4.2, expectedEndTime: 6.2 },
    { id: 'Q2', type: 'spoken', query: 'continue your journey without me', expectedStartTime: 8.5, expectedEndTime: 12.0 },
    { id: 'Q3', type: 'spoken', query: 'Good', expectedStartTime: 0, expectedEndTime: 1.8 },
    { id: 'Q4', type: 'visual', query: 'turtle character looking at cherry blossoms', expectedStartTime: 0, expectedEndTime: 6 },
    { id: 'Q5', type: 'visual', query: 'text overlay about college or mobile data', expectedStartTime: 0, expectedEndTime: 5 },
    { id: 'Q6', type: 'visual', query: 'panda appearing beside the turtle', expectedStartTime: 7.5, expectedEndTime: 13 },
    { id: 'Q7', type: 'mixed', query: 'turtle saying goodbye and fading away', expectedStartTime: 7, expectedEndTime: 13 },
    { id: 'Q8', type: 'mixed', query: 'you must continue your journey', expectedStartTime: 8.5, expectedEndTime: 13 },
  ],
  '10-over-10.mp4': [
    { id: 'Q1', type: 'spoken', query: 'happy new year', expectedStartTime: 14.2, expectedEndTime: 17.6 },
    { id: 'Q2', type: 'spoken', query: "you don't seem that happy that you've won", expectedStartTime: 7.8, expectedEndTime: 9.5 },
    { id: 'Q3', type: 'spoken', query: "it can't go on like this", expectedStartTime: 23.3, expectedEndTime: 25.0 },
    { id: 'Q4', type: 'visual', query: 'Cristiano Ronaldo looking serious', expectedStartTime: 3, expectedEndTime: 7 },
    { id: 'Q5', type: 'visual', query: 'Jamie Carragher studio analysis', expectedStartTime: 34, expectedEndTime: 39 },
    { id: 'Q6', type: 'visual', query: 'Zlatan Ibrahimovic on the sidelines', expectedStartTime: 27, expectedEndTime: 31 },
    { id: 'Q7', type: 'mixed', query: 'Pep Guardiola saying he is happy', expectedStartTime: 11, expectedEndTime: 18 },
    { id: 'Q8', type: 'mixed', query: 'player crying or emotional tears', expectedStartTime: 31, expectedEndTime: 34 },
  ],
};

export function getBenchmarkQueries(
  originalFilename: string,
  transcript: TranscriptCue[],
  duration: number,
  segments: BenchmarkSegmentInput[] = [],
): BenchmarkQuery[] {
  const lower = originalFilename.toLowerCase();
  const fixtureKey = Object.keys(FIXTURES).find(
    (key) => lower.includes(key.replace('.mp4', '')) || lower.endsWith(key),
  );
  if (fixtureKey) return FIXTURES[fixtureKey];

  // Helper to clean and format query strings
  const clean = (text: string, maxWords = 8): string => {
    return text
      .replace(/[^\w\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, maxWords)
      .join(' ');
  };

  // Helper to ensure window has non-zero duration
  const makeWindow = (start: number, end: number) => {
    const s = Math.max(0, Number(start.toFixed(1)));
    const e = Math.min(duration || 9999, Math.max(s + 1.5, Number(end.toFixed(1))));
    return { start: s, end: e };
  };

  // --- 1. SPOKEN QUERIES (3) ---
  const spoken: BenchmarkQuery[] = [];
  const spokenCandidates: Array<{ text: string; start: number; end: number }> = [];

  for (const cue of transcript || []) {
    const words = (cue.text || '').trim().split(/\s+/);
    if (words.length >= 3) {
      spokenCandidates.push({
        text: clean(cue.text),
        start: cue.start_time,
        end: cue.end_time,
      });
    }
  }

  if (spokenCandidates.length < 3) {
    for (const seg of segments) {
      if (seg.transcriptText && seg.transcriptText.trim().split(/\s+/).length >= 3) {
        spokenCandidates.push({
          text: clean(seg.transcriptText),
          start: seg.startTime,
          end: seg.endTime,
        });
      }
    }
  }

  // Pick up to 3 distinct spoken moments across the video timeline
  if (spokenCandidates.length > 0) {
    spokenCandidates.sort((a, b) => a.start - b.start);
    const step = Math.max(1, Math.floor(spokenCandidates.length / 3));
    for (let i = 0; i < spokenCandidates.length && spoken.length < 3; i += step) {
      const cand = spokenCandidates[i];
      const win = makeWindow(cand.start, cand.end);
      spoken.push({
        id: `Q${spoken.length + 1}`,
        type: 'spoken',
        query: cand.text,
        expectedStartTime: win.start,
        expectedEndTime: win.end,
      });
    }
  }

  // Fallbacks if fewer than 3 spoken dialogue cues exist
  while (spoken.length < 3) {
    const idx = spoken.length;
    const ocrSeg = segments.find(
      (s) => s.onScreenText && s.onScreenText.length > 0 && clean(s.onScreenText[0]),
    );
    if (ocrSeg && ocrSeg.onScreenText && ocrSeg.onScreenText[0]) {
      const win = makeWindow(ocrSeg.startTime, ocrSeg.endTime);
      spoken.push({
        id: `Q${idx + 1}`,
        type: 'spoken',
        query: clean(ocrSeg.onScreenText[0]),
        expectedStartTime: win.start,
        expectedEndTime: win.end,
      });
    } else {
      const seg = segments[idx % Math.max(1, segments.length)] || {
        startTime: idx * 3,
        endTime: (idx + 1) * 3,
        title: 'scene segment',
      };
      const win = makeWindow(seg.startTime, seg.endTime);
      spoken.push({
        id: `Q${idx + 1}`,
        type: 'spoken',
        query: seg.title ? clean(seg.title) : `dialogue near ${win.start}s`,
        expectedStartTime: win.start,
        expectedEndTime: win.end,
      });
    }
  }

  // --- 2. VISUAL QUERIES (3) ---
  const visual: BenchmarkQuery[] = [];
  const visualCandidates = [...segments].sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < visualCandidates.length && visual.length < 3; i++) {
    const seg = visualCandidates[i];
    let queryText = '';

    if (seg.visualObjects && seg.visualObjects.length > 0 && seg.actions && seg.actions.length > 0) {
      queryText = `${seg.visualObjects[0]} ${seg.actions[0]}`;
    } else if (seg.visualObjects && seg.visualObjects.length >= 2) {
      queryText = `${seg.visualObjects[0]} and ${seg.visualObjects[1]}`;
    } else if (seg.visualObjects && seg.visualObjects.length === 1) {
      queryText = seg.visualObjects[0];
    } else if (seg.description) {
      queryText = clean(seg.description, 6);
    } else if (seg.title) {
      queryText = clean(seg.title, 5);
    }

    if (queryText) {
      const win = makeWindow(seg.startTime, seg.endTime);
      visual.push({
        id: `Q${visual.length + 4}`,
        type: 'visual',
        query: queryText,
        expectedStartTime: win.start,
        expectedEndTime: win.end,
      });
    }
  }

  while (visual.length < 3) {
    const idx = visual.length;
    const seg = segments[idx % Math.max(1, segments.length)] || {
      startTime: Math.max(0, (duration / 4) * idx),
      endTime: Math.min(duration, (duration / 4) * (idx + 1)),
      description: 'visual moment',
    };
    const win = makeWindow(seg.startTime, seg.endTime);
    visual.push({
      id: `Q${idx + 4}`,
      type: 'visual',
      query: seg.description ? clean(seg.description, 5) : 'visual scene',
      expectedStartTime: win.start,
      expectedEndTime: win.end,
    });
  }

  // --- 3. MIXED QUERIES (2) ---
  const mixed: BenchmarkQuery[] = [];
  const mixedCandidates = segments.filter(
    (s) =>
      (s.transcriptText || (s.onScreenText && s.onScreenText.length > 0)) &&
      (s.description || (s.visualObjects && s.visualObjects.length > 0)),
  );

  for (let i = 0; i < mixedCandidates.length && mixed.length < 2; i++) {
    const seg = mixedCandidates[i];
    const visualPart =
      (seg.visualObjects && seg.visualObjects[0]) ||
      (seg.description ? clean(seg.description, 3) : 'person');
    const spokenPart =
      seg.transcriptText
        ? clean(seg.transcriptText, 4)
        : seg.onScreenText && seg.onScreenText[0]
        ? clean(seg.onScreenText[0], 4)
        : '';

    const queryText = spokenPart ? `${visualPart} saying ${spokenPart}` : visualPart;
    const win = makeWindow(seg.startTime, seg.endTime);
    mixed.push({
      id: `Q${mixed.length + 7}`,
      type: 'mixed',
      query: queryText,
      expectedStartTime: win.start,
      expectedEndTime: win.end,
    });
  }

  while (mixed.length < 2) {
    const idx = mixed.length;
    const seg = segments[(idx + 1) % Math.max(1, segments.length)] || {
      startTime: Math.max(0, duration * 0.4),
      endTime: Math.min(duration, duration * 0.7),
      title: 'key moment',
    };
    const win = makeWindow(seg.startTime, seg.endTime);
    const qText = seg.title
      ? `${clean(seg.title, 4)} scene`
      : `important scene near ${win.start}s`;
    mixed.push({
      id: `Q${idx + 7}`,
      type: 'mixed',
      query: qText,
      expectedStartTime: win.start,
      expectedEndTime: win.end,
    });
  }

  return [...spoken, ...visual, ...mixed];
}
