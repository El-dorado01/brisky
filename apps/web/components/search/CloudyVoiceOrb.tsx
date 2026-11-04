"use client";

import { motion } from "framer-motion";

interface CloudyVoiceOrbProps {
  size?: "md" | "lg";
  active?: boolean;
}

export function CloudyVoiceOrb({
  size = "md",
  active = true,
}: CloudyVoiceOrbProps) {
  const isLg = size === "lg";
  const containerSize = isLg ? "size-36 sm:size-44" : "size-28 sm:size-32";
  const orbSize = isLg ? "size-28 sm:size-36" : "size-24 sm:size-26";

  return (
    <div className={`relative flex shrink-0 items-center justify-center ${containerSize}`}>
      {/* Outer soft ambient aura */}
      <motion.div
        animate={
          active
            ? {
                scale: [1, 1.25, 1],
                opacity: [0.35, 0.7, 0.35],
              }
            : { scale: 1, opacity: 0.2 }
        }
        transition={{
          duration: 3.6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#7363de]/40 via-[#9b8cf2]/30 to-[#f5a93e]/25 blur-3xl"
      />

      {/* Glass Orb Sphere */}
      <motion.div
        animate={
          active
            ? {
                scale: [1, 1.05, 0.97, 1.02, 1],
              }
            : { scale: 1 }
        }
        transition={{
          duration: 4.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className={`relative ${orbSize} overflow-hidden rounded-full border border-white/60 bg-[#1e1b4b] shadow-[0_14px_45px_rgba(115,99,222,0.45),inset_0_0_28px_rgba(255,255,255,0.4)] backdrop-blur-xl`}
      >
        {/* Cloudy Wave 1: Deep Violet / Luminous Lilac Cloud */}
        <motion.div
          animate={{
            x: [-16, 14, -8, -16],
            y: [-12, 10, -14, -12],
            scale: [1, 1.25, 0.92, 1],
          }}
          transition={{
            duration: 7.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -inset-6 rounded-full bg-gradient-to-tr from-[#7363de] via-[#818cf8] to-[#c084fc] opacity-85 blur-lg"
        />

        {/* Cloudy Wave 2: Warm Ethereal Amber / Sunset Cloud */}
        <motion.div
          animate={{
            x: [14, -12, 8, 14],
            y: [10, -14, 12, 10],
            scale: [1.1, 0.88, 1.18, 1.1],
          }}
          transition={{
            duration: 6.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -inset-5 rounded-full bg-gradient-to-bl from-[#f5a93e] via-[#e27c59] to-[#7363de] opacity-75 blur-lg mix-blend-screen"
        />

        {/* Cloudy Wave 3: Soft Cyan / Luminous Pulse */}
        <motion.div
          animate={{
            x: [-8, 12, -12, -8],
            y: [10, -8, 6, 10],
            scale: [0.95, 1.15, 0.9, 0.95],
          }}
          transition={{
            duration: 8.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -inset-4 rounded-full bg-gradient-to-r from-[#3fd1c0] via-[#a78bfa] to-[#f472b6] opacity-65 blur-lg mix-blend-screen"
        />

        {/* Luminous Inner Core: Ethereal White Light Cloud */}
        <motion.div
          animate={{
            scale: [0.82, 1.16, 0.88, 0.82],
            opacity: [0.65, 0.95, 0.7, 0.65],
          }}
          transition={{
            duration: 3.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-5 rounded-full bg-brand-surface/90 shadow-[0_0_30px_#ffffff] blur-md"
        />

        {/* Top-edge delicate glass reflection / specular light catch */}
        <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/45 via-transparent to-black/15 ring-1 ring-inset ring-white/30" />
      </motion.div>
    </div>
  );
}

