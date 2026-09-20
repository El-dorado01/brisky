"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { useSpotlight } from "@/hooks/useSpotlight";
import { cn } from "@/lib/cn";

/**
 * A card whose border glows along a soft radial gradient that follows the
 * pointer, via a masked absolutely-positioned ring (mask-composite: exclude
 * carves out everything but a 1px band at the edge).
 */
export function SpotlightCard({
  children,
  glow,
  className,
}: {
  children: ReactNode;
  glow: string;
  className?: string;
}) {
  const glowRef = useRef<HTMLDivElement>(null);
  const onPointerMove = useSpotlight(glowRef);

  const glowStyle: CSSProperties = {
    backgroundImage: `radial-gradient(circle 460px at var(--sx,-9999px) var(--sy,-9999px), ${glow}, transparent 60%)`,
    WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    WebkitMaskComposite: "xor",
    mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    maskComposite: "exclude",
  };

  return (
    <div
      onPointerMove={onPointerMove}
      className={cn("relative rounded-2xl p-px h-full", className)}
    >
      <div ref={glowRef} className="absolute inset-0 rounded-2xl pointer-events-none" style={glowStyle} />
      <div className="relative h-full">{children}</div>
    </div>
  );
}
