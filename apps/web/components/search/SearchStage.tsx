"use client";

import dynamic from "next/dynamic";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { SendHorizontalIcon } from "@/components/animate-ui/icons/hugeicons/send-horizontal";
import { AnimatedPlaceholder } from "@/components/search/AnimatedPlaceholder";
import { LoginBackground } from "@/components/auth/LoginBackground";
import type { BriskyPose } from "@/components/mascot/BriskyCompanion";
import { SearchResultsView } from "@/components/search/SearchResultsView";
import { ThoughtBubble } from "@/components/search/ThoughtBubble";
import { VoiceModeButton } from "@/components/search/VoiceModeButton";
import { useSpaces } from "@/lib/spaces-context";
import { LoaderCircle } from 'lucide-react';
import { spaceRequestId } from '@/lib/spaces-client';

// The mascot needs the browser (WebGL), so it is never rendered on the server.
const BriskyCompanion = dynamic(() => import("@/components/mascot/BriskyCompanion").then((m) => m.BriskyCompanion), {
  ssr: false,
});

export function SearchStage() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const voice=false;
  const { activeSpace, activeSpaceId, loading, createSpace,setVoiceOpen } = useSpaces();
  const [saveError,setSaveError]=useState('');
  const pendingSpace=useRef<{id:string;query:string}|null>(null);
  const creatingSpace=useRef(false);

  const pose: BriskyPose = searching ? "searching" : focused || voice ? "listening" : "idle";

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed || creatingSpace.current) return;
    creatingSpace.current=true;
    if(pendingSpace.current?.query!==trimmed)pendingSpace.current={id:spaceRequestId(),query:trimmed};
    setQuery(trimmed);
    setSearching(true);
    setSaveError('');
    try {await createSpace(trimmed,pendingSpace.current.id);pendingSpace.current=null;setQuery('');}
    catch(error){setSaveError(error instanceof Error?error.message:'Unable to create your space.');}
    finally {creatingSpace.current=false;setSearching(false);}
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    runSearch(query);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleToggleVoiceButton(){setVoiceOpen(true);}

  if (activeSpaceId) {
    return (
      <SearchResultsView
        key={activeSpaceId}
        spaceId={activeSpaceId}
        initialQuery={activeSpace?.query??''}
      />
    );
  }

  return (
    <>
      <LoginBackground />



      <div className="relative z-10 flex w-full max-w-[640px] flex-col items-center px-5 py-10">
        <VoiceModeButton active={voice} onToggle={handleToggleVoiceButton} />
        <div className="character-stage h-[240px] w-full max-w-[360px]">
          <BriskyCompanion
            enabled
            config={{ size: 100, amplitude: 0.6, satellites: true, tracking: true, motion: true, pose }}
          />
          <ThoughtBubble pose={pose} />
          <div className="ground-shadow" />
        </div>

        <h1 className="-mt-14 text-center text-3xl font-semibold tracking-tight">What are you looking for?</h1>
        <p className="mt-2 text-center text-sm text-brand-muted">Describe the moment the way you remember it.</p>

        <form
          onSubmit={submit}
          className="mt-8 w-full rounded-2xl border border-brand-line bg-brand-surface p-3 shadow-[0_8px_30px_rgba(115,99,222,0.08)] transition focus-within:border-brand-violet focus-within:ring-4 focus-within:ring-brand-violet/15"
        >
          <label htmlFor="q" className="sr-only">
            Describe a moment
          </label>
          <div className="relative">
            {!query && <AnimatedPlaceholder />}
            <textarea
              id="q"
              rows={2}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="w-full resize-none bg-transparent px-2 py-1 text-base text-brand-ink outline-none"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="px-2 text-xs text-brand-muted">Enter to search · Shift+Enter for a new line</span>
            <AnimateIcon animateOnHover asChild>
              <button
                type="submit"
                disabled={!query.trim() || searching || loading}
                aria-busy={searching}
                aria-label="Search"
                className="grid size-9 place-items-center rounded-xl bg-brand-action text-white transition hover:bg-brand-action-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand-action"
              >
                {searching?<LoaderCircle size={18} className="animate-spin motion-reduce:animate-none"/>:<SendHorizontalIcon size={18} />}
              </button>
            </AnimateIcon>
          </div>
        </form>
        {saveError&&<p role="alert" className="mt-3 text-sm text-red-600">{saveError}</p>}
      </div>
    </>
  );
}
