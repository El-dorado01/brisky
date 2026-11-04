"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X } from "lucide-react";
import { VoiceOrb } from "@/components/search/VoiceOrb";
import { WavySatinBackground } from "@/components/search/WavySatinBackground";

interface ImmersiveVoiceOverlayProps {
  open: boolean;
  onClose: () => void;
  status: string;
  error: string;
  active: boolean;
  muted: boolean;
  onMicToggle: () => void;
}

export function ImmersiveVoiceOverlay({open,onClose,status,error,active,muted,onMicToggle}: ImmersiveVoiceOverlayProps) {
  useEffect(()=>{if(!open)return;const before=document.body.style.overflow;document.body.style.overflow='hidden';function key(e:KeyboardEvent){if(e.key==='Escape')onClose();}window.addEventListener('keydown',key);return()=>{document.body.style.overflow=before;window.removeEventListener('keydown',key);};},[open,onClose]);
  if(!open)return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="absolute inset-0 z-[80] flex flex-col items-center justify-between overflow-hidden p-6 sm:p-10"
      >
        {/* =====================================================================
            WAVY SATIN / SILK LIQUID BACKGROUND
            Matches the subtle, airy brand satin ripples.
            ===================================================================== */}
        <WavySatinBackground active={active} />

        {/* Top minimal status bar */}
        <div className="relative z-10 flex w-full max-w-xl items-center justify-between pl-10 md:pl-0 text-xs text-brand-ink/80">
          <span className="rounded-full border border-white/60 bg-brand-surface/70 px-3.5 py-1 font-medium text-brand-ink/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] backdrop-blur-md">
            Voice Mode
          </span>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/50 bg-brand-surface/60 p-2 text-brand-ink/70 transition hover:bg-brand-surface hover:text-brand-ink"
            aria-label="Exit voice mode"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Center Stage: Status Title + Luminous Voice Orb */}
        <div className="relative z-10 flex max-w-lg flex-col items-center px-4 text-center">
          {/* Main Status Text */}
          <motion.h2
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-medium tracking-tight text-brand-ink sm:text-[34px]"
          >
            {status}
          </motion.h2>

          {error&&<p role="alert" className="mt-4 max-w-sm text-sm leading-6 text-brand-ink">{error} Tap the microphone to retry.</p>}
          {/* Luminous Voice Orb */}
          <div className="my-4 flex items-center justify-center sm:my-6">
            <VoiceOrb size="lg" active={active} />
          </div>
        </div>

        {/* Bottom Center Capsule Pill Controls (CarPlay / Siri layout) */}
        <div className="relative z-10 flex items-center justify-center gap-3.5 pb-2">
          {/* Left Pill: Microphone Toggle */}
          <button
            type="button"
            onClick={onMicToggle}
            aria-label={error ? "Retry voice conversation" : muted ? "Resume microphone" : "Pause microphone"}
            className={`flex h-12 w-20 items-center justify-center rounded-full border border-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-md transition-all hover:scale-105 active:scale-95 ${
              active
                ? "bg-brand-surface/80 text-brand-ink hover:bg-brand-surface"
                : "bg-brand-ink text-white hover:bg-brand-ink/90"
            }`}
          >
            {active ? (
              <Mic className="size-5" strokeWidth={2} />
            ) : (
              <MicOff className="size-5" strokeWidth={2} />
            )}
          </button>

          {/* Right Pill: Close / Exit Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Exit voice mode"
            className="flex h-12 w-20 items-center justify-center rounded-full border border-white/60 bg-brand-surface/80 text-brand-ink shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-md transition-all hover:scale-105 hover:bg-brand-surface active:scale-95"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
