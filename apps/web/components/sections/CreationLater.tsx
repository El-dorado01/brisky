import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";

export function CreationLater() {
  return (
    <section className="border-t border-white/8 bg-surface-alt/62">
      <Reveal className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(48px,6vw,84px)] grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-9 items-start">
        <div className="min-w-0">
          <Eyebrow className="mb-4">08 — LATER</Eyebrow>
          <h2 className="m-0 font-display font-bold text-[clamp(23px,2.6vw,30px)] leading-[1.15] tracking-[-0.015em] max-w-[22ch]">
            Creation comes after understanding.
          </h2>
        </div>
        <p className="m-0 min-w-0 text-base leading-[1.65] text-text-secondary max-w-[58ch] text-pretty">
          Once an archive is understood, light tools follow naturally: collections, clip
          extraction, highlight reels. We&rsquo;re deliberately in no hurry. Brisky is not another
          AI editor, and search that actually works has to come first.
        </p>
      </Reveal>
    </section>
  );
}
