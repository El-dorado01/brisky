"use client";
import { GoogleDriveIcon } from "@/components/connectors/GoogleDriveIcon";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from 'lucide-react';
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  CheckmarkBadge01Icon,
  SparklesIcon,
  Mic01Icon,
  Film01Icon,
  Video01Icon,
  SmartPhone01Icon,
  Briefcase01Icon,
  Folder01Icon,
  Rocket01Icon,
  StarIcon,
  MusicNote01Icon,
  Home01Icon,
  Search01Icon,
  User02Icon,
  FlashIcon,
  Cancel01Icon,
} from "@/components/animate-ui/icons/hugeicons/common";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { ArrowRight01Icon } from "@/components/animate-ui/icons/hugeicons/arrow-right-01";
import { ArrowLeft01Icon } from "@/components/animate-ui/icons/hugeicons/arrow-left-01";
import { CheckIcon } from "@/components/animate-ui/icons/hugeicons/check";
import { LoginBackground } from "@/components/auth/LoginBackground";
import { saveCustomUserIdentity, defaultUserIdentity } from "@/lib/entities-data";

interface UseCaseOption {
  id: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}

const USE_CASES: UseCaseOption[] = [
  {
    id: "personal",
    icon: Home01Icon,
    title: "Personal memories",
    description: "Family videos, trips, and everyday moments",
  },
  {
    id: "learning",
    icon: StarIcon,
    title: "Learning & curiosity",
    description: "Lectures, talks, and things you want to revisit",
  },
  {
    id: "creative",
    icon: SmartPhone01Icon,
    title: "Creative projects",
    description: "Interviews, stories, music, and ideas",
  },
  {
    id: "work",
    icon: Briefcase01Icon,
    title: "Work & collaboration",
    description: "Meetings, presentations, and shared knowledge",
  },
  { id: 'exploring', icon: SparklesIcon, title: 'A bit of everything',
    description: 'Explore your recordings in your own way' },
];

const SPACE_ICONS = [
  { id: "mic", label: "Microphone", icon: Mic01Icon },
  { id: "film", label: "Film", icon: Film01Icon },
  { id: "video", label: "Camera", icon: Video01Icon },
  { id: "folder", label: "Archive Folder", icon: Folder01Icon },
  { id: "rocket", label: "Launch Space", icon: Rocket01Icon },
  { id: "star", label: "Featured Space", icon: StarIcon },
  { id: "music", label: "Audio Space", icon: MusicNote01Icon },
  { id: "briefcase", label: "Work", icon: Briefcase01Icon },
  { id: "home", label: "Home", icon: Home01Icon },
  { id: "sparkles", label: "AI Highlights", icon: SparklesIcon },
];

const CONNECTORS = [
  {
    id: "gdrive",
    name: "Google Drive",
    badge: "Popular",
    icon: (
      <GoogleDriveIcon className="size-5 shrink-0" />
    ),
    description: "Find moments in videos and audio from your Drive folders.",
  },
  {
    id: "local",
    name: "Local Media & Hard Drives",
    badge: "Direct upload",
    icon: (
      <span className="grid size-5 place-items-center rounded-md bg-brand-violet/10 text-brand-violet">
        <Folder01Icon size={14} />
      </span>
    ),
    description: "Bring videos and audio from your computer or external drive.",
  },
  {
    id: "sample",
    name: "Explore with Sample Archive",
    badge: "Planned",
    icon: (
      <span className="grid size-5 place-items-center rounded-md bg-emerald-500/10 text-emerald-600">
        <SparklesIcon size={14} />
      </span>
    ),
    description: "Save your preference to explore a sample archive when available.",
  },
];

const cardVariants: Variants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 28 : dir < 0 ? -28 : 0,
    opacity: 0,
    scale: 0.985,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -28 : 28,
    opacity: 0,
    scale: 0.985,
    transition: {
      duration: 0.2,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  }),
};

export function OnboardingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";

  const [[step, direction], setStepDirection] = useState<[1 | 2 | 3 | 4, number]>([1, 0]);

  function goToStep(nextStep: 1 | 2 | 3 | 4) {
    setStepDirection(([curr]) => [nextStep, nextStep > curr ? 1 : -1]);
  }

  // Step 1: User Profile & Identity
  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailParam || "you@example.com");
  const [selectedType, setSelectedType] = useState("exploring");
  const [aliases, setAliases] = useState<string[]>(["me", "I"]);
  const [newAlias, setNewAlias] = useState("");

  // Step 2: First Space / Workspace
  const [spaceName, setSpaceName] = useState("My collection");
  const [spaceIconId, setSpaceIconId] = useState("folder");

  // Step 3: Media Connector
  const [selectedConnector, setSelectedConnector] = useState("gdrive");
  const [account, setAccount] = useState<{id:string;email:string;name:string}|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active=true;
    async function load() {
      try {
        const response=await fetch('/api/onboarding',{cache:'no-store'});
        if (response.status===401) {router.replace('/login');return;}
        const result=await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load your setup.');
        if (!active) return;
        setAccount(result.user); setEmail(result.user.email);
        const suggested=result.user.email.split('@')[0].replace(/[._-]/g,' ');
        setName(result.user.name || suggested.charAt(0).toUpperCase()+suggested.slice(1));
        if (result.profile) {
          setAliases(result.profile.aliases);
          const previous=result.profile.creatorType;
          setSelectedType(['podcaster','producer','creator'].includes(previous) ? 'creative' : previous==='team' ? 'work' : previous);
          setSelectedConnector(result.profile.connectorPreference);
        }
        if (result.workspace) {setSpaceName(result.workspace.name);setSpaceIconId(result.workspace.icon);}
      } catch(failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to load your setup.');
      } finally {if(active)setLoading(false);}
    }
    void load();
    return ()=>{active=false;};
  }, [router]);

  useEffect(() => {
    const origHtmlBg = document.documentElement.style.backgroundColor;
    const origBodyBg = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = "#f6f7fb";
    document.body.style.backgroundColor = "#f6f7fb";
    return () => {
      document.documentElement.style.backgroundColor = origHtmlBg;
      document.body.style.backgroundColor = origBodyBg;
    };
  }, []);

  function handleAddAlias() {
    if (aliases.length >= 20) {setError('You can save up to 20 aliases.');return;}
    const trimmed = newAlias.trim().toLowerCase();
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases([...aliases, trimmed]);
      setNewAlias("");
    }
  }

  function handleRemoveAlias(aliasToRemove: string) {
    if (aliases.length <= 1) return;
    setAliases(aliases.filter((a) => a !== aliasToRemove));
  }

  async function handleCompleteOnboarding(skip=false) {
    if (loading || saving) return;
    if (!account) {router.replace('/login');return;}
    setSaving(true);setError('');
    try {
      const response=await fetch('/api/onboarding',{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({displayName:skip ? name.trim() || 'Brisky user' : name,
          creatorType:selectedType,aliases,workspaceName:skip ? spaceName.trim() || 'My collection' : spaceName,
          workspaceIcon:spaceIconId,connectorPreference:skip ? 'none' : selectedConnector})});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save your setup.');
      // Compatibility cache for existing UI components; completion is owned by PostgreSQL.
      saveCustomUserIdentity({
      ...defaultUserIdentity,
      id:result.user.id,
      name:result.user.name,
      email:result.user.email,
      handle:`@${result.user.email.split('@')[0]}`,
      initials:result.user.name
        .split(" ")
        .map((p: string) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      aliases:result.profile.aliases,
      faceSamplesCount:0,
      voiceStatus:'Not enrolled',
      verifiedSince:'Not enrolled',
      role: USE_CASES.find((t) => t.id === selectedType)?.title || "Brisky user",
      });
      router.replace('/search');router.refresh();
    } catch(failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save your setup.');
      setSaving(false);
    }
  }

  return (
    <div
      className="relative min-h-dvh w-full overflow-x-clip bg-brand-canvas px-4 pt-20 pb-16 sm:px-6 sm:pt-24 sm:pb-20 lg:pt-28"
      style={{ backgroundColor: "var(--color-brand-canvas)" }}
    >
      <LoginBackground />

      {/* Top Left: Brisky Text Logo (matches login page) */}
      <span
        aria-label="Brisky"
        className="absolute left-6 top-6 z-20 text-4xl leading-none text-brand-violet [font-family:var(--font-logo),var(--font-dm-sans),sans-serif] sm:left-10 sm:top-8"
      >
        <span aria-hidden>/ˈbrɪski/</span>
      </span>

      {/* Optional setup shortcut */}
      <AnimateIcon animateOnHover asChild><button
        type="button"
        onClick={() => void handleCompleteOnboarding(true)}
        disabled={loading || saving}
        aria-busy={saving}
        className="group absolute right-6 top-6 z-20 inline-flex items-center gap-1.5 rounded-full border border-brand-line/80 bg-brand-surface/80 px-3.5 py-1.5 text-xs font-semibold text-brand-ink shadow-2xs backdrop-blur-xs transition hover:border-brand-violet/40 hover:bg-brand-surface hover:text-brand-violet sm:right-10 sm:top-8 sm:px-4 sm:py-2 sm:text-sm"
      >
        <span>{saving ? 'Saving setup…' : 'Skip setup'}</span>
        {saving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <ArrowRight01Icon size={14} className="transition-transform group-hover:translate-x-0.5" />}
      </button></AnimateIcon>

      {/* Centered Content Container with generous top clearance */}
      <div className="relative z-10 mx-auto mt-6 w-full max-w-xl sm:mt-10 lg:mt-12">
        {/* Centrally Placed Title (matches login page style) */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-brand-ink sm:text-4xl">
            Welcome to Brisky.
          </h1>
          <p className="mt-2.5 text-sm text-brand-muted">
            Rediscover a memory, revisit an idea, or find something you heard. Make Brisky yours.
          </p>

          {/* Stepper Dots */}
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand-line/80 bg-brand-surface/80 px-3 py-1 shadow-2xs backdrop-blur-xs">
            {[1, 2, 3, 4].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (s < step) goToStep(s as 1 | 2 | 3 | 4);
                }}
                disabled={s > step}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step
                    ? "w-6 bg-brand-action cursor-default"
                    : s < step
                    ? "w-2 bg-brand-violet/50 hover:bg-brand-action cursor-pointer"
                    : "w-2 bg-brand-line cursor-default"
                }`}
                title={`Step ${s}`}
              />
            ))}
            <span className="text-[11px] font-semibold text-brand-muted">
              Step {step} of 4
            </span>
          </div>
        </div>

        {/* The Card with Reduced Width and smooth directional animations */}
        <main className="relative overflow-hidden">
          {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full"
            >
              {/* STEP 1: Profile & Primary Identity */}
              {step === 1 && (
                <div className="rounded-3xl border border-brand-line/80 bg-brand-surface p-6 shadow-xs sm:p-7">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-violet">
                  Step 1 • Your Identity
                </span>
                <h2 className="mt-1 text-xl font-bold text-brand-ink sm:text-2xl">
                  What should Brisky call you?
                </h2>
                <p className="mt-1 text-xs text-brand-muted">
                  Use the name you prefer. This is your space for the recordings and moments that matter to you.
                </p>
              </div>

              <div className="mt-5 space-y-4">
                {/* Full Name & Email */}
                <div>
                  <label className="block text-xs font-semibold text-brand-ink">
                    Your Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Amara Okonjo"
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-brand-line bg-brand-canvas/40 px-3.5 text-base sm:text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:bg-brand-surface focus:ring-4 focus:ring-brand-violet/15"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-ink">
                    Account Email
                  </label>
                  <input
                    type="email"
                    disabled
                    value={email}
                    className="mt-1 h-10 w-full rounded-xl border border-brand-line/60 bg-brand-canvas/70 px-3.5 text-base sm:text-sm text-brand-muted"
                  />
                </div>

                {/* Workflow Category */}
                <div>
                  <label className="block text-xs font-semibold text-brand-ink">
                    What brings you to Brisky?
                  </label>
                  <p className="mt-1 text-xs text-brand-muted">Pick what feels closest. You can use Brisky for any of these.</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {USE_CASES.map((type) => {
                      const TypeIcon = type.icon;
                      const isSelected = selectedType === type.id;
                      return (
                        <AnimateIcon animateOnHover asChild key={type.id}><button
                          type="button"
                          onClick={() => setSelectedType(type.id)}
                          className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                            isSelected
                              ? "border-brand-violet bg-brand-violet/5 shadow-2xs ring-1 ring-brand-violet"
                              : "border-brand-line/80 bg-brand-surface hover:border-brand-line hover:bg-brand-canvas/30"
                          }`}
                        >
                          <span
                            className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors ${
                              isSelected
                                ? "bg-brand-action text-white"
                                : "bg-brand-canvas text-brand-muted"
                            }`}
                          >
                            <TypeIcon size={16} />
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-brand-ink">
                              {type.title}
                            </h4>
                            <p className="text-[11px] text-brand-muted truncate">
                              {type.description}
                            </p>
                          </div>
                        </button></AnimateIcon>
                      );
                    })}
                  </div>
                </div>

                {/* Search Aliases */}
                <div className="overflow-hidden rounded-xl border border-brand-line/70 bg-brand-canvas/30 p-3 sm:p-3.5">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-brand-ink">
                        Personal Search Aliases
                      </span>
                      <p className="text-[11px] text-brand-muted">
                        Save the names and words you use for yourself.
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 self-start rounded-full bg-brand-violet/10 px-2 py-0.5 text-[10px] font-semibold text-brand-violet sm:self-auto sm:text-[11px]">
                      <CheckmarkBadge01Icon size={12} />
                      Your aliases
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {aliases.map((alias) => (
                      <span
                        key={alias}
                        className="inline-flex max-w-full items-center gap-1 rounded-md border border-brand-line bg-brand-surface px-2 py-1 text-xs font-semibold text-brand-ink shadow-2xs"
                      >
                        <span className="truncate max-w-[120px] sm:max-w-none">{alias}</span>
                        <AnimateIcon animateOnHover asChild><button
                          type="button"
                          onClick={() => handleRemoveAlias(alias)}
                          className="shrink-0 text-brand-muted transition hover:text-red-500"
                          title="Remove alias"
                        >
                          <Cancel01Icon size={10} />
                        </button></AnimateIcon>
                      </span>
                    ))}

                    <div className="flex min-w-[130px] flex-1 items-center gap-1 sm:flex-none">
                      <input
                        type="text"
                        placeholder="+ Add alias"
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            handleAddAlias();
                          }
                        }}
                        className="h-8 sm:h-7 w-full rounded-md border border-brand-line bg-brand-surface px-2.5 sm:px-2 text-base sm:text-xs text-brand-ink outline-none placeholder:text-brand-muted/70 focus:border-brand-violet sm:w-28"
                      />
                      {newAlias.trim() && (
                        <button
                          type="button"
                          onClick={handleAddAlias}
                          className="h-8 sm:h-7 shrink-0 rounded-md bg-brand-action px-2.5 text-xs font-semibold text-white transition hover:bg-brand-action-hover"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 flex justify-end border-t border-brand-line/60 pt-4">
                <AnimateIcon animateOnHover asChild>
                  <button
                    type="button"
                    onClick={() => goToStep(2)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-brand-action-hover"
                  >
                    <span>Continue to Workspace</span>
                    <ArrowRight01Icon size={14} />
                  </button>
                </AnimateIcon>
              </div>
            </div>
          )}

          {/* STEP 2: Workspace Space */}
          {step === 2 && (
            <div className="rounded-3xl border border-brand-line/80 bg-brand-surface p-6 shadow-xs sm:p-7">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-violet">
                  Step 2 • Workspace Setup
                </span>
                <h2 className="mt-1 text-xl font-bold text-brand-ink sm:text-2xl">
                  Create your first Space
                </h2>
                <p className="mt-1 text-xs text-brand-muted">
                  Give your collection a name: family memories, things you are learning, work, or anything else.
                </p>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-brand-ink">
                    Space Name
                  </label>
                  <div className="mt-1 flex gap-2">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-brand-line bg-brand-canvas text-brand-violet">
                      {(() => {
                        const CurrentIcon =
                          SPACE_ICONS.find((i) => i.id === spaceIconId)?.icon || Mic01Icon;
                        return <CurrentIcon size={20} />;
                      })()}
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Family memories or My recordings"
                      value={spaceName}
                      onChange={(e) => setSpaceName(e.target.value)}
                      className="h-10 flex-1 rounded-xl border border-brand-line bg-brand-canvas/40 px-3.5 text-base sm:text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:bg-brand-surface focus:ring-4 focus:ring-brand-violet/15"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-ink">
                    Choose Space Icon
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {SPACE_ICONS.map((item) => {
                      const IconComponent = item.icon;
                      const isSelected = spaceIconId === item.id;
                      return (
                        <AnimateIcon animateOnHover asChild key={item.id}><button
                          type="button"
                          title={item.label}
                          onClick={() => setSpaceIconId(item.id)}
                          className={`grid size-9 place-items-center rounded-xl transition ${
                            isSelected
                              ? "bg-brand-action text-white ring-2 ring-brand-violet shadow-2xs"
                              : "border border-brand-line bg-brand-surface text-brand-muted hover:bg-brand-canvas hover:text-brand-ink"
                          }`}
                        >
                          <IconComponent size={16} />
                        </button></AnimateIcon>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-brand-line/60 bg-brand-canvas/30 p-3.5">
                  <h4 className="text-xs font-semibold text-brand-ink">
                    Privacy &amp; Storage Isolation
                  </h4>
                  <p className="mt-0.5 text-xs text-brand-muted leading-relaxed">
                    All vectors, speech tracks, and biometric anchors inside &ldquo;{spaceName || "your space"}&rdquo; are private to your account.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex items-center justify-between border-t border-brand-line/60 pt-4">
                <AnimateIcon animateOnHover asChild><button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-muted transition hover:text-brand-ink"
                >
                  <ArrowLeft01Icon size={14} />
                  <span>Back</span>
                </button></AnimateIcon>

                <AnimateIcon animateOnHover asChild>
                  <button
                    type="button"
                    onClick={() => goToStep(3)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-brand-action-hover"
                  >
                    <span>Connect Media Source</span>
                    <ArrowRight01Icon size={14} />
                  </button>
                </AnimateIcon>
              </div>
            </div>
          )}

          {/* STEP 3: Connect Media Storage */}
          {step === 3 && (
            <div className="rounded-3xl border border-brand-line/80 bg-brand-surface p-6 shadow-xs sm:p-7">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-violet">
                  Step 3 • Media Storage
                </span>
                <h2 className="mt-1 text-xl font-bold text-brand-ink sm:text-2xl">
                  Where do you keep your videos and audio?
                </h2>
                <p className="mt-1 text-xs text-brand-muted">
                  Choose where you would like to start. You can connect an account or add recordings after setup.
                </p>
              </div>

              <div className="mt-5 space-y-2.5">
                {CONNECTORS.map((c) => (
                  <AnimateIcon animateOnHover asChild key={c.id}><button
                    type="button"
                    onClick={() => setSelectedConnector(c.id)}
                    className={`flex w-full items-start gap-3.5 rounded-xl border p-3.5 text-left transition-all ${
                      selectedConnector === c.id
                        ? "border-brand-violet bg-brand-violet/5 shadow-2xs ring-1 ring-brand-violet"
                        : "border-brand-line/80 bg-brand-surface hover:border-brand-line hover:bg-brand-canvas/30"
                    }`}
                  >
                    <div className="mt-0.5">{c.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-brand-ink">
                          {c.name}
                        </h4>
                        <span className="rounded-md bg-brand-canvas px-1.5 py-0.2 text-[10px] font-semibold text-brand-muted border border-brand-line/70">
                          {c.badge}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-brand-muted leading-relaxed">
                        {c.description}
                      </p>
                    </div>
                    {selectedConnector === c.id && (
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-action text-white">
                        <CheckIcon size={12} />
                      </span>
                    )}
                  </button></AnimateIcon>
                ))}
              </div>

              {/* Actions */}
              <div className="mt-6 flex items-center justify-between border-t border-brand-line/60 pt-4">
                <AnimateIcon animateOnHover asChild><button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-muted transition hover:text-brand-ink"
                >
                  <ArrowLeft01Icon size={14} />
                  <span>Back</span>
                </button></AnimateIcon>

                <AnimateIcon animateOnHover asChild>
                  <button
                    type="button"
                    onClick={() => goToStep(4)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-brand-action-hover"
                  >
                    <span>Final Step: AI Setup</span>
                    <ArrowRight01Icon size={14} />
                  </button>
                </AnimateIcon>
              </div>
            </div>
          )}

          {/* STEP 4: AI Superpowers & Launch */}
          {step === 4 && (
            <div className="rounded-3xl border border-brand-line/80 bg-brand-surface p-6 shadow-xs sm:p-7">
              <div className="text-center">
                <div className="inline-grid size-12 place-items-center rounded-2xl bg-brand-violet/10 text-brand-violet shadow-2xs">
                  <SparklesIcon size={24} />
                </div>
                <h2 className="mt-2 text-xl font-bold text-brand-ink sm:text-2xl">
                  Ready when you are{name ? `, ${name}` : ''}!
                </h2>
                <p className="mt-1 text-xs text-brand-muted max-w-sm mx-auto">
                  Save your setup, then add recordings and find the moments that matter to you.
                </p>
              </div>

              {/* 3 Pillars in compact layout */}
              <div className="mt-5 space-y-2.5">
                <div className="flex items-start gap-3 rounded-xl border border-brand-line/70 bg-brand-canvas/30 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-violet/10 text-brand-violet">
                    <Search01Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-brand-ink">
                      Find a moment
                    </h4>
                    <p className="text-[11px] text-brand-muted">
                      Search spoken topics, actions, or visual moments and jump directly to exact timestamps.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-brand-line/70 bg-brand-canvas/30 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-violet/10 text-brand-violet">
                    <User02Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-brand-ink">
                      Remember who was there
                    </h4>
                    <p className="text-[11px] text-brand-muted">
                      Tag people you know to help find moments with them, from family gatherings to conversations at work.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-brand-line/70 bg-brand-canvas/30 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-violet/10 text-brand-violet">
                    <FlashIcon size={16} />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-brand-ink">
                      Revisit what matters
                    </h4>
                    <p className="text-[11px] text-brand-muted">
                      Return to a useful explanation, a shared idea, or a memory you want to keep.
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary card */}
              <div className="mt-4 overflow-hidden rounded-2xl border border-brand-violet/20 bg-brand-violet/5 p-3 sm:p-3.5">
                <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-medium text-brand-muted">Account:</span>
                    <span
                      className="truncate font-semibold text-brand-violet"
                      title={email}
                    >
                      {email}
                    </span>
                  </div>
                  <div className="h-px bg-brand-violet/15 sm:hidden" />
                  <div className="flex min-w-0 items-center gap-2 sm:shrink-0">
                    <span className="shrink-0 font-medium text-brand-muted">Workspace:</span>
                    <span
                      className="truncate font-semibold text-brand-violet"
                      title={spaceName}
                    >
                      {spaceName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Launch Button */}
              <div className="mt-6 flex items-center justify-between border-t border-brand-line/60 pt-4">
                <AnimateIcon animateOnHover asChild><button
                  type="button"
                  onClick={() => goToStep(3)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-muted transition hover:text-brand-ink"
                >
                  <ArrowLeft01Icon size={14} />
                  <span>Back</span>
                </button></AnimateIcon>

                <AnimateIcon animateOnHover asChild>
                  <button
                    type="button"
                    onClick={()=>void handleCompleteOnboarding()}
                    disabled={loading || saving}
                    aria-busy={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-6 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md transition hover:bg-brand-action-hover hover:shadow-lg"
                  >
                    <span>{saving ? 'Saving setup…' : 'Start exploring Brisky'}</span>
                    {saving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <ArrowRight01Icon size={16} />}
                  </button>
                </AnimateIcon>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </main>
      </div>
    </div>
  );
}
