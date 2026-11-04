import { cn } from "@/lib/cn";

export function PulseDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "w-[5px] h-[5px] rounded-full bg-success animate-pulse-soft",
        className,
      )}
    />
  );
}
