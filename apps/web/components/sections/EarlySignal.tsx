import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";

const stats = [
  { value: "0.9s", label: "median query latency" },
  { value: "94%", label: "top-3 retrieval accuracy" },
  { value: "0 B", label: "originals stored by us" },
];

export function EarlySignal() {
  return (
    <section className="border-t border-white/8 bg-surface-0/58">
      <Reveal>
        <div className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(48px,6vw,84px)] grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-9 items-center">
          <div className="min-w-0">
            <Eyebrow className="mb-4">07 — EARLY SIGNAL</Eyebrow>
            <p className="m-0 font-display font-normal text-[clamp(20px,2.3vw,28px)] leading-[1.3] max-w-[24ch] text-balance">
              Find the moment you remember in seconds instead of scrubbing.
            </p>
          </div>
          <div className="min-w-0 grid [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))] gap-5">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="font-mono text-[clamp(28px,3vw,36px)] text-ember tracking-[-0.02em]">
                  {stat.value}
                </div>
                <div className="text-[13px] text-text-secondary mt-1.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] pb-[clamp(40px,5vw,64px)]">
          <div className="font-mono text-[11.5px] text-text-muted">
            Figures from the built-in benchmark suite — replace with verified numbers before
            launch.
          </div>
        </div>
      </Reveal>
    </section>
  );
}
