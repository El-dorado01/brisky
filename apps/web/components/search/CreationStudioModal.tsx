"use client";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

import { useState } from "react";
import { FactoryClose as X, FactorySparkles as Sparkles } from "@/components/connectors/FactoryIcons";
import { CheckIcon } from "@/components/animate-ui/icons/hugeicons/check";
import { Copy01Icon } from "@/components/animate-ui/icons/hugeicons/copy-01";
import { Download01Icon } from "@/components/animate-ui/icons/hugeicons/download-01";
import { PlayIcon } from "@/components/animate-ui/icons/hugeicons/play";
import { TrashIcon } from "@/components/animate-ui/icons/hugeicons/trash";
import { MessageSquareTextIcon } from "@/components/animate-ui/icons/hugeicons/message-square-text";
import { MessageSquareQuoteIcon } from "@/components/animate-ui/icons/hugeicons/message-square-quote";
import { ListIcon } from "@/components/animate-ui/icons/hugeicons/list";
import { ClapperboardIcon } from "@/components/animate-ui/icons/hugeicons/clapperboard";
import { MessageSquareCodeIcon } from "@/components/animate-ui/icons/hugeicons/message-square-code";
import { outputFormats, type OutputFormat, type SearchMoment } from "@/lib/search-results";

const formatIcons: Record<OutputFormat["id"], React.ComponentType<{ size?: number; className?: string }>> = {
  summary: MessageSquareTextIcon,
  quotes: MessageSquareQuoteIcon,
  timeline: ListIcon,
  reel: ClapperboardIcon,
  edl: MessageSquareCodeIcon,
};

export function CreationStudioModal({
  open,
  moments,
  initialFormat = "summary",
  onRemoveMoment,
  onClose,
}: {
  open: boolean;
  moments: SearchMoment[];
  initialFormat?: OutputFormat["id"];
  onRemoveMoment: (id: string) => void;
  onClose: () => void;
}) {
  const [activeFormat, setActiveFormat] = useState<OutputFormat["id"]>(initialFormat);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const totalSec = moments.reduce((acc, m) => acc + m.durationSec, 0);
  const currentMeta = outputFormats.find((f) => f.id === activeFormat)!;

  function handleCopy() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Make from collection"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-brand-line bg-brand-surface text-brand-ink shadow-[0_30px_80px_rgba(34,40,63,0.25)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-brand-line px-6 py-5 sm:px-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet/10 px-2.5 py-0.5 text-xs font-medium text-brand-violet">
                <Sparkles className="size-3.5" strokeWidth={2} />
                Make from collection
              </span>
              <span className="text-xs text-brand-muted">
                {moments.length} {moments.length === 1 ? "moment" : "moments"} · {totalSec}s total
              </span>
            </div>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight">
              Turn your connected moments into an output
            </h2>
          </div>
          <AnimateIcon animateOnHover asChild><button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-brand-muted transition hover:bg-brand-canvas hover:text-brand-ink"
          >
            <X className="size-5" strokeWidth={1.8} />
          </button></AnimateIcon>
        </div>

        {/* Output format selector tabs */}
        <div className="flex gap-2 overflow-x-auto border-b border-brand-line bg-brand-canvas/60 px-6 py-3 sm:px-8">
          {outputFormats.map((fmt) => {
            const Icon = formatIcons[fmt.id];
            const active = activeFormat === fmt.id;
            return (
              <AnimateIcon animateOnHover asChild key={fmt.id}><button
                type="button"
                onClick={() => setActiveFormat(fmt.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
                  active
                    ? "border-brand-violet bg-brand-action text-white shadow-[0_4px_14px_rgba(115,99,222,0.22)]"
                    : "border-brand-line bg-brand-surface text-brand-ink hover:border-brand-violet/40"
                }`}
              >
                <Icon size={15} />
                <span>{fmt.label}</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                    active ? "bg-brand-surface/20 text-white" : "bg-brand-canvas text-brand-muted"
                  }`}
                >
                  {fmt.badge}
                </span>
              </button></AnimateIcon>
            );
          })}
        </div>

        {/* Body: Left = connected moments sequence, Right = live output preview */}
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Left column: connected moments */}
          <aside className="border-b border-brand-line bg-brand-canvas/40 p-5 lg:border-b-0 lg:border-r">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
              Connected sequence ({moments.length})
            </h3>
            <ol className="mt-3 space-y-2.5">
              {moments.map((m, i) => (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-brand-line bg-brand-surface p-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-brand-violet/10 text-[10px] font-semibold text-brand-violet">
                        {i + 1}
                      </span>
                      <span className="truncate font-medium text-brand-ink">{m.file}</span>
                    </div>
                    <p className="mt-1 pl-5 text-[11px] text-brand-muted">
                      {m.start} – {m.end} ({m.durationSec}s)
                    </p>
                  </div>
                  {moments.length > 1 && (
                    <AnimateIcon animateOnHover asChild><button
                      type="button"
                      onClick={() => onRemoveMoment(m.id)}
                      aria-label={`Remove ${m.file}`}
                      className="grid size-6 shrink-0 place-items-center rounded-lg text-brand-muted transition hover:bg-brand-canvas hover:text-brand-ink"
                    >
                      <TrashIcon size={14} />
                    </button></AnimateIcon>
                  )}
                </li>
              ))}
            </ol>
          </aside>

          {/* Right column: generated artifact preview */}
          <div className="flex flex-col justify-between p-6 sm:p-8">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-brand-violet">{currentMeta.badge} output</span>
                  <h3 className="text-lg font-semibold">{currentMeta.label}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <AnimateIcon animateOnHover asChild><button
                    type="button"
                    onClick={handleCopy}
                    className="flex h-9 items-center gap-1.5 rounded-xl border border-brand-line bg-brand-surface px-3 text-xs font-medium text-brand-ink transition hover:border-brand-violet/40"
                  >
                    {copied ? <CheckIcon size={14} className="text-brand-violet" /> : <Copy01Icon size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </button></AnimateIcon>
                  <AnimateIcon animateOnHover asChild><button
                    type="button"
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-action px-3.5 text-xs font-semibold text-white transition hover:bg-brand-action-hover"
                  >
                    <Download01Icon size={14} />
                    {activeFormat === "reel"
                      ? "Render MP4"
                      : activeFormat === "edl"
                        ? "Download XML"
                        : "Export Markdown"}
                  </button></AnimateIcon>
                </div>
              </div>
              <p className="mt-1 text-xs text-brand-muted">{currentMeta.tagline}</p>

              {/* Format-specific preview */}
              <div className="mt-5 rounded-2xl border border-brand-line bg-brand-canvas/60 p-5">
                {activeFormat === "summary" && (
                  <div className="space-y-4 text-sm leading-relaxed">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
                        Executive Synthesis
                      </h4>
                      <p className="mt-1.5 text-brand-ink">
                        Across <strong>{moments.length} indexed moments</strong> ({totalSec}s of source media), speakers
                        converge on reallocating Q4/Q1 budget toward enterprise demand and self-serve onboarding while
                        eliminating manual sprint workflows.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
                        Cited Moments
                      </h4>
                      <ul className="mt-2 space-y-2 text-xs">
                        {moments.map((m, idx) => (
                          <li key={m.id} className="rounded-xl bg-brand-surface p-3 border border-brand-line">
                            <span className="font-semibold text-brand-violet">
                              [{idx + 1}] {m.file} @ {m.start}
                            </span>{" "}
                            — <span className="text-brand-ink">{m.reasoning}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {activeFormat === "quotes" && (
                  <ul className="space-y-3">
                    {moments.map((m) => (
                      <li key={m.id} className="rounded-xl border border-brand-line bg-brand-surface p-4">
                        <p className="text-sm italic text-brand-ink">{m.transcript}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-brand-muted">
                          <span className="font-medium text-brand-ink">{m.speaker ?? "Visual / ambient"}</span>
                          <span className="rounded-md bg-brand-violet/10 px-2 py-0.5 font-medium text-brand-violet">
                            {m.file} · {m.start}–{m.end}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {activeFormat === "timeline" && (
                  <ol className="space-y-3 border-l-2 border-brand-violet/30 pl-4">
                    {moments.map((m, idx) => (
                      <li key={m.id} className="relative rounded-xl border border-brand-line bg-brand-surface p-3.5">
                        <span className="absolute -left-[23px] top-4 size-2.5 rounded-full bg-brand-action ring-4 ring-white" />
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-brand-violet">
                            Chapter 0{idx + 1} · {m.tags[0] ?? "Beat"}
                          </span>
                          <span className="text-brand-muted">
                            {m.start} ({m.durationSec}s)
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-brand-ink">{m.reasoning}</p>
                        <p className="mt-0.5 text-xs text-brand-muted">
                          Source: {m.file} — {m.visualNote}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}

                {activeFormat === "reel" && (
                  <div>
                    <div className="relative flex aspect-video flex-col items-center justify-center overflow-hidden rounded-xl border border-brand-line bg-brand-surface p-6 text-center">
                      <span className="grid size-12 place-items-center rounded-full bg-brand-action text-white shadow-lg">
                        <PlayIcon size={20} className="translate-x-[1px]" />
                      </span>
                      <p className="mt-3 text-sm font-semibold text-brand-ink">
                        Stitched sequence · {moments.length} clips ({totalSec}s)
                      </p>
                      <p className="mt-1 text-xs text-brand-muted">
                        Streams via on-demand 720p proxy cuts without duplicating your camera masters.
                      </p>
                    </div>
                    <div className="mt-3 flex gap-1.5 overflow-x-auto pt-1">
                      {moments.map((m, idx) => (
                        <div
                          key={m.id}
                          style={{ flex: Math.max(1, m.durationSec) }}
                          className="min-w-[90px] rounded-lg border border-brand-violet/30 bg-brand-violet/10 px-2.5 py-2 text-[11px]"
                        >
                          <p className="truncate font-semibold text-brand-violet">
                            {idx + 1}. {m.file}
                          </p>
                          <p className="text-brand-muted">
                            {m.start} ({m.durationSec}s)
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeFormat === "edl" && (
                  <pre className="overflow-x-auto rounded-xl border border-brand-line bg-brand-surface p-4 font-mono text-xs leading-relaxed text-brand-ink">
{`TITLE: BRISKY_COLLECTION_EXPORT
FCM: NON-DROP FRAME

${moments
  .map(
    (m, idx) =>
      `${String(idx + 1).padStart(3, "0")}  AX       V     C        ${m.start}:00 ${m.end}:00\n* FROM CLIP NAME: ${m.file}\n* SOURCE FOLDER: ${m.folder} (${m.source})\n* NOTE: ${m.reasoning}`,
  )
  .join("\n\n")}`}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

