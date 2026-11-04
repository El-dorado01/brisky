"use client";

import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { Play } from '@/components/animate-ui/icons/hugeicons/play';
import type { SpaceCitation } from '@/lib/spaces-types';

function clock(seconds:number){
  const value=Math.max(0,Math.floor(seconds));
  return `${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`;
}

export function ReplyCitation({citation,onOpen}:{citation:SpaceCitation;onOpen:()=>void}){
  const title=citation.title||citation.filename;
  const words=title.trim().split(/\s+/);
  const shortTitle=words.length>7?words.slice(0,7).join(' ')+'…':title;
  return <AnimateIcon animateOnHover asChild><button type="button" onClick={onOpen}
    aria-label={`Open ${title}, ${clock(citation.startS)} to ${clock(citation.endS)}`}
    title={title}
    className="group flex min-h-16 w-full max-w-sm items-center gap-3 rounded-2xl border border-brand-line bg-brand-surface p-3 text-left shadow-sm transition hover:border-brand-violet/35 hover:bg-brand-violet/[.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet sm:w-80">
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-violet/10 text-brand-violet transition group-hover:bg-brand-violet/15"><Play size={18}/></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-brand-ink">{shortTitle}</span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-brand-muted"><span className="font-mono tabular-nums">{clock(citation.startS)} – {clock(citation.endS)}</span><span aria-hidden="true">·</span><span>{Number((citation.endS-citation.startS).toFixed(1))}s</span><span className="ml-auto font-medium text-brand-violet">View moment</span></span>
    </span>
  </button></AnimateIcon>;
}
