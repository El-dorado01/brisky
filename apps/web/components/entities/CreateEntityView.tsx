"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, GraduationCap, Sparkles, Tag, User, Tv } from "lucide-react";
import { addCustomEntity } from "@/lib/entities-data";

const COLOR_PRESETS = [
  { label: "Violet", hex: "#7363de" },
  { label: "Cyan", hex: "#3fd1c0" },
  { label: "Amber", hex: "#f5a93e" },
  { label: "Coral", hex: "#e67e22" },
  { label: "Indigo", hex: "#5c6ac4" },
  { label: "Ink", hex: "#22283f" },
];

export function CreateEntityView() {
  const router = useRouter();
  const [category, setCategory] = useState<"person" | "thing">("person");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [aliasInput, setAliasInput] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLOR_PRESETS[0].hex);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("type");
      if (t === "thing") {
        setCategory("thing");
        setSelectedColor(COLOR_PRESETS[1].hex);
      } else if (t === "person") {
        setCategory("person");
        setSelectedColor(COLOR_PRESETS[0].hex);
      }
    }
  }, []);

  const handleAddAlias = () => {
    const trimmed = aliasInput.trim().replace(/^,+|,+$/g, "");
    if (trimmed && !aliases.includes(trimmed)) {
      setAliases([...aliases, trimmed]);
      setAliasInput("");
    }
  };

  const handleRemoveAlias = (aliasToRemove: string) => {
    setAliases(aliases.filter((a) => a !== aliasToRemove));
  };

  const handleAliasKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddAlias();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);

    // Combine existing aliases with any text remaining in input
    const finalAliases = [...aliases];
    const pending = aliasInput.trim().replace(/^,+|,+$/g, "");
    if (pending && !finalAliases.includes(pending)) {
      finalAliases.push(pending);
    }
    if (!finalAliases.includes(name.trim())) {
      finalAliases.unshift(name.trim());
    }

    if (category === "person") {
      addCustomEntity({
        category: "person",
        id: `person-${Date.now()}`,
        name: name.trim(),
        relationship: role.trim() || "Team Member",
        aliases: finalAliases,
        momentsCount: 0,
        videosCount: 0,
        lastSeen: "Just trained",
        faceColor: selectedColor,
        verified: true,
        notes: notes.trim(),
      });
    } else {
      addCustomEntity({
        category: "thing",
        id: `thing-${Date.now()}`,
        name: name.trim(),
        type: "object",
        categoryLabel: role.trim() || "Custom Entity",
        aliases: finalAliases,
        momentsCount: 0,
        videosCount: 0,
        lastSeen: "Just trained",
        color: selectedColor,
        description: notes.trim(),
      });
    }

    setTimeout(() => {
      router.push("/entities");
    }, 300);
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-24 pt-8 sm:px-8">
      {/* Back Button */}
      <div>
        <Link
          href="/entities"
          className="inline-flex items-center gap-2 rounded-xl text-xs font-semibold text-brand-muted transition hover:text-brand-ink"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to People & Entities</span>
        </Link>
      </div>

      {/* Header */}
      <div className="mt-4 border-b border-brand-line/80 pb-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-violet/10 px-3 py-1 text-xs font-semibold text-brand-violet">
          <GraduationCap className="size-3.5" />
          <span>Teach Brisky</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-brand-ink sm:text-3xl">
          Create & Teach a New Entity
        </h1>
        <p className="mt-1 text-sm text-brand-muted">
          Define a person, object, prop, or location so Brisky can ground them across your raw video archive for sub-second retrieval.
        </p>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="mt-8 space-y-7">
        {/* Category Switcher */}
        <div>
          <label className="block text-xs font-semibold text-brand-ink">
            What kind of entity would you like to teach?
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
            <button
              type="button"
              onClick={() => {
                setCategory("person");
                setSelectedColor(COLOR_PRESETS[0].hex);
              }}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                category === "person"
                  ? "border-brand-violet bg-brand-surface shadow-sm ring-2 ring-brand-violet/20"
                  : "border-brand-line bg-brand-surface/70 hover:border-brand-violet/30 hover:bg-brand-surface"
              }`}
            >
              <div
                className={`grid size-10 shrink-0 place-items-center rounded-xl transition ${
                  category === "person"
                    ? "bg-brand-action text-white"
                    : "bg-brand-canvas text-brand-muted"
                }`}
              >
                <User className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-ink">A Person</p>
                <p className="text-xs text-brand-muted">Faces, voiceprints & speaker tracks</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory("thing");
                setSelectedColor(COLOR_PRESETS[1].hex);
              }}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                category === "thing"
                  ? "border-brand-violet bg-brand-surface shadow-sm ring-2 ring-brand-violet/20"
                  : "border-brand-line bg-brand-surface/70 hover:border-brand-violet/30 hover:bg-brand-surface"
              }`}
            >
              <div
                className={`grid size-10 shrink-0 place-items-center rounded-xl transition ${
                  category === "thing"
                    ? "bg-brand-action text-white"
                    : "bg-brand-canvas text-brand-muted"
                }`}
              >
                <Tv className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-ink">Thing or Place</p>
                <p className="text-xs text-brand-muted">Props, gear, sets & locations</p>
              </div>
            </button>
          </div>
        </div>

        {/* Entity Primary Name */}
        <div className="rounded-3xl border border-brand-line/70 bg-brand-surface p-6 shadow-xs sm:p-7 space-y-6">
          <div>
            <label className="block text-xs font-semibold text-brand-ink">
              {category === "person" ? "Full Name or Primary Label *" : "Entity / Object Name *"}
            </label>
            <input
              type="text"
              required
              placeholder={
                category === "person" ? "e.g. Sarah Chen" : "e.g. Red Vintage Stratocaster"
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-brand-line bg-brand-canvas px-4 py-3 text-base sm:text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:bg-brand-surface focus:ring-4 focus:ring-brand-violet/10"
            />
            <p className="mt-1.5 text-xs text-brand-muted">
              {category === "person"
                ? "The official name shown across search result filters and speaker cards."
                : "The primary name of the object, gear item, or filming set."}
            </p>
          </div>

          {/* Role / Category */}
          <div>
            <label className="block text-xs font-semibold text-brand-ink">
              {category === "person" ? "Relationship or Role" : "Sub-Category"}
            </label>
            <input
              type="text"
              placeholder={
                category === "person"
                  ? "e.g. Co-host, Uncle, Lead Guitarist, Guest"
                  : "e.g. Musical Instrument, Prop, Filming Location"
              }
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-brand-line bg-brand-canvas px-4 py-3 text-base sm:text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:bg-brand-surface focus:ring-4 focus:ring-brand-violet/10"
            />
          </div>

          {/* Search Aliases with Tag Preview */}
          <div>
            <label className="block text-xs font-semibold text-brand-ink">
              Search Aliases & Spoken Keywords
            </label>
            <p className="mt-1 text-xs text-brand-muted">
              Add words or nicknames you might speak when searching (e.g.{" "}
              {category === "person"
                ? "“where I was talking to Sarah”, “Chen”, “co-host”"
                : "“red guitar”, “fender”, “strat”"}
              ). Press Enter or comma to add.
            </p>

            <div className="mt-2 flex gap-2">
              <input
                type="text"
                placeholder="Type an alias and press Enter..."
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={handleAliasKeyDown}
                className="flex-1 rounded-2xl border border-brand-line bg-brand-canvas px-4 py-2.5 text-base sm:text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:bg-brand-surface focus:ring-4 focus:ring-brand-violet/10"
              />
              <button
                type="button"
                onClick={handleAddAlias}
                className="rounded-2xl border border-brand-line bg-brand-canvas px-4 py-2.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-line/50"
              >
                Add Alias
              </button>
            </div>

            {aliases.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {aliases.map((alias) => (
                  <span
                    key={alias}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand-violet/30 bg-brand-violet/8 px-3 py-1 text-xs font-medium text-brand-violet"
                  >
                    <Tag className="size-3" />
                    <span>{alias}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAlias(alias)}
                      className="ml-1 text-brand-violet/70 hover:text-brand-violet"
                      aria-label={`Remove alias ${alias}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Color Accent Picker */}
          <div>
            <label className="block text-xs font-semibold text-brand-ink">
              Visual Avatar Accent
            </label>
            <div className="mt-2.5 flex items-center gap-3">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() => setSelectedColor(color.hex)}
                  aria-label={color.label}
                  className={`relative size-8 rounded-full transition-transform hover:scale-110 ${
                    selectedColor === color.hex ? "scale-110 ring-2 ring-offset-2 ring-brand-violet" : ""
                  }`}
                  style={{ backgroundColor: color.hex }}
                >
                  {selectedColor === color.hex && (
                    <span className="grid size-full place-items-center text-white">
                      <Check className="size-4" strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Visual Cues & Training Notes */}
          <div>
            <label className="block text-xs font-semibold text-brand-ink">
              Visual Cues & Context Notes
            </label>
            <textarea
              rows={3}
              placeholder={
                category === "person"
                  ? "e.g. Usually wears glasses; seated on camera left in the podcast studio."
                  : "e.g. Kept on the instrument stand behind the mixing console in Studio A."
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-brand-line bg-brand-canvas px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:bg-brand-surface focus:ring-4 focus:ring-brand-violet/10"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/entities"
            className="rounded-2xl px-5 py-3 text-xs font-semibold text-brand-muted transition hover:text-brand-ink"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!name.trim() || isSubmitting}
            className="inline-flex items-center gap-2 rounded-2xl bg-brand-action px-6 py-3 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-action-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <GraduationCap className="size-4" strokeWidth={2} />
            <span>{isSubmitting ? "Teaching Brisky..." : "Teach Brisky This Entity"}</span>
          </button>
        </div>
      </form>
    </main>
  );
}
