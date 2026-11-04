import { useEffect, useState } from "react";

/**
 * Returns true for a short moment every `every` ms, so icons can replay their
 * animation on a loop. `offset` staggers neighbouring icons.
 */
export function usePulse(offset = 0, every = 5000, duration = 1400) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let off: ReturnType<typeof setTimeout>;
    const fire = () => {
      setOn(true);
      off = setTimeout(() => setOn(false), duration);
    };
    const start = setTimeout(fire, offset);
    const loop = setInterval(fire, every);
    return () => {
      clearTimeout(start);
      clearInterval(loop);
      clearTimeout(off);
    };
  }, [offset, every, duration]);

  return on;
}

