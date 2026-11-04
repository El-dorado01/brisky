"use client";

import { motion } from "framer-motion";

interface WavySatinBackgroundProps {
  active?: boolean;
}

/**
 * WavySatinBackground
 * Subtle, airy, elegant liquid satin wave folds in Brisky's brand palette.
 * Light canvas tones (#f6f7fb) with whisper-soft brand violet (#7363de),
 * luminous ivory wave crests, and gentle lavender shadow folds.
 */
export function WavySatinBackground({ active = true }: WavySatinBackgroundProps) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden select-none"
      style={{
        // Light, airy base canvas matching Brisky's --color-brand-canvas with soft violet tint
        background:
          "linear-gradient(135deg, #f7f8fd 0%, #eff1fa 30%, #f4f5fc 60%, #eceef9 85%, #f8f9fe 100%)",
      }}
    >
      {/* SVG Canvas for visible yet subtle organic wave ribbons */}
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        fill="none"
      >
        <defs>
          {/* Subtle Wave 1: Soft Brand Violet Ribbon */}
          <linearGradient id="subtleVioletWave" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7363de" stopOpacity="0.14" />
            <stop offset="45%" stopColor="#8b7cf6" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#7363de" stopOpacity="0.05" />
          </linearGradient>

          {/* Subtle Wave 2: Lavender Shadow Fold (Creates gentle depth) */}
          <linearGradient id="subtleLavenderShadow" x1="0%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#6352cf" stopOpacity="0.12" />
            <stop offset="50%" stopColor="#503fb8" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#7e70db" stopOpacity="0.04" />
          </linearGradient>

          {/* Subtle Wave 3: Luminous Ivory / White Wave Crest (Catches the light) */}
          <linearGradient id="subtleIvoryCrest" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="75%" stopColor="#edeafd" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
          </linearGradient>

          {/* Subtle Wave 4: Delicate Soft Periwinkle Wave */}
          <linearGradient id="subtlePeriwinkleWave" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#9a8bf2" stopOpacity="0.13" />
            <stop offset="50%" stopColor="#7363de" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#b4a7fa" stopOpacity="0.05" />
          </linearGradient>

          {/* Subtle Wave 5: Whisper of Warmth (Soft rose/amber kiss) */}
          <linearGradient id="subtleWarmKiss" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7363de" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#f5a93e" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* -------------------------------------------------------------
            WAVE 1 (Left Fold): Gentle lavender shadow on the left
            ------------------------------------------------------------- */}
        <motion.path
          d="M 120 -80 C 260 220, 40 540, 240 980 L -80 980 L -80 -80 Z"
          fill="url(#subtleLavenderShadow)"
          animate={
            active
              ? {
                  d: [
                    "M 120 -80 C 260 220, 40 540, 240 980 L -80 980 L -80 -80 Z",
                    "M 160 -80 C 210 260, 90 510, 200 980 L -80 980 L -80 -80 Z",
                    "M 120 -80 C 260 220, 40 540, 240 980 L -80 980 L -80 -80 Z",
                  ],
                }
              : {}
          }
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: "blur(42px)" }}
        />

        {/* -------------------------------------------------------------
            WAVE 2 (Left Wave Ribbon): Subtle Brand Violet Satin Ribbon
            ------------------------------------------------------------- */}
        <motion.path
          d="M 280 -80 C 420 200, 220 520, 440 980 L 160 980 C -20 520, 180 200, 60 -80 Z"
          fill="url(#subtleVioletWave)"
          animate={
            active
              ? {
                  d: [
                    "M 280 -80 C 420 200, 220 520, 440 980 L 160 980 C -20 520, 180 200, 60 -80 Z",
                    "M 330 -80 C 370 240, 270 480, 400 980 L 120 980 C 20 480, 220 240, 100 -80 Z",
                    "M 280 -80 C 420 200, 220 520, 440 980 L 160 980 C -20 520, 180 200, 60 -80 Z",
                  ],
                }
              : {}
          }
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: "blur(46px)" }}
        />

        {/* -------------------------------------------------------------
            WAVE 3 (Center Valley): Delicate Lavender Wave Valley
            ------------------------------------------------------------- */}
        <motion.path
          d="M 580 -80 C 720 260, 480 580, 680 980 L 400 980 C 250 580, 460 260, 320 -80 Z"
          fill="url(#subtleLavenderShadow)"
          animate={
            active
              ? {
                  d: [
                    "M 580 -80 C 720 260, 480 580, 680 980 L 400 980 C 250 580, 460 260, 320 -80 Z",
                    "M 540 -80 C 760 220, 440 620, 720 980 L 360 980 C 290 620, 420 220, 360 -80 Z",
                    "M 580 -80 C 720 260, 480 580, 680 980 L 400 980 C 250 580, 460 260, 320 -80 Z",
                  ],
                }
              : {}
          }
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: "blur(50px)" }}
        />

        {/* -------------------------------------------------------------
            WAVE 4 (Center-Right Luminous Crest): Luminous Ivory Wave Crest
            Creates the visible silk reflection without overwhelming color
            ------------------------------------------------------------- */}
        <motion.path
          d="M 880 -80 C 1040 240, 780 560, 1020 980 L 680 980 C 500 560, 740 240, 580 -80 Z"
          fill="url(#subtleIvoryCrest)"
          animate={
            active
              ? {
                  d: [
                    "M 880 -80 C 1040 240, 780 560, 1020 980 L 680 980 C 500 560, 740 240, 580 -80 Z",
                    "M 830 -80 C 1080 280, 740 520, 970 980 L 640 980 C 540 520, 690 280, 620 -80 Z",
                    "M 880 -80 C 1040 240, 780 560, 1020 980 L 680 980 C 500 560, 740 240, 580 -80 Z",
                  ],
                }
              : {}
          }
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: "blur(40px)" }}
        />

        {/* -------------------------------------------------------------
            WAVE 5 (Right Fold): Delicate Periwinkle Silk Ribbon
            ------------------------------------------------------------- */}
        <motion.path
          d="M 1220 -80 C 1380 280, 1100 620, 1340 980 L 980 980 C 820 620, 1060 280, 900 -80 Z"
          fill="url(#subtlePeriwinkleWave)"
          animate={
            active
              ? {
                  d: [
                    "M 1220 -80 C 1380 280, 1100 620, 1340 980 L 980 980 C 820 620, 1060 280, 900 -80 Z",
                    "M 1170 -80 C 1420 240, 1060 660, 1290 980 L 940 980 C 860 660, 1010 240, 940 -80 Z",
                    "M 1220 -80 C 1380 280, 1100 620, 1340 980 L 980 980 C 820 620, 1060 280, 900 -80 Z",
                  ],
                }
              : {}
          }
          transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: "blur(48px)" }}
        />

        {/* Ambient warmth wave (soft kiss of sunset warmth) */}
        <motion.path
          d="M 450 -50 C 750 350, 450 650, 850 950 L 650 950 C 300 650, 550 350, 300 -50 Z"
          fill="url(#subtleWarmKiss)"
          animate={
            active
              ? {
                  x: [-20, 20, -20],
                  y: [-10, 10, -10],
                }
              : {}
          }
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: "blur(55px)" }}
        />
      </svg>

      {/* Subtle satin sheen light layer */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-soft-light opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 65% at 50% 35%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.4) 50%, rgba(115,99,222,0.06) 100%)",
        }}
      />

      {/* Gentle frosted glass blur overlay */}
      <div className="pointer-events-none absolute inset-0 backdrop-blur-[20px]" />
    </div>
  );
}
