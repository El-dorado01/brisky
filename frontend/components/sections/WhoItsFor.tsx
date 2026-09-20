import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";

const audiences = [
  {
    title: "Creators",
    desc: "YouTubers, podcasters, documentary and travel filmmakers with years of raw footage behind every upload.",
    quotes: ["“the b-roll from the Kyoto trip”", "“where I explained the pricing change”"],
  },
  {
    title: "Professional creatives",
    desc: "Videographers, wedding filmmakers and freelance editors juggling client archives across drives.",
    quotes: ["“the first-look shot, Hartley wedding”", "“every drone pass we shot in 2024”"],
  },
  {
    title: "Small organizations",
    desc: "Agencies, marketing teams, churches, schools, sports clubs, NGOs and small broadcasters with shared libraries.",
    quotes: ["“the CEO quote about supply chain”", "“last season’s winning goal”"],
  },
];

export function WhoItsFor() {
  return (
    <section id="who" className="border-t border-white/8 bg-surface-0/58">
      <Reveal className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(56px,7vw,104px)]">
        <Eyebrow>05 — WHO IT&rsquo;S FOR</Eyebrow>
        <h2 className="m-0 mb-3.5 font-display font-bold text-[clamp(28px,3.6vw,44px)] leading-[1.05] tracking-[-0.018em] max-w-[24ch] text-balance">
          People who remember their content but lose track of where it lives.
        </h2>
        <p className="m-0 mb-11 text-[17px] leading-[1.6] text-text-secondary max-w-[54ch]">
          Already working with media professionally. Already past the point where folders scale.
        </p>

        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
          {audiences.map((a) => (
            <div key={a.title} className="border border-white/8 rounded-2xl bg-surface-1 py-7 px-[26px]">
              <div className="font-display font-bold text-xl mb-3">{a.title}</div>
              <p className="m-0 mb-[18px] text-[14.5px] leading-[1.6] text-text-secondary">
                {a.desc}
              </p>
              <div className="border-t border-white/8 pt-3.5 font-mono text-xs leading-[1.8] text-text-muted">
                {a.quotes.map((q) => (
                  <div key={q}>{q}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
