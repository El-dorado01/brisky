"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ModalityBadge } from "@/components/ui/ModalityBadge";
import { useTypewriter } from "@/hooks/useTypewriter";
import { heroQueries } from "@/lib/queries";

const strongEaseOut = [0.23, 1, 0.32, 1] as const;

export function Hero() {
  const { value: typed, onChange } = useTypewriter(heroQueries);
  const showResults = typed.length > 6;

  return (
    <section
      id="top"
      className="relative"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 900px 620px at 82% 12%, rgba(245,169,62,.10), transparent 62%), " +
          "radial-gradient(ellipse 700px 520px at 4% 96%, rgba(63,209,192,.07), transparent 60%)",
      }}
    >
      <div className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] pt-[clamp(52px,8vw,108px)] pb-[clamp(44px,6vw,84px)] grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr))] gap-[clamp(40px,5vw,72px)] items-center">
        <div className="min-w-0 flex flex-col items-center text-center col-span-full">
          <span className="animate-rise inline-flex items-center gap-[9px] px-[13px] py-2 rounded-[10px] bg-white/2 backdrop-blur-[4px] shadow-[inset_0_1px_1px_rgba(255,255,255,.1)] mb-[26px]">
            <span className="bg-ember text-surface-0 rounded-[6px] text-xs font-semibold px-2 py-0.5">
              New
            </span>
            <span className="text-[13.5px] font-medium text-text-secondary whitespace-nowrap">
              Media Registry v2 is live
            </span>
          </span>

          <h1 className="animate-rise [animation-delay:0.1s] m-0 mb-3.5 font-display font-bold text-[clamp(40px,6.2vw,76px)] leading-[1.02] tracking-[-0.025em] max-w-[16ch] text-balance">
            Find the moment,
            <br />
            <span className="font-extralight">not the file.</span>
          </h1>

          <p className="animate-rise [animation-delay:0.2s] m-0 mb-[30px] text-[clamp(16px,1.5vw,19px)] leading-[1.55] text-text-secondary max-w-[52ch] text-pretty">
            Connect your media once. Brisky continuously understands it,
            <br />
            so you can find any moment by describing what you remember.
          </p>

          <div className="animate-rise [animation-delay:0.3s] flex flex-wrap gap-3 justify-center mb-[22px]">
            <Button href="#pricing" className="text-[15px] px-7 py-3.5 rounded-full">
              Connect your media
            </Button>
            <Button
              href="#how"
              variant="secondary"
              className="text-[15px] px-7 py-3.5 rounded-full"
            >
              See how it works
            </Button>
          </div>

          <div className="animate-rise [animation-delay:0.4s] flex items-center gap-3.5 flex-wrap justify-center">
            <span className="font-mono text-sm text-ember">00:37</span>
            <span className="relative w-[min(300px,52vw)] h-0.5 bg-white/16">
              <span className="absolute left-0 -top-[3px] w-2 h-2 rounded-full bg-text-dim" />
              <span className="absolute left-[22%] top-0 w-[38%] h-0.5 bg-ember" />
              <span className="absolute left-[22%] -top-1 w-[9px] h-[9px] rounded-full bg-ember animate-halo" />
              <span className="absolute left-[60%] -top-[3px] w-2 h-2 rounded-full bg-text-dim" />
            </span>
            <span className="font-mono text-sm text-ember">01:02</span>
          </div>
          <div className="mt-[18px] font-mono text-xs text-text-muted">
            Originals stay in your Drive. We delete the bytes.
          </div>
        </div>

        <div className="animate-rise [animation-delay:0.5s] col-span-full min-w-0 w-full max-w-[960px] mx-auto mt-[52px] border border-white/8 rounded-2xl bg-surface-1/88 backdrop-blur-md shadow-[0_40px_90px_-30px_rgba(0,0,0,.8)] overflow-hidden">
          <div className="flex items-center justify-between gap-2.5 px-4 py-3 border-b border-white/8">
            <span className="font-mono text-[11px] tracking-[0.1em] text-text-muted">
              MOMENT SEARCH
            </span>
            <span className="font-mono text-[11px] text-text-muted">2,418 clips indexed</span>
          </div>

          <div className="pt-5 px-[18px]">
            <div className="relative isolate">
              <div
                className="absolute inset-x-0 top-0 -bottom-[5px] -z-10 rounded-2xl opacity-95 blur-[0.4px]"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #F5A93E 0%, #E8B45C 30%, #9CC39A 62%, #3FD1C0 100%)",
                }}
              />
              <div className="border border-white/[0.065] rounded-2xl bg-[#111214] shadow-[0_2px_40px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.04)] p-5 flex flex-col gap-[22px] min-h-[150px]">
                <input
                  value={typed}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="Describe the moment you remember…"
                  aria-label="Describe the moment you remember"
                  className="w-full bg-transparent border-0 outline-none rounded-sm font-body text-[17px] text-text-primary p-0 focus-visible:ring-2 focus-visible:ring-pulse/60"
                />
                <div className="mt-auto flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Add a connector"
                    className="w-11 h-11 shrink-0 rounded-full border border-white/30 bg-white/[0.028] text-[#E8E8E8] flex items-center justify-center cursor-pointer transition-[transform,background-color] duration-150 ease-out hover:bg-white/[0.06] active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-pulse focus-visible:outline-offset-2"
                  >
                    <Plus size={18} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="h-[42px] inline-flex items-center gap-[9px] px-4 rounded-full border border-white/30 bg-white/[0.028] text-text-primary font-body text-[14.5px] cursor-pointer transition-[transform,background-color] duration-150 ease-out hover:bg-white/[0.06] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-pulse focus-visible:outline-offset-2"
                  >
                    <span className="w-[7px] h-[7px] rounded-full bg-vector" />
                    Deep search
                  </button>
                  <span className="flex-1" />
                  <span className="font-mono text-[11px] text-text-muted hidden sm:inline">
                    SPEECH · VISUAL · SEMANTIC
                  </span>
                  <button
                    type="button"
                    aria-label="Search"
                    className="relative w-[46px] h-[46px] shrink-0 rounded-full p-[1.4px] box-border overflow-hidden cursor-pointer transition-transform duration-150 ease-out active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-pulse focus-visible:outline-offset-2"
                  >
                    <span
                      className="absolute inset-0 rounded-full animate-spin-slow"
                      style={{
                        backgroundImage:
                          "conic-gradient(from 0deg, #F5A93E, #3FD1C0, #9B8CF2, #F5A93E)",
                      }}
                    />
                    <span className="relative flex w-full h-full rounded-full bg-[#141414] items-center justify-center text-[#FAFAFA]">
                      <ArrowUp size={17} strokeWidth={2} />
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="relative h-0.5 my-5 mx-0.5 bg-white/6 overflow-hidden rounded-sm">
              <div
                className="absolute inset-0 w-[28%] animate-sweep"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, transparent, #3FD1C0, transparent)",
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 px-4 pb-[18px]">
           <AnimatePresence>
            {showResults && (
            <motion.div
              key="result-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.22, ease: strongEaseOut }}
              className="flex gap-3.5 p-3 border border-white/16 rounded-xl bg-surface-2"
            >
              <div
                className="w-[104px] h-16 rounded-lg shrink-0 relative overflow-hidden"
                style={{
                  backgroundImage:
                    "linear-gradient(180deg, #2A3138 0%, #3A4149 42%, #20262B 43%, #171C20 100%)",
                }}
              >
                <span
                  className="absolute left-0 right-0 top-[34%] h-[22%] blur-[3px]"
                  style={{
                    backgroundImage:
                      "linear-gradient(180deg, rgba(244,244,242,.42), rgba(244,244,242,0))",
                  }}
                />
                <span className="absolute left-[14%] top-[26%] w-2 h-2 rounded-full bg-ember/55" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-[7px]">
                  <span className="font-mono text-[12.5px] text-text-secondary">
                    DJI_0416.mp4
                  </span>
                  <span className="font-mono text-[11.5px] text-ember bg-ember/14 rounded-full px-2.5 py-[3px]">
                    04:12 → 04:31
                  </span>
                  <ModalityBadge kind="visual" />
                </div>
                <div className="text-[15px] text-text-primary leading-[1.4] mb-[5px]">
                  Fog bank clearing over open water, slow push-in.
                </div>
                <div className="font-mono text-[11.5px] text-text-muted">
                  Matched on visual scene — confidence 0.94
                </div>
              </div>
            </motion.div>
            )}
            {showResults && (
            <motion.div
              key="result-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.22, ease: strongEaseOut, delay: 0.05 }}
              className="flex gap-3.5 p-3 border border-white/8 rounded-xl bg-surface-1"
            >
              <div
                className="w-[104px] h-16 rounded-lg shrink-0 relative overflow-hidden"
                style={{
                  backgroundImage:
                    "linear-gradient(180deg, #2A3138 0%, #39414A 46%, #1E2429 47%, #161B1F 100%)",
                }}
              >
                <span
                  className="absolute left-0 right-0 top-[38%] h-[18%] blur-[3px]"
                  style={{
                    backgroundImage:
                      "linear-gradient(180deg, rgba(244,244,242,.3), rgba(244,244,242,0))",
                  }}
                />
                <span className="absolute right-[18%] top-[30%] w-[22px] h-3 rounded-[3px] bg-pulse/35" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-[7px]">
                  <span className="font-mono text-[12.5px] text-text-secondary">
                    bts_cam_b.mov
                  </span>
                  <span className="font-mono text-[11.5px] text-ember bg-ember/14 rounded-full px-2.5 py-[3px]">
                    11:47 → 11:58
                  </span>
                  <ModalityBadge kind="fusion" />
                </div>
                <div className="text-[15px] text-text-primary leading-[1.4] mb-[5px]">
                  &ldquo;…wait for the fog to lift, then we roll.&rdquo;
                </div>
                <div className="font-mono text-[11.5px] text-text-muted">
                  Matched on speech + visual — confidence 0.81
                </div>
              </div>
            </motion.div>
            )}
           </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
