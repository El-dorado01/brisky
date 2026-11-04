import { Eyebrow } from "@/components/ui/Eyebrow";
import { ModalityBadge } from "@/components/ui/ModalityBadge";
import { Reveal } from "@/components/ui/Reveal";
import { pipelineStages, type StageStatus } from "@/lib/pipeline";

// Connector-line visibility per stage index, precomputed for each of the
// three responsive column counts (2 / 3 / 6 stages per row) so the line
// never trails off after the last card in a row — mirrors the original's
// runtime "lastInRow" calculation without needing dynamic class names.
const lineClassByIndex = [
  "h-[1.5px] flex-1 bg-success",
  "h-[1.5px] flex-1 bg-transparent min-[560px]:bg-success",
  "h-[1.5px] flex-1 bg-white/16 min-[560px]:bg-transparent min-[880px]:bg-white/16",
  "h-[1.5px] flex-1 bg-transparent min-[560px]:bg-white/16",
  "h-[1.5px] flex-1 bg-white/16",
  "h-[1.5px] flex-1 bg-transparent",
];

function StageDot({ status }: { status: StageStatus }) {
  if (status === "done") {
    return <span className="w-[11px] h-[11px] rounded-full bg-success shrink-0" />;
  }
  if (status === "active") {
    return (
      <span className="w-[13px] h-[13px] rounded-full bg-ember shrink-0 animate-halo" />
    );
  }
  return (
    <span className="w-[11px] h-[11px] rounded-full bg-surface-3 shadow-[0_0_0_1px_rgba(255,255,255,.16)] shrink-0" />
  );
}

const labelColor: Record<StageStatus, string> = {
  active: "text-ember",
  done: "text-text-secondary",
  todo: "text-text-muted",
};

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-white/8 bg-surface-0/58">
      <Reveal className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(56px,7vw,104px)]">
        <Eyebrow>03 — HOW IT WORKS</Eyebrow>
        <h2 className="m-0 mb-11 font-display font-bold text-[clamp(28px,3.6vw,44px)] leading-[1.05] tracking-[-0.018em] max-w-[22ch] text-balance">
          Three layers, built in order.
        </h2>

        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr))] gap-5 mb-14">
          <div className="border border-white/8 rounded-2xl bg-surface-1 py-7 px-[26px]">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-[9px] h-[9px] rounded-full bg-ember" />
              <span className="font-mono text-[11px] tracking-[0.1em] text-ember">
                LAYER 01 — LIVE
              </span>
            </div>
            <div className="font-display font-bold text-[23px] mb-2.5">Intelligence</div>
            <p className="m-0 mb-[18px] text-[14.5px] leading-[1.6] text-text-secondary">
              Single-file understanding. Speech, visuals, on-screen text, people, actions and
              scenes, all aligned to a timecode.
            </p>
            <div className="flex flex-wrap gap-[7px]">
              <ModalityBadge kind="speech" />
              <ModalityBadge kind="visual" />
              <ModalityBadge kind="semantic" />
            </div>
          </div>

          <div className="border border-white/8 rounded-2xl bg-surface-1 py-7 px-[26px]">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-[9px] h-[9px] rounded-full bg-pulse" />
              <span className="font-mono text-[11px] tracking-[0.1em] text-pulse">
                LAYER 02 — LIVE
              </span>
            </div>
            <div className="font-display font-bold text-[23px] mb-2.5">Memory</div>
            <p className="m-0 mb-[18px] text-[14.5px] leading-[1.6] text-text-secondary">
              A Media Registry across the whole archive and over time: what exists, where it
              lives, what&rsquo;s duplicated, what changed.
            </p>
            <div className="font-mono text-[11.5px] leading-[1.8] text-text-muted">
              REGISTRY · MEDIA GRAPH · DEDUPE
            </div>
          </div>

          <div className="border border-white/8 rounded-2xl bg-surface-alt/62 py-7 px-[26px]">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-[9px] h-[9px] rounded-full bg-surface-3 shadow-[0_0_0_1px_rgba(255,255,255,.16)]" />
              <span className="font-mono text-[11px] tracking-[0.1em] text-text-muted">
                LAYER 03 — LATER
              </span>
            </div>
            <div className="font-display font-bold text-[23px] mb-2.5 text-text-secondary">
              Creation
            </div>
            <p className="m-0 mb-[18px] text-[14.5px] leading-[1.6] text-text-muted">
              Only once the first two feel solid: collections, clip extraction, rough cuts. Light
              by design.
            </p>
            <div className="font-mono text-[11.5px] leading-[1.8] text-text-muted">
              COLLECTIONS · CLIPS · REELS
            </div>
          </div>
        </div>

        <div className="border border-white/8 rounded-2xl bg-surface-1 py-7 px-[clamp(18px,3vw,30px)]">
          <div className="flex justify-between items-baseline flex-wrap gap-2.5 mb-7">
            <div className="font-mono text-xs tracking-[0.1em] text-text-secondary">
              PIPELINE — PER FILE
            </div>
            <div className="font-mono text-xs text-text-muted">
              JOB #4821 · SCRATCH PURGED ON COMPLETION
            </div>
          </div>

          <div className="grid grid-cols-2 min-[560px]:grid-cols-3 min-[880px]:grid-cols-6 gap-x-3 gap-y-[18px]">
            {pipelineStages.map((stage, i) => (
              <div key={stage.label} className="flex flex-col gap-2.5 min-w-0">
                <div className="flex items-center gap-2 h-[13px]">
                  <StageDot status={stage.status} />
                  <span className={lineClassByIndex[i]} />
                </div>
                <div className={`font-mono text-[11.5px] ${labelColor[stage.status]}`}>
                  {stage.label}
                </div>
                <div className="text-[13px] text-text-muted leading-[1.45]">
                  {stage.description}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-[13.5px] text-text-muted leading-[1.55] max-w-[74ch]">
            One Ember node is ever active at a time. The system shows its work without shouting
            about it — completed stages settle to green, and the scratch copy disappears at
            Purge.
          </div>
        </div>
      </Reveal>
    </section>
  );
}
