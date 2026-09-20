"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cycles through `queries`, typing then deleting each one, pausing once the
 * visitor starts typing themselves. Mirrors the original design's
 * setInterval-driven typewriter exactly (55ms tick, 3-char delete stride,
 * 22-tick hold at the end of each query).
 */
export function useTypewriter(queries: string[], speedMs = 55, holdTicks = 22) {
  const [typed, setTyped] = useState("");
  const [userTyped, setUserTyped] = useState(false);
  const userTypedRef = useRef(false);

  useEffect(() => {
    userTypedRef.current = userTyped;
  }, [userTyped]);

  useEffect(() => {
    if (queries.length === 0) return;
    let qi = 0;
    let ci = 0;
    let deleting = false;
    let hold = 0;

    const id = setInterval(() => {
      if (userTypedRef.current) return;
      const q = queries[qi];
      if (!deleting) {
        ci++;
        if (ci >= q.length) {
          deleting = true;
          hold = holdTicks;
        }
      } else if (hold > 0) {
        hold--;
        return;
      } else {
        ci -= 3;
        if (ci <= 0) {
          ci = 0;
          deleting = false;
          qi = (qi + 1) % queries.length;
        }
      }
      setTyped(q.slice(0, Math.max(0, ci)));
    }, speedMs);

    return () => clearInterval(id);
  }, [queries, speedMs, holdTicks]);

  return {
    value: typed,
    onChange: (next: string) => {
      setUserTyped(true);
      setTyped(next);
    },
  };
}
