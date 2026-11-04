import { cn } from "@/lib/cn";

const styles = {
  speech: "text-ember bg-ember/14",
  visual: "text-pulse bg-pulse/14",
  semantic: "text-vector bg-vector/14",
  fusion:
    "text-text-primary bg-linear-to-r from-ember/14 to-pulse/14 border border-white/16",
} as const;

export type ModalityKind = keyof typeof styles;

const labels: Record<ModalityKind, string> = {
  speech: "● SPEECH",
  visual: "● VISUAL",
  semantic: "● SEMANTIC",
  fusion: "◆ FUSION",
};

export function ModalityBadge({
  kind,
  className,
}: {
  kind: ModalityKind;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11.5px] rounded-full px-2.5 py-[3px] whitespace-nowrap",
        styles[kind],
        className,
      )}
    >
      {labels[kind]}
    </span>
  );
}
