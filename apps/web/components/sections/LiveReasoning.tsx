import { ArrowUp } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] bg-surface-2 text-[#EFEFEF] rounded-2xl px-[15px] py-3 text-[15px] leading-[1.42]">
        {children}
      </div>
    </div>
  );
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-[11px] items-start">
      <span
        aria-hidden
        className="w-7 h-7 shrink-0 rounded-full"
        style={{
          backgroundImage:
            "linear-gradient(105deg, #F5C40A 0%, #DCAE3F 40%, #6AC6A0 62%, #22C0CF 100%)",
        }}
      />
      <div className="max-w-[78%] bg-surface-2 text-[#EFEFEF] rounded-2xl px-[15px] py-3 text-[15px] leading-[1.42]">
        {children}
      </div>
    </div>
  );
}

export function LiveReasoning() {
  return (
    <section id="ask" className="border-t border-white/8 bg-surface-0/58">
      <Reveal className="max-w-[1300px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(56px,7vw,104px)]">
        <h2 className="m-0 mb-3.5 font-display font-bold text-[clamp(26px,4.1vw,52px)] leading-[1.08] tracking-[-0.02em] text-balance">
          Built for how you remember.
          <br />
          <span className="font-extralight">Answered with timestamps.</span>
        </h2>
        <p className="m-0 mb-10 text-[clamp(15px,1.25vw,18px)] leading-[1.55] text-[#8B8B8D] max-w-[56ch]">
          Ask in plain language. Brisky reasons across speech, visuals and scenes, then answers with
          the exact second it found.
        </p>

        <div
          className="relative rounded-2xl overflow-hidden p-[clamp(18px,2.4vw,34px)]"
          style={{
            backgroundImage:
              "radial-gradient(120% 150% at 9% 52%, #D2AE1A 0%, #BF9F28 22%, rgba(175,155,55,0) 56%), " +
              "radial-gradient(120% 150% at 95% 50%, #64A3A2 0%, #4D9494 34%, rgba(70,140,140,0) 64%), " +
              "radial-gradient(80% 110% at 42% 6%, rgba(150,160,55,.55) 0%, rgba(150,160,60,0) 42%), " +
              "linear-gradient(96deg, #C6A119 0%, #B0972A 32%, #7BA184 62%, #509393 100%)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(135% 120% at 50% 50%, transparent 58%, rgba(0,0,0,.3) 100%)",
            }}
          />

          <div className="relative flex items-center gap-2.5 mb-[18px]">
            <span className="w-[9px] h-[9px] rounded-full bg-[#23D92C] shadow-[0_0_6px_rgba(45,220,55,.65)]" />
            <span className="font-mono text-xs tracking-[0.1em] text-[#0B0C07]">
              LIVE REASONING
            </span>
          </div>

          <div className="relative max-w-[814px] bg-[#0D0D0D] rounded-2xl p-[clamp(16px,1.8vw,24px)] flex flex-col gap-3.5">
            <UserBubble>Where do I say the part about deleting the master files?</UserBubble>
            <AssistantBubble>
              Three matches across two files.
              <div className="h-2.5" />
              <div className="font-mono text-[12.5px] text-ember">
                podcast_ep114_cam2.mp4 · 18:42 → 19:05
              </div>
              <div className="font-mono text-[12.5px] text-ember">
                investor_update_v3.mov · 04:11 → 04:26
              </div>
              <div className="h-2.5" />
              Want the fusion matches too, or speech only?
            </AssistantBubble>
            <UserBubble>
              Speech only. And find every drone pass over water from 2024.
            </UserBubble>
            <AssistantBubble>
              41 clips, 2024 only. Ranked by visual confidence — originals untouched in your Drive.
            </AssistantBubble>

            <div
              className="flex items-center gap-3 bg-[#FDFDFD] rounded-full h-[46px] pl-[18px] pr-2 mt-1.5"
              aria-hidden
            >
              <span className="flex-1 text-[14.5px] text-[#6B6B6D]">
                What should we find today?
              </span>
              <span className="w-8 h-8 rounded-full bg-[#0C0C0E] text-white flex items-center justify-center">
                <ArrowUp size={15} strokeWidth={2} />
              </span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
