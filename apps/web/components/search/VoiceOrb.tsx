"use client";

import { motion } from "framer-motion";

interface VoiceOrbProps {
  size?: "md" | "lg";
  active?: boolean;
}

export function VoiceOrb({ size = "md", active = true }: VoiceOrbProps) {
  const isLg = size === "lg";

  // Refined, subtle, and proportional orb dimensions:
  // md (modal): ~56px - 64px sphere inside 96px stage
  // lg (immersive overlay): ~80px - 88px sphere inside 136px stage
  const sphereSize = isLg ? "size-20 sm:size-22" : "size-14 sm:size-16";
  const stageSize = isLg ? "size-32 sm:size-36" : "size-24 sm:size-26";
  const waveSize = isLg ? 84 : 58;

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center ${stageSize}`}
      aria-label={active ? "Brisky Voice listening" : "Brisky Voice paused"}
    >
      {/* =====================================================================
          ACOUSTIC SOUNDWAVE RIPPLES (Concentric expanding waves when active)
          ===================================================================== */}
      {active && (
        <>
          {/* Wave 1 */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0.6 }}
            animate={{
              scale: [0.95, 1.45, 1.8],
              opacity: [0.55, 0.2, 0],
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: "easeOut",
            }}
            className="pointer-events-none absolute inset-0 m-auto rounded-full border border-brand-violet/35 bg-brand-violet/5"
            style={{ width: waveSize, height: waveSize }}
          />

          {/* Wave 2 */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0.6 }}
            animate={{
              scale: [0.95, 1.45, 1.8],
              opacity: [0.55, 0.2, 0],
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              delay: 0.9,
              ease: "easeOut",
            }}
            className="pointer-events-none absolute inset-0 m-auto rounded-full border border-brand-violet/25 bg-gradient-to-r from-brand-violet/5 to-rose-400/5"
            style={{ width: waveSize, height: waveSize }}
          />

          {/* Wave 3 */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0.6 }}
            animate={{
              scale: [0.95, 1.45, 1.8],
              opacity: [0.55, 0.2, 0],
            }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              delay: 1.8,
              ease: "easeOut",
            }}
            className="pointer-events-none absolute inset-0 m-auto rounded-full border border-amber-400/25"
            style={{ width: waveSize, height: waveSize }}
          />
        </>
      )}

      {/* =====================================================================
          AMBIENT ATMOSPHERIC GLOW
          ===================================================================== */}
      <motion.div
        animate={
          active
            ? {
                scale: [1, 1.15, 0.98, 1.1, 1],
                opacity: [0.35, 0.6, 0.4, 0.55, 0.35],
              }
            : { scale: 0.95, opacity: 0.15 }
        }
        transition={{
          duration: 3.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="pointer-events-none absolute inset-1 rounded-full bg-gradient-to-tr from-[#7363de]/40 via-[#f59e0b]/25 to-[#ec4899]/20 blur-xl"
      />

      {/* =====================================================================
          LUMINOUS FLUID ORB SPHERE
          Seamless iridescent sphere with silky multi-tone rotation,
          no harsh seams, and smooth organic breathing.
          ===================================================================== */}
      <motion.div
        animate={
          active
            ? {
                scale: [1, 1.05, 0.97, 1.03, 1],
                rotate: [0, 90, 180, 270, 360],
              }
            : { scale: 0.94, rotate: 0 }
        }
        transition={{
          scale: { duration: 3.6, repeat: Infinity, ease: "easeInOut" },
          rotate: { duration: 24, repeat: Infinity, ease: "linear" },
        }}
        className={`relative ${sphereSize} shrink-0 overflow-hidden rounded-full shadow-[0_10px_28px_rgba(115,99,222,0.3),0_0_16px_rgba(255,255,255,0.45)] ring-1 ring-white/60 backdrop-blur-xl`}
        style={{
          // Seamless multi-layer radial gradient base (no harsh seams or cuts)
          background:
            "radial-gradient(circle at 35% 35%, #9b8bf4 0%, #7363de 45%, #5846c9 75%, #4736b0 100%)",
        }}
      >
        {/* Layer 1: Smooth rotating chromatic aura (warm coral & electric violet) */}
        <motion.div
          animate={
            active
              ? {
                  rotate: [360, 0],
                  scale: [1, 1.12, 0.96, 1],
                }
              : { rotate: 0 }
          }
          transition={{
            rotate: { duration: 18, repeat: Infinity, ease: "linear" },
            scale: { duration: 5, repeat: Infinity, ease: "easeInOut" },
          }}
          className="absolute -inset-1 opacity-80 mix-blend-screen"
          style={{
            background:
              "radial-gradient(circle at 65% 70%, #ff8a65 0%, #ec4899 40%, transparent 70%)",
          }}
        />

        {/* Layer 2: Soft celestial blue highlight wave */}
        <motion.div
          animate={
            active
              ? {
                  rotate: [0, 360],
                }
              : { rotate: 0 }
          }
          transition={{
            rotate: { duration: 22, repeat: Infinity, ease: "linear" },
          }}
          className="absolute -inset-1 opacity-70 mix-blend-screen"
          style={{
            background:
              "radial-gradient(circle at 30% 25%, #38bdf8 0%, #818cf8 40%, transparent 65%)",
          }}
        />

        {/* Layer 3: Soft fluid light center */}
        <motion.div
          animate={
            active
              ? {
                  scale: [0.85, 1.18, 0.9, 1.12, 0.85],
                  opacity: [0.7, 0.95, 0.75, 0.9, 0.7],
                }
              : { scale: 0.8, opacity: 0.45 }
          }
          transition={{
            duration: 2.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-2.5 rounded-full bg-brand-surface/70 shadow-[0_0_16px_rgba(255,255,255,0.95)] blur-xs"
        />

        {/* Layer 4: Specular glass rim sheen (Apple-like 3D orb depth) */}
        <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/60 via-transparent to-black/10 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),inset_0_-2px_4px_rgba(0,0,0,0.15)]" />

        {/* Top-left specular gloss highlight pill */}
        <div className="pointer-events-none absolute left-2 top-1.5 h-2 w-4 -rotate-25 rounded-full bg-gradient-to-b from-white/95 to-white/20 blur-[0.4px]" />
      </motion.div>
    </div>
  );
}
