"use client";

import { useEffect, useState } from "react";
import type { BriskyPose } from "@/components/mascot/BriskyCompanion";

const thoughts: Partial<Record<BriskyPose, string[]>> & { idle: string[] } = {
  idle: [
    "Lost a clip? Tell me what you remember.",
    "I remember every word. Try me.",
    "Scenes, speech, faces. Ask for any of it.",
    "Vague is fine. I like vague.",
  ],
  listening: ["Ooh, go on…", "I'm all ears. Well, antennae.", "Keep going, details help!"],
  searching: [
    "Digging through your archive…",
    "Reading transcripts…",
    "Scanning scenes…",
    "Almost there…",
  ],
};

export function ThoughtBubble({ pose }: { pose: BriskyPose }) {
  const list = thoughts[pose] ?? thoughts.idle;
  const [state, setState] = useState({ pose, i: 0 });

  // Restart the cycle whenever the pose changes.
  const i = state.pose === pose ? state.i : 0;

  useEffect(() => {
    const t = setTimeout(() => setState({ pose, i: (i + 1) % list.length }), 6000);
    return () => clearTimeout(t);
  }, [pose, i, list.length]);

  return (
    <div className="pointer-events-none absolute left-[calc(50%+46px)] top-3 z-10 hidden sm:block" aria-live="polite">
      <div
        key={`${pose}-${i}`}
        className="relative w-[190px] animate-[thought-in_0.4s_ease-out_both] rounded-2xl border border-brand-violet/20 bg-brand-surface px-3.5 py-2.5 text-xs leading-snug text-brand-ink shadow-[0_6px_20px_rgba(115,99,222,0.12)]"
      >
        {list[i]}
        <span className="absolute -bottom-3 -left-3 size-3 rounded-full border border-brand-violet/20 bg-brand-surface" />
        <span className="absolute -bottom-5 -left-6 size-1.5 rounded-full border border-brand-violet/20 bg-brand-surface" />
      </div>
    </div>
  );
}

