"use client";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FactoryClose as Cancel01Icon } from "@/components/connectors/FactoryIcons";
import { VoiceOrb } from "@/components/search/VoiceOrb";
import { useBottomSheet } from '@/hooks/use-bottom-sheet';

const subscribeMounted=()=>()=>{};
const clientMounted=()=>true;
const serverMounted=()=>false;

interface VoiceModeModalProps {
  open: boolean;
  onClose: () => void;
  onStartVoice: () => void;
}

export function VoiceModeModal({
  open,
  onClose,
  onStartVoice,
}: VoiceModeModalProps) {
  const sheet=useBottomSheet(onClose);
  const mounted=useSyncExternalStore(subscribeMounted,clientMounted,serverMounted);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Lock background scroll when open
  useEffect(() => {
    if(!open)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return ()=>{document.body.style.overflow=previous;};
  }, [open]);

  function handleStart() {
    onStartVoice();
  }

  return mounted ? createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-end justify-center bg-brand-ink/40 p-0 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <motion.div
            {...sheet.panelProps}
            aria-label="Voice mode"
            onClick={(e) => e.stopPropagation()}
            className="thin-scrollbar relative max-h-[calc(100dvh-1rem)] w-full max-w-full overflow-y-auto overscroll-contain rounded-t-[28px] bg-brand-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-0 text-brand-ink shadow-[0_-8px_40px_rgba(34,40,63,0.16)] sm:max-h-[84dvh] sm:max-w-[460px] sm:rounded-3xl sm:p-7"
          >
            {/* Mobile Drag / Pull Handle */}
            <div {...sheet.handleProps}><div className="h-1 w-10 rounded-full bg-brand-muted/30" /></div>

            {/* Top-right corner close button */}
            <AnimateIcon animateOnHover asChild><button
              type="button"
              onClick={onClose}
              aria-label="Close voice mode modal"
              className="absolute right-4 top-3.5 z-10 grid size-8 place-items-center rounded-xl text-brand-muted transition hover:bg-brand-canvas hover:text-brand-ink sm:right-5 sm:top-5"
            >
              <Cancel01Icon size={16} />
            </button></AnimateIcon>

            {/* Top Header */}
            <div className="flex shrink-0 flex-col items-center justify-center pt-1 text-center sm:pt-2">
              <h2 className="text-xl font-semibold tracking-tight text-brand-ink sm:text-2xl">
                Voice Mode
              </h2>
              <p className="mt-1 max-w-xs text-xs text-brand-muted">
                Talk to Brisky like someone sitting right beside you.
              </p>
            </div>

            {/* Center Stage: Ethereal Luminous Voice Orb */}
            <div className="my-2 flex shrink-0 flex-col items-center justify-center text-center sm:my-3">
              <VoiceOrb size="md" />
            </div>

            {/* How It Works: Centered section with clean 3-step guide */}
            <div className="mx-auto w-full max-w-sm shrink-0">
              <h3 className="text-center text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
                How Voice Mode Works
              </h3>

              <ol className="mt-2 space-y-2 text-left sm:mt-3 sm:space-y-2.5">
                <li className="flex items-start gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-violet/10 text-[11px] font-bold text-brand-violet">
                    1
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold text-brand-ink">
                      Just start talking
                    </h4>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-brand-muted">
                      Ask a question, describe a moment, or just chat. Brisky listens when you finish speaking.
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-violet/10 text-[11px] font-bold text-brand-violet">
                    2
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold text-brand-ink">
                      Keep the conversation going
                    </h4>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-brand-muted">
                      Talk naturally, without typing. Your conversation stays together in your Space.
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-violet/10 text-[11px] font-bold text-brand-violet">
                    3
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold text-brand-ink">
                      Hear your reply
                    </h4>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-brand-muted">
                      Hear Brisky answer aloud, with source moments saved in your Space.
                    </p>
                  </div>
                </li>
              </ol>
            </div>

            {/* Footer Actions */}
            <div className="mt-4 flex shrink-0 items-center justify-center gap-3 border-t border-brand-line/80 pt-3.5 sm:mt-6 sm:pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-3.5 py-2 text-xs font-semibold text-brand-muted transition hover:text-brand-ink"
              >
                Maybe later
              </button>

              <button
                type="button"
                onClick={handleStart}
                className="rounded-xl bg-brand-action px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-action-hover"
              >
                Start Voice Mode
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  ) : null;
}
