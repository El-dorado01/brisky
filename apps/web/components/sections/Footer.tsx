import { PulseDot } from "@/components/ui/PulseDot";
import { Reveal } from "@/components/ui/Reveal";

const columns = [
  {
    heading: "PRODUCT",
    links: [
      { href: "#product", label: "Overview" },
      { href: "#how", label: "How it works" },
      { href: "#pricing", label: "Pricing" },
      { href: "#footer", label: "Changelog" },
    ],
  },
  {
    heading: "PHILOSOPHY",
    links: [
      { href: "#trust", label: "Stewardship" },
      { href: "#trust", label: "Architecture" },
      { href: "#who", label: "Who it's for" },
    ],
  },
  {
    heading: "COMPANY",
    links: [
      { href: "#footer", label: "Privacy" },
      { href: "#footer", label: "Terms" },
      { href: "#footer", label: "Contact" },
      { href: "#footer", label: "Status" },
    ],
  },
];

export function Footer() {
  return (
    <footer id="footer" className="border-t border-white/8 bg-surface-alt/62">
      <Reveal>
        <div className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] pt-14 pb-8 grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-9">
          <div className="min-w-0 max-w-[32ch]">
            <div className="font-display font-bold text-xl mb-3">
              Brisky<span className="text-ember">.</span>
            </div>
            <p className="m-0 text-sm leading-[1.6] text-text-secondary">
              The intelligence layer for media archives. Your footage stays where it is.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.heading} className="flex flex-col gap-2.5">
              <div className="font-mono text-[11px] tracking-[0.12em] text-text-muted mb-0.5">
                {col.heading}
              </div>
              {col.links.map((link, i) => (
                <a
                  key={`${link.label}-${i}`}
                  href={link.href}
                  className="text-sm text-text-secondary no-underline hover:text-text-primary"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>

        <div className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] pt-5 pb-11 flex flex-wrap gap-3 justify-between border-t border-white/8">
          <span className="font-mono text-[11.5px] text-text-muted">© 2026 BRISKY</span>
          <span className="flex items-center gap-2 font-mono text-[11.5px] text-text-muted">
            <PulseDot />
            CONTINUOUSLY UNDERSTANDING
          </span>
        </div>
      </Reveal>
    </footer>
  );
}
