"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useBottomSheet } from '@/hooks/use-bottom-sheet';
import {
  Cancel01Icon,
  CheckmarkBadge01Icon,
  FaceIdIcon,
  SparklesIcon,
  VolumeHighIcon,
} from "@/components/animate-ui/icons/hugeicons/common";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { ArrowRight01Icon } from "@/components/animate-ui/icons/hugeicons/arrow-right-01";
import { CheckIcon } from "@/components/animate-ui/icons/hugeicons/check";
import { ClapperboardIcon } from "@/components/animate-ui/icons/hugeicons/clapperboard";
import { Layers01Icon } from "@/components/animate-ui/icons/hugeicons/layers-01";
import { PencilEdit02Icon } from "@/components/animate-ui/icons/hugeicons/pencil-edit-02";
import { PlusSignIcon } from "@/components/animate-ui/icons/hugeicons/plus-sign";
import { Search01Icon } from "@/components/animate-ui/icons/hugeicons/search-01";
import { UserAdd01Icon } from "@/components/animate-ui/icons/hugeicons/user-add-01";
import { UsersIcon as HugeUsersIcon } from "@/components/animate-ui/icons/hugeicons/users";
import { EntitiesMetricChart } from "@/components/entities/EntitiesMetricChart";
import {
  defaultPeople,
  defaultThings,
  defaultUnlabeledClusters,
  defaultUserIdentity,
  getCustomPeople,
  getCustomThings,
  saveCustomPeople,
  type PersonEntity,
  type ThingEntity,
  type UnlabeledCluster,
  type UserIdentity,
} from "@/lib/entities-data";

const BriskyCompanion = dynamic(
  () => import("@/components/mascot/BriskyCompanion").then((m) => m.BriskyCompanion),
  { ssr: false }
);

export function EntitiesView() {
  const [activeTab, setActiveTab] = useState<"people" | "things" | "unlabeled">("people");
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<UserIdentity>(defaultUserIdentity);
  const [people, setPeople] = useState<PersonEntity[]>(defaultPeople);
  const [things, setThings] = useState<ThingEntity[]>(defaultThings);
  const [clusters, setClusters] = useState<UnlabeledCluster[]>(defaultUnlabeledClusters);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync saved entities on mount (persisting between /entity/new and /entities)
  useEffect(() => {
    setPeople(getCustomPeople());
    setThings(getCustomThings());
  }, []);

  // Teach modal / drawer state
  const [modalOpen, setModalOpen] = useState(false);
  const [teachCategory, setTeachCategory] = useState<"person" | "thing">("person");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formAliases, setFormAliases] = useState("");
  const [formDescription, setFormDescription] = useState("");

  // Edit "You" modal
  const [editingYou, setEditingYou] = useState(false);
  const [youAliasesInput, setYouAliasesInput] = useState(user.aliases.join(", "));

  const introSheet=useBottomSheet(()=>setModalOpen(false));
  const identitySheet=useBottomSheet(()=>setEditingYou(false));

  // Lock background scroll when any modal/slider is open
  useEffect(() => {
    if(!modalOpen && !editingYou)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setModalOpen(false);setEditingYou(false);}};
    window.addEventListener('keydown',escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown',escape);
    };
  }, [modalOpen, editingYou]);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 4000);
  }

  // Filtered lists based on search query
  const filteredPeople = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.relationship.toLowerCase().includes(q) ||
        p.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [people, searchQuery]);

  const filteredThings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return things;
    return things.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.categoryLabel.toLowerCase().includes(q) ||
        t.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [things, searchQuery]);

  const filteredClusters = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return clusters;
    return clusters.filter(
      (c) =>
        c.previewLabel.toLowerCase().includes(q) ||
        c.suggestedRole.toLowerCase().includes(q) ||
        c.quickTags.some((t) => t.toLowerCase().includes(q))
    );
  }, [clusters, searchQuery]);

  // Handle fast-teaching an unlabeled cluster
  function handleTeachCluster(clusterId: string, assignedName: string) {
    const cluster = clusters.find((c) => c.id === clusterId);
    if (!cluster) return;

    if (cluster.kind === "face") {
      const newPerson: PersonEntity = {
        id: `person-${Date.now()}`,
        name: assignedName,
        relationship: cluster.suggestedRole,
        category: "person",
        aliases: [assignedName, assignedName.split(" ")[0]],
        momentsCount: cluster.appearanceCount,
        videosCount: cluster.videoCount,
        lastSeen: "Today",
        faceColor: cluster.color,
        verified: true,
        notes: `Trained from cluster: ${cluster.previewLabel}`,
      };
      setPeople((prev) => [newPerson, ...prev]);
    } else {
      const newThing: ThingEntity = {
        id: `thing-${Date.now()}`,
        name: assignedName,
        type: cluster.kind === "place" ? "place" : "object",
        categoryLabel: cluster.suggestedRole,
        aliases: [assignedName, assignedName.toLowerCase()],
        momentsCount: cluster.appearanceCount,
        videosCount: cluster.videoCount,
        lastSeen: "Today",
        color: cluster.color,
        description: cluster.previewLabel,
      };
      setThings((prev) => [newThing, ...prev]);
    }

    setClusters((prev) => prev.filter((c) => c.id !== clusterId));
    showToast(`Learned: "${assignedName}" is now recognized across ${cluster.appearanceCount} moments!`);
  }

  function handleIgnoreCluster(clusterId: string) {
    setClusters((prev) => prev.filter((c) => c.id !== clusterId));
    showToast("Cluster dismissed from queue.");
  }

  function handleSubmitTeach(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;

    const aliases = formAliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    if (!aliases.includes(formName.trim())) {
      aliases.unshift(formName.trim());
    }

    if (teachCategory === "person") {
      const newPerson: PersonEntity = {
        id: `person-${Date.now()}`,
        name: formName.trim(),
        relationship: formRole.trim() || "Collaborator",
        category: "person",
        aliases,
        momentsCount: 1,
        videosCount: 1,
        lastSeen: "Just now",
        faceColor: "#7363de",
        verified: true,
        notes: formDescription.trim() || undefined,
      };
      setPeople((prev) => [newPerson, ...prev]);
      showToast(`Trained Brisky to recognize ${newPerson.name}.`);
    } else {
      const newThing: ThingEntity = {
        id: `thing-${Date.now()}`,
        name: formName.trim(),
        type: "object",
        categoryLabel: formRole.trim() || "Custom Entity",
        aliases,
        momentsCount: 1,
        videosCount: 1,
        lastSeen: "Just now",
        color: "#7363de",
        description: formDescription.trim() || "Custom entity trained by creator.",
      };
      setThings((prev) => [newThing, ...prev]);
      showToast(`Trained Brisky to recognize ${newThing.name}.`);
    }

    setFormName("");
    setFormRole("");
    setFormAliases("");
    setFormDescription("");
    setModalOpen(false);
  }

  function handleSaveYou(e: React.FormEvent) {
    e.preventDefault();
    const splitAliases = youAliasesInput
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    setUser((prev) => ({
      ...prev,
      aliases: splitAliases.length > 0 ? splitAliases : prev.aliases,
    }));
    setEditingYou(false);
    showToast("Updated your identity and search aliases.");
  }

  return (
    <div className="relative flex h-dvh w-full min-w-0 flex-1 flex-col overflow-y-auto bg-brand-canvas text-brand-ink [font-family:var(--font-dm-sans),sans-serif]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl border border-brand-violet/30 bg-brand-ink px-4 py-3 text-sm text-white shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200">
          <span className="grid size-6 place-items-center rounded-full bg-brand-action text-white">
            <CheckIcon size={14} />
          </span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-20 pt-6 sm:px-8 lg:px-10">
        {/* Top Header */}
        <header className="flex flex-col justify-between gap-4 border-b border-brand-line/80 pb-6 sm:flex-row sm:items-center">
          <div>
            <div className="hidden min-h-8 items-center md:flex">
              <h1 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-[28px]">
                People & Entities
              </h1>
            </div>
            <p className="mt-1 text-sm text-brand-muted">
              Teach Brisky who and what to recognize across your archive for sub-second personalized retrieval.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <AnimateIcon animateOnHover asChild>
              <button
                type="button"
                onClick={() => {
                  setTeachCategory("person");
                  setModalOpen(true);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-action px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet"
              >
                <UserAdd01Icon size={17} />
                <span>Teach Brisky</span>
              </button>
            </AnimateIcon>
          </div>
        </header>

        {/* Top Control Section: User Anchor Identity + Archive Grounding Metric Chart (without bg) */}
        <section
          aria-label="Your anchor identity and archive coverage"
          className="mt-6 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12"
        >
          {/* Primary User Anchor Card */}
          <div className="flex min-w-0 lg:col-span-7">
            <div className="flex h-full w-full flex-col justify-between overflow-hidden rounded-2xl border border-brand-line/80 bg-brand-surface shadow-2xs sm:rounded-3xl md:flex-row">
              {/* Left Identity Column with light background design */}
              <div className="relative flex flex-col items-center justify-between overflow-hidden border-b border-brand-line/60 bg-gradient-to-b from-brand-violet/[0.08] via-brand-canvas/60 to-white/80 p-4 text-center sm:p-5 md:w-[190px] md:shrink-0 md:items-start md:border-b-0 md:border-r md:text-left">
                {/* Decorative ambient radial glow */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-10 -top-10 size-36 rounded-full bg-brand-violet/12 blur-2xl"
                />

                {/* Subtle light geometric mesh pattern */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(#7363de_1px,transparent_1px)] [background-size:12px_12px] opacity-[0.09]"
                />

                {/* Subtle decorative concentric arc lines in top right */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full border border-brand-violet/15"
                />

                {/* Content above decorative background */}
                <div className="relative z-10 flex flex-col items-center md:items-start">
                  <div className="relative inline-grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-violet to-[#5b4cb8] font-bold text-white shadow-xs">
                    <span className="text-sm tracking-tight">{user.initials}</span>
                    <span
                      title="Verified identity"
                      className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-brand-surface text-brand-violet shadow-2xs ring-1.5 ring-white"
                    >
                      <CheckmarkBadge01Icon size={12} className="text-brand-violet" />
                    </span>
                  </div>

                  <div className="mt-2.5 min-w-0 text-center md:text-left">
                    <h3 className="truncate text-sm font-semibold text-brand-ink sm:text-base">
                      {user.name}
                    </h3>
                    <p className="truncate text-xs text-brand-muted">{user.email || "amara@example.com"}</p>
                  </div>
                </div>

                <div className="relative z-10 mt-4 flex w-full justify-center md:block">
                  <AnimateIcon animateOnHover asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setYouAliasesInput(user.aliases.join(", "));
                        setEditingYou(true);
                      }}
                      className="inline-flex w-full max-w-[200px] items-center justify-center gap-1.5 rounded-xl border border-brand-line bg-brand-surface/90 px-3 py-1.5 text-xs font-semibold text-brand-ink shadow-2xs backdrop-blur-xs transition hover:border-brand-violet/40 hover:bg-brand-surface hover:text-brand-violet md:max-w-none"
                    >
                      <PencilEdit02Icon size={13} className="text-brand-muted" />
                      <span>Edit aliases</span>
                    </button>
                  </AnimateIcon>
                </div>
              </div>

              {/* Right Details Column: Search Aliases & Biometrics */}
              <div className="flex min-w-0 flex-1 flex-col justify-between p-4 text-center sm:p-5 md:text-left">
                {/* Search Aliases */}
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-brand-muted text-center md:text-left">
                    Search Aliases
                  </span>
                  <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 md:justify-start">
                    {user.aliases.map((alias) => (
                      <span
                        key={alias}
                        className="rounded-md border border-brand-line/90 bg-brand-canvas px-2 py-0.5 text-xs font-medium text-brand-ink shadow-2xs"
                      >
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Biometric Anchors */}
                <div className="mt-4 min-w-0 border-t border-brand-line/60 pt-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-brand-muted text-center md:text-left">
                    Biometric Anchors
                  </span>
                  <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-xs md:justify-start">
                    <span className="inline-flex items-center gap-1 rounded-md border border-brand-line/70 bg-brand-canvas px-2 py-0.5 text-xs font-medium text-brand-ink/90 whitespace-nowrap">
                      <FaceIdIcon size={12} className="text-brand-violet" />
                      <span>{user.faceSamplesCount} faces</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md border border-brand-line/70 bg-brand-canvas px-2 py-0.5 text-xs font-medium text-brand-ink/90 whitespace-nowrap">
                      <VolumeHighIcon size={12} className="text-brand-violet" />
                      <span>Voiceprint active</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Archive Grounding Metric Chart (directly on the page without bg) */}
          <div className="flex justify-center lg:col-span-5">
            <EntitiesMetricChart
              peopleCount={people.length}
              thingsCount={things.length}
              unlabeledCount={clusters.length}
              onNavigateToUnlabeled={() => setActiveTab("unlabeled")}
            />
          </div>
        </section>

        {/* Tab switcher + Search Bar */}
        <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          {/* Segmented Tab Switch */}
          <div className="flex w-full items-center justify-between gap-1 rounded-xl border border-brand-line/80 bg-brand-surface p-1 shadow-2xs sm:w-auto sm:inline-flex">
            <button
              type="button"
              onClick={() => setActiveTab("people")}
              className={`flex-1 sm:flex-none rounded-lg px-2.5 py-1.5 text-xs font-semibold transition text-center whitespace-nowrap sm:px-3.5 sm:text-sm ${
                activeTab === "people"
                  ? "bg-brand-action text-white shadow-2xs"
                  : "text-brand-muted hover:text-brand-ink"
              }`}
            >
              <span>People ({people.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("things")}
              className={`flex-1 sm:flex-none rounded-lg px-2.5 py-1.5 text-xs font-semibold transition text-center whitespace-nowrap sm:px-3.5 sm:text-sm ${
                activeTab === "things"
                  ? "bg-brand-action text-white shadow-2xs"
                  : "text-brand-muted hover:text-brand-ink"
              }`}
            >
              <span>Things<span className="hidden sm:inline"> &amp; Places</span> ({things.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("unlabeled")}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap sm:px-3.5 sm:text-sm ${
                activeTab === "unlabeled"
                  ? "bg-brand-action text-white shadow-2xs"
                  : "text-brand-muted hover:text-brand-ink"
              }`}
            >
              <span><span className="hidden sm:inline">Needs </span>Teaching</span>
              {clusters.length > 0 && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    activeTab === "unlabeled" ? "bg-brand-surface text-brand-violet" : "bg-brand-action text-white"
                  }`}
                >
                  {clusters.length}
                </span>
              )}
            </button>
          </div>

          {/* Search filter input */}
          <div className="relative w-full sm:w-72">
            <Search01Icon size={16} className="pointer-events-none absolute left-3 top-2.5 text-brand-muted" />
            <input
              type="search"
              placeholder={`Filter ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-brand-line bg-brand-surface py-2 pl-9 pr-3 text-base sm:text-sm text-brand-ink placeholder:text-brand-muted/70 outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/15"
            />
          </div>
        </div>

        {/* Tab 1: People */}
        {activeTab === "people" && (
          <section className="mt-6">
            {filteredPeople.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-brand-line bg-brand-surface p-12 text-center">
                <HugeUsersIcon size={38} className="text-brand-muted/50" />
                <h3 className="mt-3 text-sm font-semibold text-brand-ink">No people match your search</h3>
                <p className="mt-1 text-xs text-brand-muted">Try clearing the search query or teach a new person.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredPeople.map((p) => (
                  <article
                    key={p.id}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-brand-line/80 bg-brand-surface shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-violet/40 hover:shadow-md sm:flex-row"
                  >
                    {/* Left Identity Pane with subtle light bg design */}
                    <div className="relative flex shrink-0 items-center gap-3 border-b border-brand-line/60 bg-gradient-to-br from-brand-canvas via-white to-brand-canvas/60 p-3.5 sm:w-44 sm:flex-col sm:items-center sm:justify-center sm:border-b-0 sm:border-r sm:p-4 sm:text-center">
                      {/* Subtle ambient glow in left pane */}
                      <div
                        className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full opacity-40 blur-xl"
                        style={{ backgroundColor: p.faceColor }}
                      />

                      <div
                        style={{
                          background: `linear-gradient(135deg, ${p.faceColor}, ${p.faceColor}dd)`,
                        }}
                        className="relative z-10 grid size-12 shrink-0 place-items-center rounded-2xl font-bold text-white shadow-xs"
                      >
                        <span className="text-sm tracking-tight">{p.name.slice(0, 2).toUpperCase()}</span>
                        {p.verified && (
                          <span
                            title="Verified Identity"
                            className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-brand-surface text-brand-violet shadow-2xs ring-1.5 ring-white"
                          >
                            <CheckmarkBadge01Icon size={12} className="text-brand-violet" />
                          </span>
                        )}
                      </div>

                      <div className="relative z-10 min-w-0 flex-1 sm:w-full">
                        <h3 className="truncate text-sm font-semibold text-brand-ink transition-colors group-hover:text-brand-violet sm:text-base">
                          {p.name}
                        </h3>
                        <p className="truncate text-xs font-medium text-brand-muted">{p.relationship}</p>
                      </div>

                      {/* Moments count pill visible on mobile inside header */}
                      <span className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-line/80 bg-brand-surface px-2 py-0.5 text-[11px] font-semibold text-brand-ink shadow-2xs sm:hidden">
                        <ClapperboardIcon size={11} className="text-brand-violet" />
                        <span>{p.momentsCount}</span>
                      </span>
                    </div>

                    {/* Right Metadata & Actions Pane */}
                    <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5 sm:p-4">
                      <div>
                        {/* Top row in right pane: Label & Moments count (desktop) */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
                            Search Aliases
                          </span>
                          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-brand-line/80 bg-brand-canvas px-2.5 py-0.5 text-xs font-semibold text-brand-ink shadow-2xs sm:inline-flex">
                            <ClapperboardIcon size={11} className="text-brand-violet" />
                            <span>{p.momentsCount} moments</span>
                          </span>
                        </div>

                        {/* Aliases chips */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {p.aliases.map((alias) => (
                            <span
                              key={alias}
                              className="rounded-md border border-brand-line/80 bg-brand-canvas px-2 py-0.5 text-xs font-medium text-brand-ink shadow-2xs"
                            >
                              {alias}
                            </span>
                          ))}
                        </div>

                        {/* Notes / Context */}
                        {p.notes && (
                          <p className="mt-2 line-clamp-1 text-xs leading-relaxed text-brand-muted">{p.notes}</p>
                        )}
                      </div>

                      {/* Bottom row: Video sources + Find moments button */}
                      <div className="mt-3.5 flex items-center justify-between border-t border-brand-line/60 pt-2.5 text-xs">
                        <span className="flex items-center gap-1 text-xs text-brand-muted truncate">
                          <ClapperboardIcon size={12} className="text-brand-muted/70 shrink-0" />
                          <span className="truncate">{p.videosCount} video sources</span>
                        </span>

                        <AnimateIcon animateOnHover asChild>
                          <Link
                            href={`/search?q=${encodeURIComponent(p.name)}`}
                            className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-violet transition hover:text-brand-violet-hover"
                          >
                            <span>Find moments</span>
                            <ArrowRight01Icon size={12} className="transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        </AnimateIcon>
                      </div>
                    </div>
                  </article>
                ))}

                {/* Quick Add Person Card */}
                <AnimateIcon animateOnHover asChild><Link
                  href="/entity/new?type=person"
                  className="group flex min-h-[110px] flex-col items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed border-brand-line bg-brand-canvas/30 p-4 text-center transition-all duration-200 hover:border-brand-violet/50 hover:bg-brand-surface hover:shadow-xs sm:flex-row sm:text-left"
                >
                  
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-violet/10 text-brand-violet transition group-hover:scale-105 group-hover:bg-brand-action group-hover:text-white">
                      <UserAdd01Icon size={20} />
                    </span>
                  
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-brand-ink transition-colors group-hover:text-brand-violet">
                      Teach another person
                    </span>
                    <span className="mt-0.5 block text-xs text-brand-muted">
                      Add collaborator, co-host, or recurring guest
                    </span>
                  </div>
                </Link></AnimateIcon>
              </div>
            )}
          </section>
        )}

        {/* Tab 2: Things & Places */}
        {activeTab === "things" && (
          <section className="mt-6">
            {filteredThings.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-line bg-brand-surface p-12 text-center">
                <Layers01Icon size={38} className="text-brand-muted/50" />
                <h3 className="mt-3 text-sm font-semibold text-brand-ink">No things or places found</h3>
                <p className="mt-1 text-xs text-brand-muted">Teach Brisky to recognize your studio gear or props.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredThings.map((t) => (
                  <article
                    key={t.id}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-brand-line/80 bg-brand-surface shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-violet/40 hover:shadow-md sm:flex-row"
                  >
                    {/* Left Identity Pane with subtle light bg design */}
                    <div className="relative flex shrink-0 items-center gap-3 border-b border-brand-line/60 bg-gradient-to-br from-brand-canvas via-white to-brand-canvas/60 p-3.5 sm:w-44 sm:flex-col sm:items-center sm:justify-center sm:border-b-0 sm:border-r sm:p-4 sm:text-center">
                      <div
                        className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full opacity-40 blur-xl"
                        style={{ backgroundColor: t.color }}
                      />

                      <span
                        style={{ backgroundColor: `${t.color}18`, color: t.color }}
                        className="relative z-10 grid size-12 shrink-0 place-items-center rounded-2xl border border-brand-line/60 text-xl shadow-xs"
                      >
                        {t.type === "place" ? "📍" : t.name.toLowerCase().includes("guitar") ? "🎸" : "🎙️"}
                      </span>

                      <div className="relative z-10 min-w-0 flex-1 sm:w-full">
                        <h3 className="truncate text-sm font-semibold text-brand-ink transition-colors group-hover:text-brand-violet sm:text-base">
                          {t.name}
                        </h3>
                        <p className="truncate text-xs font-medium text-brand-muted">{t.categoryLabel}</p>
                      </div>

                      {/* Mobile Moments pill */}
                      <span className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-line/80 bg-brand-surface px-2 py-0.5 text-[11px] font-semibold text-brand-ink shadow-2xs sm:hidden">
                        <ClapperboardIcon size={11} className="text-brand-violet" />
                        <span>{t.momentsCount}</span>
                      </span>
                    </div>

                    {/* Right Metadata & Actions Pane */}
                    <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5 sm:p-4">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
                            Search Aliases
                          </span>
                          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-brand-line/80 bg-brand-canvas px-2.5 py-0.5 text-xs font-semibold text-brand-ink shadow-2xs sm:inline-flex">
                            <ClapperboardIcon size={11} className="text-brand-violet" />
                            <span>{t.momentsCount} moments</span>
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {t.aliases.map((alias) => (
                            <span
                              key={alias}
                              className="rounded-md border border-brand-line/80 bg-brand-canvas px-2 py-0.5 text-xs font-medium text-brand-ink shadow-2xs"
                            >
                              {alias}
                            </span>
                          ))}
                        </div>

                        <p className="mt-2 line-clamp-1 text-xs leading-relaxed text-brand-muted">{t.description}</p>
                      </div>

                      <div className="mt-3.5 flex items-center justify-between border-t border-brand-line/60 pt-2.5 text-xs">
                        <span className="truncate text-xs text-brand-muted">
                          Seen in {t.videosCount} videos
                        </span>

                        <AnimateIcon animateOnHover asChild>
                          <Link
                            href={`/search?q=${encodeURIComponent(t.name)}`}
                            className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-violet transition hover:text-brand-violet-hover"
                          >
                            <span>Find moments</span>
                            <ArrowRight01Icon size={12} className="transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        </AnimateIcon>
                      </div>
                    </div>
                  </article>
                ))}

                {/* Quick Add Thing Card */}
                <AnimateIcon animateOnHover asChild><Link
                  href="/entity/new?type=thing"
                  className="group flex min-h-[110px] flex-col items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed border-brand-line bg-brand-canvas/30 p-4 text-center transition-all duration-200 hover:border-brand-violet/50 hover:bg-brand-surface hover:shadow-xs sm:flex-row sm:text-left"
                >
                  
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-violet/10 text-brand-violet transition group-hover:scale-105 group-hover:bg-brand-action group-hover:text-white">
                      <PlusSignIcon size={20} />
                    </span>
                  
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-brand-ink transition-colors group-hover:text-brand-violet">
                      Teach a thing or place
                    </span>
                    <span className="mt-0.5 block text-xs text-brand-muted">
                      Props, gear, instruments, or locations
                    </span>
                  </div>
                </Link></AnimateIcon>
              </div>
            )}
          </section>
        )}

        {/* Tab 3: Needs Teaching (Unlabeled Clusters from Factory Indexing) */}
        {activeTab === "unlabeled" && (
          <section className="mt-6">
            <div className="rounded-3xl border border-brand-violet/20 bg-brand-violet/5 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-action text-white">
                  <SparklesIcon size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-brand-ink">
                    Factory discovered {clusters.length} unlabeled recurring entities
                  </h3>
                  <p className="mt-0.5 text-xs text-brand-muted">
                    These faces and items appeared repeatedly across your indexed archives. Assign a name or tap a
                    suggested tag to teach Brisky immediately.
                  </p>
                </div>
              </div>
            </div>

            {filteredClusters.length === 0 ? (
              <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-brand-line bg-brand-surface p-12 text-center">
                <CheckIcon size={38} className="text-brand-violet" />
                <h3 className="mt-3 text-sm font-semibold text-brand-ink">All caught up!</h3>
                <p className="mt-1 text-xs text-brand-muted">
                  Every recurring face and object across your footage is labeled and indexed.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredClusters.map((c) => (
                  <ClusterCard
                    key={c.id}
                    cluster={c}
                    onTeach={(name) => handleTeachCluster(c.id, name)}
                    onIgnore={() => handleIgnoreCluster(c.id)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Introduction Modal / Mobile Bottom Slider: How Entities Work — triggered by "Teach Brisky" */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-brand-ink/40 p-0 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              {...introSheet.panelProps}
              aria-label="How entities work"
              className="thin-scrollbar relative max-h-[calc(100dvh-1rem)] w-full max-w-full overflow-y-auto overscroll-contain rounded-t-[28px] bg-brand-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-0 shadow-[0_-8px_40px_rgba(34,40,63,0.16)] sm:max-h-[84dvh] sm:max-w-lg sm:rounded-3xl sm:p-7"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile Drag / Pull Handle */}
              <div {...introSheet.handleProps}><div className="h-1 w-10 rounded-full bg-brand-muted/30" /></div>

              {/* Top Close Button */}
              <AnimateIcon animateOnHover asChild><button
                type="button"
                onClick={() => setModalOpen(false)}
                className="absolute right-4 top-3.5 z-10 grid size-8 place-items-center rounded-xl text-brand-muted transition hover:bg-brand-canvas hover:text-brand-ink sm:right-5 sm:top-5"
                aria-label="Close modal"
              >
                <Cancel01Icon size={16} />
              </button></AnimateIcon>

              {/* Modal Header: 3D Mascot Avatar + Teach Concept */}
              <div className="flex flex-col items-center text-center">
                <div className="relative size-[58px] shrink-0 rounded-2xl bg-brand-violet/10 p-1 shadow-2xs sm:size-[70px] sm:rounded-3xl">
                  <BriskyCompanion
                    enabled
                    draggable={false}
                    config={{
                      size: 150,
                      amplitude: 0.5,
                      satellites: false,
                      tracking: true,
                      motion: true,
                      pose: "listening",
                    }}
                  />
                </div>

                <div className="mt-2.5">
                  <span className="rounded-full bg-brand-violet/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-violet">
                    Knowledge Grounding
                  </span>
                  <h2 className="mt-1.5 text-lg font-bold tracking-tight text-brand-ink sm:text-2xl">
                    How Entities Work in Brisky
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-brand-muted sm:text-sm">
                    Teach Brisky who and what to recognize across your footage. Brisky grounds faces, voices, and recurring objects so you can query your memories naturally.
                  </p>
                </div>
              </div>

              {/* 3 Step Visual Breakdown */}
              <div className="mt-3.5 space-y-2 sm:mt-5 sm:space-y-2.5">
                <div className="flex items-start gap-3 rounded-2xl border border-brand-line/80 bg-brand-canvas/50 p-2.5 text-left transition hover:border-brand-violet/30 hover:bg-brand-surface sm:p-3.5">
                  <div className="grid size-7 shrink-0 place-items-center rounded-xl bg-brand-violet/10 text-xs font-bold text-brand-violet sm:size-8">
                    1
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-brand-ink sm:text-sm">
                      Automatic Video Ingestion & Clustering
                    </h3>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-brand-muted sm:text-xs">
                      Factory indexing continuously clusters facial vectors, speaker voiceprints, and recurring objects across hours of unedited raw footage.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-brand-line/80 bg-brand-canvas/50 p-2.5 text-left transition hover:border-brand-violet/30 hover:bg-brand-surface sm:p-3.5">
                  <div className="grid size-7 shrink-0 place-items-center rounded-xl bg-brand-violet/10 text-xs font-bold text-brand-violet sm:size-8">
                    2
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-brand-ink sm:text-sm">
                      Name Once, Remember Forever
                    </h3>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-brand-muted sm:text-xs">
                      Assign a name, role, and search aliases (like &ldquo;Uncle Dave, Dave&rdquo; or &ldquo;red vintage guitar, strat&rdquo;) to train the model.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-brand-line/80 bg-brand-canvas/50 p-2.5 text-left transition hover:border-brand-violet/30 hover:bg-brand-surface sm:p-3.5">
                  <div className="grid size-7 shrink-0 place-items-center rounded-xl bg-brand-violet/10 text-xs font-bold text-brand-violet sm:size-8">
                    3
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-brand-ink sm:text-sm">
                      Sub-Second Natural Search
                    </h3>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-brand-muted sm:text-xs">
                      Query naturally in Voice Mode or Search: &ldquo;Find where I was talking to my uncle&rdquo; and Brisky immediately pinpoints exact moments.
                    </p>
                  </div>
                </div>
              </div>

              {/* Pending clusters notice if any exist */}
              {clusters.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5 rounded-xl border border-brand-violet/20 bg-brand-violet/5 px-3.5 py-2.5 text-xs sm:mt-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-brand-muted">
                    Have unassigned video clusters?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setModalOpen(false);
                      setActiveTab("unlabeled");
                    }}
                    className="self-start text-left font-semibold text-brand-violet transition hover:underline sm:self-auto sm:text-right"
                  >
                    View {clusters.length} pending clusters →
                  </button>
                </div>
              )}

              {/* Actions: Cancel & Confirmation button opening /entity/new */}
              <div className="mt-4 flex items-center justify-end gap-3 border-t border-brand-line/60 pt-3 sm:mt-6 sm:pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl px-3.5 py-2 text-xs font-semibold text-brand-muted transition hover:text-brand-ink"
                >
                  Cancel
                </button>
                <AnimateIcon animateOnHover asChild><Link
                  href="/entity/new"
                  onClick={() => setModalOpen(false)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-action-hover sm:text-sm"
                >
                  <span>Teach a New Entity</span>
                  <ArrowRight01Icon size={16} />
                </Link></AnimateIcon>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit "You" Aliases Modal / Mobile Bottom Slider */}
      <AnimatePresence>
        {editingYou && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-brand-ink/40 p-0 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={() => setEditingYou(false)}
          >
            <motion.div
              {...identitySheet.panelProps}
              aria-label="Configure your identity"
              className="thin-scrollbar relative max-h-[calc(100dvh-1rem)] w-full max-w-full overflow-y-auto overscroll-contain rounded-t-[28px] bg-brand-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-0 shadow-[0_-8px_40px_rgba(34,40,63,0.16)] sm:max-h-[84dvh] sm:max-w-md sm:rounded-3xl sm:p-7"
              onClick={(e) => e.stopPropagation()}
            >
              <div {...identitySheet.handleProps}><div className="h-1 w-10 rounded-full bg-brand-muted/30" /></div>
              <h3 className="text-base font-semibold text-brand-ink sm:text-lg">Configure Your Identity</h3>
              <p className="mt-1 text-xs text-brand-muted">
                Define the words you use to refer to yourself in search prompts.
              </p>

              <form onSubmit={handleSaveYou} className="mt-4 space-y-3.5 sm:mt-5 sm:space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-brand-ink">
                    First-Person Search Terms (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={youAliasesInput}
                    onChange={(e) => setYouAliasesInput(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-brand-line bg-brand-surface px-3.5 py-2.5 text-base sm:text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/15"
                  />
                  <p className="mt-1 text-[11px] text-brand-muted">
                    Default terms: <span className="font-medium text-brand-ink">Me, I, Amara, Host</span>
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingYou(false)}
                    className="rounded-xl px-3.5 py-2 text-xs font-semibold text-brand-muted transition hover:text-brand-ink"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-brand-action px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-action-hover"
                  >
                    Save Identity
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Cluster Card Sub-component with quick-labeling input & suggested chips
function ClusterCard({
  cluster,
  onTeach,
  onIgnore,
}: {
  cluster: UnlabeledCluster;
  onTeach: (name: string) => void;
  onIgnore: () => void;
}) {
  const [customName, setCustomName] = useState("");
  const [showInput, setShowInput] = useState(false);

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (customName.trim()) {
      onTeach(customName.trim());
    }
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-brand-line/80 bg-brand-surface shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-violet/30 hover:shadow-md sm:flex-row">
      {/* Left Frame / Detection Visual */}
      <div className="relative flex shrink-0 items-center justify-center border-b border-brand-line/60 bg-gradient-to-br from-brand-canvas via-brand-line/20 to-brand-canvas p-4 sm:w-44 sm:border-b-0 sm:border-r">
        <div className="relative flex size-14 items-center justify-center rounded-2xl border-2 border-dashed border-brand-violet bg-brand-violet/10 shadow-xs">
          <span className="text-2xl">
            {cluster.kind === "face" ? "👤" : cluster.kind === "place" ? "📍" : "📦"}
          </span>
          <span className="absolute -right-2 -top-2 rounded-full bg-brand-action px-1.5 py-0.5 text-[9px] font-bold text-white shadow-xs">
            {cluster.confidence}%
          </span>
        </div>

        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-brand-ink/85 px-2 py-0.5 text-[9px] font-medium text-white shadow-xs backdrop-blur-xs">
          <ClapperboardIcon size={9} className="text-white/80" />
          <span>{cluster.appearanceCount} clips</span>
        </div>
      </div>

      {/* Right Details & Quick Labeling */}
      <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5 sm:p-4">
        <div>
          <div>
            <h4 className="truncate text-sm font-semibold text-brand-ink">{cluster.previewLabel}</h4>
            <p className="truncate text-xs font-medium text-brand-muted">{cluster.suggestedRole}</p>
          </div>

          {/* Quick Tag suggestions */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {cluster.quickTags.slice(0, 3).map((tag) => (
              <AnimateIcon animateOnHover asChild key={tag}><button
                type="button"
                onClick={() => onTeach(tag)}
                className="inline-flex items-center gap-1 rounded-md border border-brand-violet/25 bg-brand-violet/8 px-2 py-0.5 text-[11px] font-semibold text-brand-violet shadow-2xs transition hover:bg-brand-action hover:text-white"
              >
                <PlusSignIcon size={10} />
                <span className="truncate max-w-[100px]">{tag}</span>
              </button></AnimateIcon>
            ))}
          </div>
        </div>

        {/* Custom input or bottom actions */}
        <div className="mt-3.5 border-t border-brand-line/60 pt-2.5">
          {showInput ? (
            <form onSubmit={handleCustomSubmit} className="flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                placeholder="Name..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-brand-line px-2.5 py-1.5 sm:py-1 text-base sm:text-xs text-brand-ink outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet/20"
              />
              <button
                type="submit"
                disabled={!customName.trim()}
                className="rounded-lg bg-brand-action px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-brand-action-hover disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowInput(false)}
                className="rounded-lg px-2 py-1 text-xs text-brand-muted hover:text-brand-ink"
              >
                ✕
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setShowInput(true)}
                className="font-semibold text-brand-violet transition hover:text-brand-violet-hover hover:underline"
              >
                + Name...
              </button>
              <button
                type="button"
                onClick={onIgnore}
                className="font-medium text-brand-muted transition hover:text-brand-ink"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

