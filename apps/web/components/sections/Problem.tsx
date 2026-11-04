import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";

const TILE_COUNT = 12;
const HIGHLIGHTED_INDEX = 5;

export function Problem() {
  return (
    <section className="border-t border-white/8 bg-surface-0/58">
      <Reveal className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(56px,7vw,100px)] grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))] gap-[clamp(36px,5vw,64px)] items-center">
        <div className="min-w-0">
          <Eyebrow>01 — THE PROBLEM</Eyebrow>
          <h2 className="m-0 mb-5 font-display font-bold text-[clamp(28px,3.4vw,42px)] leading-[1.08] tracking-[-0.015em] max-w-[20ch] text-balance">
            You remember the moment. You don&rsquo;t remember the file.
          </h2>
          <p className="m-0 mb-3.5 text-[17px] leading-[1.6] text-text-secondary max-w-[48ch] text-pretty">
            Four years of footage across three drives and two cloud accounts. The clip exists.
            Finding it means opening files one by one and scrubbing.
          </p>
          <p className="m-0 text-[17px] leading-[1.6] text-text-secondary max-w-[48ch]">
            Search only reaches filenames. Your memory works in moments.
          </p>
        </div>

        <div className="min-w-0 border border-white/8 rounded-2xl bg-surface-1 p-6">
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(66px,1fr))] gap-[9px]">
            {Array.from({ length: TILE_COUNT }).map((_, i) =>
              i === HIGHLIGHTED_INDEX ? (
                <div
                  key={i}
                  className="aspect-[16/10] rounded-md shadow-[0_0_0_1px_#F5A93E] animate-pulse-soft"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(135deg, #2A2118 0 5px, #221C15 5px 10px)",
                  }}
                />
              ) : (
                <div
                  key={i}
                  className="aspect-[16/10] rounded-md"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(135deg, #24262C 0 5px, #1C1E23 5px 10px)",
                  }}
                />
              ),
            )}
          </div>
          <div className="mt-4 font-mono text-xs text-text-muted">2,418 CLIPS · 1 YOU NEED</div>
        </div>
      </Reveal>
    </section>
  );
}
