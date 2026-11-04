export type Modality = "speech" | "visual" | "cross-modal";

export type OutputFormat = {
  id: "summary" | "reel" | "quotes" | "timeline" | "edl";
  label: string;
  tagline: string;
  badge: string;
};

export const outputFormats: OutputFormat[] = [
  {
    id: "summary",
    label: "Synthesis brief",
    tagline: "Structured brief with timestamp citations across every connected moment.",
    badge: "Document",
  },
  {
    id: "quotes",
    label: "Quote sheet",
    tagline: "Verbatim pull-quotes with speaker, file, and exact timecode.",
    badge: "Transcript",
  },
  {
    id: "timeline",
    label: "Storyline & chapters",
    tagline: "Chronological narrative outline connecting moments across files.",
    badge: "Outline",
  },
  {
    id: "reel",
    label: "Rough cut reel",
    tagline: "Stitched clip sequence in collection order, ready to preview or export.",
    badge: "Video",
  },
  {
    id: "edl",
    label: "Timeline export",
    tagline: "FCPXML / Premiere XML / DaVinci EDL linked to your original Drive files.",
    badge: "NLE",
  },
];

export type SearchMoment = {
  id: string;
  label: string;
  file: string;
  folder: string;
  source: string;
  start: string;
  end: string;
  durationSec: number;
  totalDuration: string;
  seekPct: number;
  score: number;
  modality: Modality;
  speaker?: string;
  transcript: string;
  visualNote: string;
  reasoning: string;
  tags: string[];
};

export const sampleMoments: SearchMoment[] = [
  {
    id: "m-1",
    label: "Q4 budget rebalance keynote",
    file: "q3-offsite-keynote.mp4",
    folder: "/Brand/Events/2026",
    source: "Google Drive",
    start: "00:14:32",
    end: "00:15:04",
    durationSec: 32,
    totalDuration: "42:18",
    seekPct: 34,
    score: 97,
    modality: "cross-modal",
    speaker: "Maya Lin (VP Product)",
    transcript:
      "“…if we don't rethink the Q4 budget before March, we're locking ourselves into last year's distribution plan while enterprise demand is doubling…”",
    visualNote: "Medium shot at podium; slide behind reads '2026 Allocation — Rebalance'.",
    reasoning: "Matched spoken phrase 'rethink the budget' + slide title 'Allocation — Rebalance'.",
    tags: ["Budget", "Q4 planning", "Keynote"],
  },
  {
    id: "m-2",
    label: "Northwind pricing & workflow",
    file: "customer-call-northwind.mp4",
    folder: "/Clients/Calls",
    source: "Google Drive",
    start: "00:08:19",
    end: "00:08:51",
    durationSec: 32,
    totalDuration: "28:40",
    seekPct: 29,
    score: 94,
    modality: "speech",
    speaker: "Devon Brooks (Northwind)",
    transcript:
      "“…pricing wasn't the blocker for our team — it was having to pull clips, quotes, and a written brief from forty hours of raw interviews every sprint…”",
    visualNote: "Split-screen Zoom call; participant nods while screen-sharing a spreadsheet.",
    reasoning: "High semantic match on budget/pricing and multi-output workflow pain point.",
    tags: ["Customer quote", "Pricing", "Workflow"],
  },
  {
    id: "m-3",
    label: "Indexing moments vs. tape",
    file: "podcast-ep-40-master.wav",
    folder: "/Podcast/Episodes",
    source: "Google Drive",
    start: "00:52:11",
    end: "00:52:49",
    durationSec: 38,
    totalDuration: "01:08:12",
    seekPct: 76,
    score: 91,
    modality: "speech",
    speaker: "Host & Guest",
    transcript:
      "“…the first prototype failed because we treated video like tape to cut instead of knowledge to query. Once we indexed the moments, everything else clicked…”",
    visualNote: "Audio-only master track · 48 kHz stereo waveform.",
    reasoning: "Spoken narrative on indexing moments vs. traditional video editing.",
    tags: ["Origin story", "Podcast", "Highlight"],
  },
  {
    id: "m-4",
    label: "Golden-hour basalt coastline",
    file: "brand-shoot-coastline-03.mov",
    folder: "/Brand/B-roll",
    source: "Google Drive",
    start: "00:02:08",
    end: "00:02:27",
    durationSec: 19,
    totalDuration: "06:15",
    seekPct: 34,
    score: 89,
    modality: "visual",
    transcript: "(No speech — ambient wind and ocean surf)",
    visualNote: "Wide aerial drone shot sweeping over basalt cliffs at golden hour; warm rim light.",
    reasoning: "Visual scene embedding matched golden-hour coastline B-roll.",
    tags: ["B-roll", "Aerial", "Golden hour"],
  },
  {
    id: "m-5",
    label: "Live scene-from-memory demo",
    file: "product-demo-walkthrough.mp4",
    folder: "/Clients/Demos",
    source: "Google Drive",
    start: "00:31:47",
    end: "00:32:12",
    durationSec: 25,
    totalDuration: "39:05",
    seekPct: 81,
    score: 87,
    modality: "cross-modal",
    speaker: "Room audio",
    transcript:
      "“…watch what happens when I just describe the scene from memory — boom, exact second. [room laughs] That used to take our producer a whole afternoon…”",
    visualNote: "Live screen demo; audience reaction in studio row.",
    reasoning: "Matched laughter audio cue + live search demonstration on screen.",
    tags: ["Demo reaction", "Proof point", "Social cut"],
  },
  {
    id: "m-6",
    label: "Q1 agency retainer reallocation",
    file: "exec-debrief-day2.mp4",
    folder: "/Brand/Events/2026",
    source: "Google Drive",
    start: "00:19:05",
    end: "00:19:39",
    durationSec: 34,
    totalDuration: "24:50",
    seekPct: 77,
    score: 84,
    modality: "speech",
    speaker: "Jonas V.",
    transcript:
      "“…so the takeaway for Q1 is simple: cut the agency retainer by thirty percent and put that budget straight into self-serve onboarding…”",
    visualNote: "Roundtable discussion in glass conference room; whiteboard notes visible.",
    reasoning: "Direct decision statement referencing budget reallocation.",
    tags: ["Decision", "Budget", "Q1 takeaway"],
  },
];

