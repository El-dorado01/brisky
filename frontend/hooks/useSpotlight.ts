"use client";

import type { PointerEvent, RefObject } from "react";

/**
 * Tracks the pointer position over an element into --sx/--sy CSS custom
 * properties, written onto `target` (falling back to the event's own
 * element) rather than the moved-over element itself — custom properties
 * cascade to every descendant, so writing them on a wide subtree forces a
 * style recalc across content that never reads them. Scope the write to
 * the one element that actually consumes the value.
 */
export function useSpotlight(target?: RefObject<HTMLElement | null>) {
  return (e: PointerEvent<HTMLElement>) => {
    const bounds = e.currentTarget;
    const rect = bounds.getBoundingClientRect();
    const el = target?.current ?? bounds;
    el.style.setProperty("--sx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--sy", `${e.clientY - rect.top}px`);
  };
}
