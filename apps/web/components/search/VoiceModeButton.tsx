"use client";

import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { AudioLines } from "@/components/animate-ui/icons/audio-lines";
import { createPortal } from 'react-dom';
import { useSpaces } from '@/lib/spaces-context';
import { useMobileLayout } from '@/hooks/use-mobile-layout';

export function VoiceModeButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const mobile=useMobileLayout();
  const {mobileActionsHost}=useSpaces();
  const button=(
    <AnimateIcon animate={active || undefined} animateOnHover loop asChild>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        aria-label={active ? 'Stop voice mode' : 'Open voice mode'}
        title={active ? 'Stop voice mode' : 'Voice mode'}
        className={`${mobile ? 'grid size-10 place-items-center rounded-xl' : 'fixed right-8 top-6 z-30 flex h-10 items-center gap-2 rounded-full border px-4'} text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet ${
          active
            ? "border-brand-violet bg-brand-violet/5 text-brand-violet"
            : "border-brand-violet/40 text-brand-violet hover:border-brand-violet hover:bg-brand-violet/5"
        }`}
      >
        <AudioLines size={20} strokeWidth={1.8} />
        {!mobile && (active ? "Listening…" : "Voice mode")}
      </button>
    </AnimateIcon>
  );
  return mobile ? mobileActionsHost && createPortal(button,mobileActionsHost) : button;
}
