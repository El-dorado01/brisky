export interface UserIdentity {
  id: string;
  name: string;
  email: string;
  handle: string;
  role: string;
  initials: string;
  aliases: string[];
  faceSamplesCount: number;
  voiceStatus: string;
  verifiedSince: string;
}

export interface PersonEntity {
  id: string;
  name: string;
  relationship: string;
  category: "person";
  aliases: string[];
  momentsCount: number;
  videosCount: number;
  lastSeen: string;
  faceColor: string;
  verified: boolean;
  notes?: string;
}

export interface ThingEntity {
  id: string;
  name: string;
  type: "object" | "place" | "prop";
  categoryLabel: string;
  aliases: string[];
  momentsCount: number;
  videosCount: number;
  lastSeen: string;
  color: string;
  description: string;
}

export interface UnlabeledCluster {
  id: string;
  kind: "face" | "object" | "place";
  suggestedRole: string;
  appearanceCount: number;
  videoCount: number;
  previewLabel: string;
  confidence: number;
  quickTags: string[];
  firstSeen: string;
  color: string;
}

export const defaultUserIdentity: UserIdentity = {
  id: "user-amara",
  name: "Amara Okafor",
  email: "amara@example.com",
  handle: "@amara",
  role: "Host & Creator (Me)",
  initials: "AO",
  aliases: ["Amara", "Me", "I", "Host"],
  faceSamplesCount: 24,
  voiceStatus: "Active voiceprint (Whisper Speaker 0)",
  verifiedSince: "Sep 2026",
};

export const defaultPeople: PersonEntity[] = [
  {
    id: "person-uncle-dave",
    name: "Uncle Dave",
    relationship: "Family · Uncle",
    category: "person",
    aliases: ["Uncle Dave", "Uncle", "Dave", "David"],
    momentsCount: 38,
    videosCount: 6,
    lastSeen: "Today · Oct 30",
    faceColor: "#7363de",
    verified: true,
    notes: "Appears frequently in holiday gatherings, family discussions, and Sunday cookouts.",
  },
  {
    id: "person-sarah-chen",
    name: "Sarah Chen",
    relationship: "Colleague · Lead Producer",
    category: "person",
    aliases: ["Sarah", "Producer Sarah", "Chen"],
    momentsCount: 64,
    videosCount: 11,
    lastSeen: "Yesterday · 4:15 PM",
    faceColor: "#3fd1c0",
    verified: true,
    notes: "Show producer, manages tech demo walkthroughs and control room communications.",
  },
  {
    id: "person-marcus-vance",
    name: "Marcus Vance",
    relationship: "Guest · Founder & CEO",
    category: "person",
    aliases: ["Marcus", "Vance", "Mr. Vance"],
    momentsCount: 19,
    videosCount: 2,
    lastSeen: "Oct 24, 2026",
    faceColor: "#f5a93e",
    verified: true,
    notes: "Keynote guest on the AI infrastructure podcast special.",
  },
  {
    id: "person-elena-rostova",
    name: "Elena Rostova",
    relationship: "Crew · Director of Photography",
    category: "person",
    aliases: ["Elena", "DP", "Camera Elena"],
    momentsCount: 27,
    videosCount: 5,
    lastSeen: "Oct 22, 2026",
    faceColor: "#9b8cf2",
    verified: true,
    notes: "Behind-the-scenes camera coordinator and lighting advisor.",
  },
  {
    id: "person-kai-tanaka",
    name: "Kai Tanaka",
    relationship: "Collaborator · Sound Engineer",
    category: "person",
    aliases: ["Kai", "Audio Kai"],
    momentsCount: 14,
    videosCount: 3,
    lastSeen: "Oct 19, 2026",
    faceColor: "#3fbf7a",
    verified: true,
    notes: "Assists with boom mic placement and multi-track audio leveling.",
  },
  {
    id: "person-aris-thorne",
    name: "Dr. Aris Thorne",
    relationship: "Interviewee · Tech Historian",
    category: "person",
    aliases: ["Aris", "Dr. Thorne", "Historian"],
    momentsCount: 21,
    videosCount: 2,
    lastSeen: "Oct 15, 2026",
    faceColor: "#e67e22",
    verified: true,
    notes: "Featured in the archive episode on early digital video encoding.",
  },
];

export const defaultThings: ThingEntity[] = [
  {
    id: "thing-red-strat",
    name: "Red Vintage Stratocaster",
    type: "object",
    categoryLabel: "Musical Instrument",
    aliases: ["red guitar", "vintage strat", "the fender", "electric guitar"],
    momentsCount: 31,
    videosCount: 7,
    lastSeen: "Oct 29, 2026",
    color: "#e15b5b",
    description: "Fiesta Red electric guitar with aged maple neck hanging on the acoustic studio wall.",
  },
  {
    id: "thing-shure-sm7b",
    name: "Shure SM7B Mic Rig",
    type: "object",
    categoryLabel: "Audio Equipment",
    aliases: ["the podcast mic", "desk mic", "sm7b", "shure mic"],
    momentsCount: 58,
    videosCount: 12,
    lastSeen: "Yesterday",
    color: "#22283f",
    description: "Matte black dynamic broadcast microphone mounted on the articulating boom arm.",
  },
  {
    id: "thing-kitchen-island",
    name: "Kitchen Studio Island",
    type: "place",
    categoryLabel: "Filming Location",
    aliases: ["kitchen set", "the island", "cooking counter", "kitchen"],
    momentsCount: 42,
    videosCount: 8,
    lastSeen: "Oct 26, 2026",
    color: "#6b7190",
    description: "White waterfall marble island with warm wooden stools and soft pendant lights.",
  },
  {
    id: "thing-alpha-prototype",
    name: "Project Alpha Hardware Prototype",
    type: "prop",
    categoryLabel: "Product Unit",
    aliases: ["the prototype", "demo unit", "alpha device", "hardware model"],
    momentsCount: 16,
    videosCount: 3,
    lastSeen: "Oct 23, 2026",
    color: "#7363de",
    description: "Titanium prototype device with circular tactile encoder and OLED readout.",
  },
];

export const defaultUnlabeledClusters: UnlabeledCluster[] = [
  {
    id: "cluster-104",
    kind: "face",
    suggestedRole: "Frequent dialogue partner with Amara",
    appearanceCount: 41,
    videoCount: 7,
    previewLabel: "Man in navy cardigan & horn-rimmed glasses",
    confidence: 96,
    quickTags: ["Uncle Dave", "Brother", "Cousin Leo"],
    firstSeen: "Sep 12, 2026",
    color: "#7363de",
  },
  {
    id: "cluster-109",
    kind: "face",
    suggestedRole: "Co-host speaker in Episode 4 & 5",
    appearanceCount: 28,
    videoCount: 4,
    previewLabel: "Woman with natural curls & bright yellow blazer",
    confidence: 93,
    quickTags: ["Maya", "Guest Co-host", "Zainab"],
    firstSeen: "Sep 28, 2026",
    color: "#3fd1c0",
  },
  {
    id: "cluster-112",
    kind: "face",
    suggestedRole: "Behind-the-scenes audio assistant",
    appearanceCount: 15,
    videoCount: 3,
    previewLabel: "Man with headphones & gray studio hoodie",
    confidence: 88,
    quickTags: ["Tariq", "Boom Operator", "Intern"],
    firstSeen: "Oct 04, 2026",
    color: "#f5a93e",
  },
  {
    id: "cluster-203",
    kind: "object",
    suggestedRole: "Recurring electronic console on table",
    appearanceCount: 19,
    videoCount: 3,
    previewLabel: "Silver audio interface with glowing volume dial",
    confidence: 91,
    quickTags: ["Audio Mixer", "Apollo Twin", "DAC"],
    firstSeen: "Oct 08, 2026",
    color: "#9b8cf2",
  },
  {
    id: "cluster-205",
    kind: "place",
    suggestedRole: "Outdoor rooftop set with skyline",
    appearanceCount: 12,
    videoCount: 2,
    previewLabel: "Brick terrace with sunset city skyline",
    confidence: 86,
    quickTags: ["Rooftop Set", "Brooklyn Balcony"],
    firstSeen: "Oct 14, 2026",
    color: "#3fbf7a",
  },
  {
    id: "cluster-115",
    kind: "face",
    suggestedRole: "Speaker during tech workshop Q&A",
    appearanceCount: 9,
    videoCount: 1,
    previewLabel: "Woman in denim jacket asking question",
    confidence: 87,
    quickTags: ["Audience Member", "Student"],
    firstSeen: "Oct 18, 2026",
    color: "#e67e22",
  },
  {
    id: "cluster-208",
    kind: "object",
    suggestedRole: "Cinema camera body on motorized slider",
    appearanceCount: 14,
    videoCount: 4,
    previewLabel: "Matte black cinema rig with monitor hood",
    confidence: 89,
    quickTags: ["B-Cam", "Slider Camera", "FX6"],
    firstSeen: "Oct 20, 2026",
    color: "#22283f",
  },
  {
    id: "cluster-118",
    kind: "face",
    suggestedRole: "Guest in green jacket at studio lounge",
    appearanceCount: 7,
    videoCount: 1,
    previewLabel: "Young man in olive bomber jacket",
    confidence: 83,
    quickTags: ["Visitor", "Intern"],
    firstSeen: "Oct 25, 2026",
    color: "#7363de",
  },
];

const PEOPLE_STORAGE_KEY = "brisky_custom_people";
const THINGS_STORAGE_KEY = "brisky_custom_things";

export function getCustomPeople(): PersonEntity[] {
  if (typeof window === "undefined") return defaultPeople;
  try {
    const raw = localStorage.getItem(PEOPLE_STORAGE_KEY);
    if (!raw) return defaultPeople;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultPeople;
  } catch {
    return defaultPeople;
  }
}

export function saveCustomPeople(people: PersonEntity[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people));
  } catch {}
}

export function getCustomThings(): ThingEntity[] {
  if (typeof window === "undefined") return defaultThings;
  try {
    const raw = localStorage.getItem(THINGS_STORAGE_KEY);
    if (!raw) return defaultThings;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultThings;
  } catch {
    return defaultThings;
  }
}

export function saveCustomThings(things: ThingEntity[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THINGS_STORAGE_KEY, JSON.stringify(things));
  } catch {}
}

export function addCustomEntity(
  entity: ({ category: "person" } & Omit<PersonEntity, "category">) | ({ category: "thing" } & Omit<ThingEntity, "type" | "categoryLabel"> & { type?: "object" | "place" | "prop"; categoryLabel?: string })
): void {
  if (entity.category === "person") {
    const current = getCustomPeople();
    const newPerson: PersonEntity = {
      id: entity.id || `person-${Date.now()}`,
      name: entity.name,
      relationship: entity.relationship,
      category: "person",
      aliases: entity.aliases,
      momentsCount: entity.momentsCount || 0,
      videosCount: entity.videosCount || 0,
      lastSeen: entity.lastSeen || "Just now",
      faceColor: entity.faceColor || "#7363de",
      verified: true,
      notes: entity.notes,
    };
    saveCustomPeople([newPerson, ...current]);
  } else {
    const current = getCustomThings();
    const newThing: ThingEntity = {
      id: entity.id || `thing-${Date.now()}`,
      name: entity.name,
      type: entity.type || "object",
      categoryLabel: entity.categoryLabel || "Custom Entity",
      aliases: entity.aliases,
      momentsCount: entity.momentsCount || 0,
      videosCount: entity.videosCount || 0,
      lastSeen: entity.lastSeen || "Just now",
      color: entity.color || "#3fd1c0",
      description: entity.description || "",
    };
    saveCustomThings([newThing, ...current]);
  }
}

const USER_STORAGE_KEY = "brisky_custom_user_identity";

export function getCustomUserIdentity(): UserIdentity {
  if (typeof window === "undefined") return defaultUserIdentity;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return defaultUserIdentity;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? { ...defaultUserIdentity, ...parsed } : defaultUserIdentity;
  } catch {
    return defaultUserIdentity;
  }
}

export function saveCustomUserIdentity(user: UserIdentity): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {}
}



