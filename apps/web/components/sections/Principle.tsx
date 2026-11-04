import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";

const cards = [
  {
    label: "KEPT",
    labelClass: "text-success",
    title: "Transcripts & embeddings",
    titleClass: "text-text-primary",
    desc: "Every spoken word, object, face and scene, searchable to the second.",
    descClass: "text-text-secondary",
    bg: "bg-surface-1",
  },
  {
    label: "KEPT",
    labelClass: "text-success",
    title: "Keyframes & lineage",
    titleClass: "text-text-primary",
    desc: "Thumbnails, and the relationships between original, backup, proxy and export.",
    descClass: "text-text-secondary",
    bg: "bg-surface-1",
  },
  {
    label: "DELETED",
    labelClass: "text-text-muted",
    title: "The master files",
    titleClass: "text-text-secondary",
    desc: "Scratch copies are purged when the job completes. Your originals never leave your storage.",
    descClass: "text-text-muted",
    bg: "bg-surface-0",
  },
  {
    label: "WHY IT MATTERS",
    labelClass: "text-text-muted",
    title: "You keep ownership",
    titleClass: "text-text-secondary",
    desc: "No duplicate archive to pay for, migrate, or hand to someone else.",
    descClass: "text-text-muted",
    bg: "bg-surface-0",
  },
];

export function Principle() {
  return (
    <section id="product" className="border-t border-white/8 bg-surface-alt/62">
      <Reveal className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(56px,7vw,104px)]">
        <Eyebrow>02 — THE PRINCIPLE</Eyebrow>
        <h2 className="m-0 mb-5 font-display font-bold text-[clamp(32px,4.2vw,52px)] leading-[1.02] tracking-[-0.02em] max-w-[16ch] text-balance">
          We keep the intelligence, not the tape.
        </h2>
        <p className="m-0 mb-11 text-[17.5px] leading-[1.6] text-text-secondary max-w-[62ch] text-pretty">
          Brisky is an intelligence layer, not another storage silo. Files are fetched into
          ephemeral scratch, understood, and purged. What persists is the understanding —
          transcripts, embeddings, keyframes, lineage.
        </p>

        <div className="grid grid-cols-1 min-[620px]:grid-cols-2 min-[1100px]:grid-cols-4 gap-px bg-white/8 border border-white/8 rounded-2xl overflow-hidden">
          {cards.map((card) => (
            <div key={card.title} className={`${card.bg} py-7 px-6`}>
              <div
                className={`font-mono text-[11px] tracking-[0.1em] mb-3.5 ${card.labelClass}`}
              >
                {card.label}
              </div>
              <div className={`text-[17px] font-semibold mb-2 ${card.titleClass}`}>
                {card.title}
              </div>
              <p className={`m-0 text-sm leading-[1.55] ${card.descClass}`}>{card.desc}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
