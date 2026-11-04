"use client";

import { useEffect, useState } from "react";

const prompts = [
  "the interview where she mentions the budget…",
  "drone shot over the coastline at sunset…",
  "someone laughing at the product demo…",
  "the part where we talk about pricing…",
];

// Decorative placeholder: cycles through example prompts, fading each word in.
export function AnimatedPlaceholder() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setI((n) => (n + 1) % prompts.length), 4500);
    return () => clearTimeout(t);
  }, [i]);

  return (
    <span aria-hidden className="pointer-events-none absolute left-2 top-1 text-base text-brand-muted/70">
      <span key={i}>
        {prompts[i].split(" ").map((word, w) => (
          <span
            key={w}
            className="mr-[0.25em] inline-block animate-[word-in_0.5s_ease-out_both]"
            style={{ animationDelay: `${w * 90}ms` }}
          >
            {word}
          </span>
        ))}
      </span>
    </span>
  );
}

