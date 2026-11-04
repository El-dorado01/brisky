import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";

const bullets = [
  {
    title: "Ephemeral processing",
    desc: "Files enter scratch storage, get understood, and are deleted. Nothing lingers.",
  },
  {
    title: "No master-file hoarding",
    desc: "We never become the place your footage lives. Disconnect and your archive is untouched.",
  },
  {
    title: "Quiet continuity",
    desc: "New footage is understood as it arrives, so the archive stays coherent without anyone maintaining it.",
  },
];

export function Trust() {
  return (
    <section id="trust" className="border-t border-white/8 bg-surface-alt/62">
      <Reveal className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(56px,7vw,104px)]">
        <Eyebrow>06 — TRUST & STEWARDSHIP</Eyebrow>
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-[clamp(36px,5vw,64px)]">
          <div className="min-w-0">
            <h2 className="m-0 mb-6 font-display font-bold text-[clamp(28px,3.6vw,44px)] leading-[1.05] tracking-[-0.018em] max-w-[18ch] text-balance">
              Your archive stays yours.
            </h2>
            <div className="flex flex-col gap-[22px] max-w-[48ch]">
              {bullets.map((b) => (
                <div key={b.title} className="flex gap-3.5">
                  <span className="w-[7px] h-[7px] rounded-full bg-ember mt-2 shrink-0" />
                  <div>
                    <div className="text-base font-semibold mb-1.5">{b.title}</div>
                    <p className="m-0 text-[14.5px] leading-[1.6] text-text-secondary">
                      {b.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 border border-white/8 rounded-2xl bg-surface-1 py-7 px-[26px] flex flex-col gap-3">
            <div className="font-mono text-[11px] tracking-[0.1em] text-text-muted mb-1.5">
              ARCHITECTURE
            </div>
            <div className="border border-white/16 rounded-[10px] py-4 px-[18px] bg-surface-2">
              <div className="text-[15px] font-semibold mb-1">Your storage</div>
              <div className="font-mono text-xs text-text-muted">
                DRIVE · NAS · CLOUD — ORIGINALS, ALWAYS
              </div>
            </div>
            <div className="font-mono text-xs text-text-muted pl-[18px]">
              ↓ read, understand, purge
            </div>
            <div className="border border-ember/35 rounded-[10px] py-4 px-[18px] bg-ember/7">
              <div className="text-[15px] font-semibold mb-1 text-ember">
                Brisky intelligence layer
              </div>
              <div className="font-mono text-xs text-text-secondary">
                TRANSCRIPTS · EMBEDDINGS · KEYFRAMES · LINEAGE
              </div>
            </div>
            <div className="font-mono text-xs text-text-muted pl-[18px]">↓ query</div>
            <div className="border border-white/16 rounded-[10px] py-4 px-[18px] bg-surface-2">
              <div className="text-[15px] font-semibold mb-1">A searchable archive</div>
              <div className="font-mono text-xs text-text-muted">
                NATURAL LANGUAGE → EXACT TIMESTAMP
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
