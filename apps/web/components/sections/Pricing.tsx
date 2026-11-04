import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { cn } from "@/lib/cn";

interface Feature {
  text: string;
  included: boolean;
}

interface Plan {
  name: string;
  price: string;
  period?: string;
  desc: string;
  cta: string;
  featured?: boolean;
  features: Feature[];
}

const plans: Plan[] = [
  {
    name: "Individual",
    price: "$19",
    period: "/ MONTH",
    desc: "One connector, one archive, the full intelligence layer.",
    cta: "Start indexing",
    features: [
      { text: "1 storage connector", included: true },
      { text: "Up to 500 hours indexed", included: true },
      { text: "Moment search + player", included: true },
      { text: "Lineage graph", included: false },
    ],
  },
  {
    name: "Studio",
    price: "$59",
    period: "/ MONTH",
    desc: "Multiple connectors, shared library, lineage across originals and exports.",
    cta: "Connect your media",
    featured: true,
    features: [
      { text: "5 connectors, 3 seats", included: true },
      { text: "Up to 5,000 hours indexed", included: true },
      { text: "Lineage graph + job observability", included: true },
      { text: "Benchmark suite", included: true },
    ],
  },
  {
    name: "Organization",
    price: "Custom",
    desc: "Team access, retention controls and archive-scale indexing.",
    cta: "Talk to us",
    features: [
      { text: "Unlimited connectors and seats", included: true },
      { text: "Retention & residency controls", included: true },
      { text: "Benchmark reporting, SSO", included: true },
      { text: "Dedicated onboarding", included: true },
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-white/8 bg-surface-0/58">
      <Reveal className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] py-[clamp(56px,7vw,104px)]">
        <div className="flex flex-wrap items-end justify-between gap-8 mb-[52px]">
          <div className="min-w-0 max-w-[34ch]">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/6 border border-white/10 px-[13px] py-[5px] font-mono text-[11px] tracking-[0.14em] text-text-secondary mb-[22px]">
              <span className="w-1.5 h-1.5 rounded-full bg-ember" />
              PRICING
            </span>
            <h2 className="m-0 font-display font-bold text-[clamp(28px,3.6vw,44px)] leading-[1.05] tracking-[-0.02em] text-balance">
              Priced on understanding, not storage.
            </h2>
          </div>
          <p className="m-0 min-w-0 max-w-[38ch] text-base leading-[1.6] text-text-secondary">
            Bring your own storage — we&rsquo;d rather you kept it. You pay for continuous
            intelligence over the archive you already have.
          </p>
        </div>

        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr))] gap-5">
          {plans.map((plan) => (
            <SpotlightCard
              key={plan.name}
              glow={plan.featured ? "rgba(245,169,62,.7)" : "rgba(244,244,242,.5)"}
            >
              <div
                className={cn(
                  "relative h-full box-border rounded-[15px] py-[30px] px-[26px] flex flex-col",
                  plan.featured
                    ? "border border-ember/40 bg-surface-2"
                    : "border border-white/8 bg-surface-1",
                )}
              >
                {plan.featured && (
                  <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 rounded-full bg-ember px-[13px] py-1 font-mono text-[11px] tracking-[0.06em] text-surface-0 whitespace-nowrap">
                    MOST CHOSEN
                  </div>
                )}

                <div
                  className={cn(
                    "font-mono text-[11px] tracking-[0.2em] uppercase",
                    plan.featured ? "text-ember" : "text-text-secondary",
                  )}
                >
                  {plan.name}
                </div>
                <div className="mt-3 border-t border-white/8" />

                <div className="flex items-baseline gap-2.5 mt-8">
                  <span
                    className={cn(
                      "font-mono text-[42px] leading-none",
                      plan.featured ? "text-ember" : "text-text-primary",
                    )}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="font-mono text-xs text-text-muted">{plan.period}</span>
                  )}
                </div>
                <p className="mt-3.5 text-sm leading-[1.6] text-text-secondary">{plan.desc}</p>

                <div className="mt-[26px]">
                  <Button
                    href="#pricing"
                    variant={plan.featured ? "primary" : "neutral"}
                    className="h-[38px] px-5 rounded-full text-sm"
                  >
                    {plan.cta}
                  </Button>
                </div>

                <div className="mt-[26px] flex flex-col">
                  {plan.features.map((feature, i) => (
                    <div
                      key={feature.text}
                      className={cn(
                        "flex items-center gap-3 py-3.5 text-sm",
                        i > 0 && "border-t border-white/8",
                        feature.included ? "text-text-feature" : "text-text-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "flex w-5 h-5 shrink-0 items-center justify-center rounded-full border",
                          feature.included
                            ? plan.featured
                              ? "border-ember/45 bg-ember/14 text-ember"
                              : "border-white/20 bg-white/6 text-text-primary"
                            : "border-white/10 text-text-muted",
                        )}
                      >
                        {feature.included ? (
                          <Check size={12} strokeWidth={2.5} />
                        ) : (
                          <X size={12} strokeWidth={2.5} />
                        )}
                      </span>
                      {feature.text}
                    </div>
                  ))}
                </div>
              </div>
            </SpotlightCard>
          ))}
        </div>

        <div className="mt-[18px] font-mono text-[11.5px] text-text-muted">
          Indicative pricing — confirm before launch. Storage is never billed by us.
        </div>
      </Reveal>
    </section>
  );
}
