import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";

const files = [
  { name: "wedding_hartley_A001.mov", status: "INDEXED", statusClass: "text-success" },
  { name: "kyoto_broll_0042.mp4", status: "VISUAL 62%", statusClass: "text-ember" },
  { name: "podcast_ep114_cam2.mp4", status: "QUEUED", statusClass: "text-text-muted" },
];

const surfaceCards = [
  { label: "SCREENSHOT — JOB OBSERVABILITY", title: "Job observability", desc: "Watch the system think. Every stage, every file, no hidden queue." },
  { label: "DIAGRAM — LINEAGE GRAPH", title: "Lineage graph", desc: "Original, backup, proxy, export — one relationship map instead of guesswork." },
  { label: "SCREENSHOT — BENCHMARK", title: "Benchmark", desc: "Retrieval speed and accuracy, measured in the product and visible to you." },
];

export function InProduct() {
  return (
    <section className="border-t border-white/8 bg-surface-alt/62">
      <Reveal className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(56px,7vw,104px)]">
        <Eyebrow>04 — IN THE PRODUCT</Eyebrow>
        <h2 className="m-0 mb-11 font-display font-bold text-[clamp(28px,3.6vw,44px)] leading-[1.05] tracking-[-0.018em] max-w-[24ch] text-balance">
          The surfaces you&rsquo;ll actually work in.
        </h2>

        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-5 mb-5">
          <div className="border border-white/8 rounded-2xl bg-surface-1 overflow-hidden">
            <div className="p-5 border-b border-white/8">
              <div className="flex items-center justify-between gap-2.5 mb-3.5">
                <span className="font-mono text-[11px] tracking-[0.1em] text-text-muted">
                  MEDIA LIBRARY — SYNC STATUS
                </span>
                <span className="font-mono text-[11px] text-success">● SYNCED</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {files.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-[9px] bg-surface-2"
                  >
                    <span
                      className="w-[30px] h-5 rounded shrink-0"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(135deg, #24262C 0 4px, #1C1E23 4px 8px)",
                      }}
                    />
                    <span className="font-mono text-xs text-text-secondary flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {file.name}
                    </span>
                    <span className={`font-mono text-[11px] ${file.statusClass}`}>
                      {file.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 pt-[18px] pb-[22px]">
              <div className="text-[17px] font-semibold mb-1.5">Connectors & library</div>
              <p className="m-0 text-sm leading-[1.55] text-text-secondary">
                Google Drive first. Point Brisky at a folder and it starts understanding — with
                live status per file.
              </p>
            </div>
          </div>

          <div className="border border-white/8 rounded-2xl bg-surface-1 overflow-hidden">
            <div className="p-5 border-b border-white/8">
              <div
                className="rounded-[10px] aspect-[16/8] flex items-center justify-center"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(135deg, #24262C 0 7px, #1C1E23 7px 14px)",
                }}
              >
                <span className="font-mono text-[11px] text-text-secondary">
                  FRAME AT 00:04:12
                </span>
              </div>
              <div className="flex items-center gap-3 mt-3.5">
                <span className="font-mono text-xs text-ember">04:12</span>
                <span className="relative flex-1 h-0.5 bg-white/16">
                  <span className="absolute left-0 top-0 w-[34%] h-0.5 bg-ember" />
                  <span className="absolute left-[34%] -top-1 w-[9px] h-[9px] rounded-full bg-ember" />
                </span>
                <span className="font-mono text-xs text-text-muted">12:04</span>
              </div>
            </div>
            <div className="px-5 pt-[18px] pb-[22px]">
              <div className="text-[17px] font-semibold mb-1.5">Seek to the second</div>
              <p className="m-0 text-sm leading-[1.55] text-text-secondary">
                Open a result and the player lands on the exact frame, streamed through an
                on-demand proxy.
              </p>
            </div>
          </div>
        </div>

        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
          {surfaceCards.map((card) => (
            <div
              key={card.title}
              className="border border-white/8 rounded-2xl bg-surface-1 overflow-hidden"
            >
              <div
                className="aspect-video flex items-center justify-center"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(135deg, #1C1E23 0 7px, #141519 7px 14px)",
                }}
              >
                <span className="font-mono text-[11px] text-text-secondary">{card.label}</span>
              </div>
              <div className="px-5 pt-[18px] pb-[22px]">
                <div className="text-[17px] font-semibold mb-1.5">{card.title}</div>
                <p className="m-0 text-sm leading-[1.55] text-text-secondary">{card.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
