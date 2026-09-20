import { cn } from "@/lib/cn";

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-mono text-xs tracking-[0.16em] text-ember mb-[18px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
