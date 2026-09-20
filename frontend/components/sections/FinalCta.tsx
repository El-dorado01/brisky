import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";

export function FinalCta() {
  return (
    <section
      className="border-t border-white/8 bg-surface-0/55"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 800px 400px at 50% 0%, rgba(245,169,62,.09), transparent 65%)",
      }}
    >
      <Reveal className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(72px,9vw,128px)] text-center">
        <h2 className="mx-auto mb-5 font-display font-bold text-[clamp(32px,4.6vw,56px)] leading-[1.02] tracking-[-0.02em] max-w-[17ch] text-balance">
          Connect once. Find any moment by describing what you remember.
        </h2>
        <p className="mx-auto mb-[34px] text-[17px] leading-[1.6] text-text-secondary max-w-[44ch]">
          We keep the intelligence, not the tape.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button href="#pricing" className="text-[15px] px-6 py-3.5 rounded-[9px]">
            Connect your media
          </Button>
          <Button href="#how" variant="secondary" className="text-[15px] px-6 py-3.5 rounded-[9px]">
            See the pipeline
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
