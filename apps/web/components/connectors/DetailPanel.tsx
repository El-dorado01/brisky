"use client";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

import { FactoryClose as X } from "./FactoryIcons";
import { useEffect,useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMobileLayout } from '@/hooks/use-mobile-layout';
import { motion,useReducedMotion } from 'framer-motion';
import { connectorById, type ConnectedSource } from "@/lib/connectors";
import type { ActivityItem, PipelineStage } from "@/lib/pipeline-stages";

export type Selection = { kind: "stage"; stage: PipelineStage } | { kind: "source"; source: ConnectedSource } | null;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-brand-line p-3">
      <p className="text-lg font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-brand-muted">{label}</p>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-muted">{children}</h3>;
}

function Activity({ items }: { items: ActivityItem[] }) {
  return (
    <>
    <ol className="mt-3 space-y-3 border-l border-brand-line pl-4">
      {items.slice(0,5).map((a, i) => (
        <li key={i} className="relative text-sm">
          <span
            className={`absolute -left-[21px] top-1.5 size-2 rounded-full ${a.tone === "warn" ? "bg-amber-400" : "bg-brand-action"}`}
          />
          <p className="text-brand-ink">{a.text}</p>
          <p className="text-xs text-brand-muted">{a.time}</p>
          {!!a.steps?.length&&<details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-brand-violet">{a.steps.length} recorded {a.steps.length===1?'step':'steps'}</summary><ul className="mt-2 space-y-2 rounded-lg bg-brand-canvas p-3">{a.steps.map(step=><li key={step.id}><p className="text-xs text-brand-ink">{step.text}</p><p className="text-[11px] text-brand-muted">{step.time}</p></li>)}</ul></details>}
        </li>
      ))}
    </ol>
    {items.length>5&&<p className="mt-3 text-xs text-brand-muted">Showing the 5 most recent files.</p>}
    </>
  );
}

export function DetailPanel({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const open = selection !== null;
  const mobile=useMobileLayout(),dialog=useRef<HTMLDialogElement>(null);
  const reduced=useReducedMotion();
  useEffect(()=>{const element=dialog.current;if(!mobile||!open||!element)return;element.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{element.close();document.body.style.overflow=previous;};},[mobile,open]);

  let title = "";
  let subtitle = "";
  let body: React.ReactNode = null;

  if (selection?.kind === "stage") {
    const s = selection.stage;
    title = s.title;
    subtitle = s.description;
    body = (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Done today" value={s.doneToday??"Not available"} />
          <Stat label="Average time" value={s.avgTime} />
          <Stat label="Success rate" value={s.successRate} />
          <Stat label="Failed today" value={s.failedToday??"Not available"} />
        </div>

        <section className="mt-8">
          <Title>Right now</Title>
          {s.files.length === 0 ? (
            <p className="mt-3 text-sm text-brand-muted">Nothing is in this step at the moment.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {s.files.slice(0,5).map((f) => (
                <li key={f.name}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{f.name}</span>
                    <span className="shrink-0 text-brand-muted">{f.progress===null?'Working':`${f.progress}%`}</span>
                  </div>
                  {f.progress!==null&&<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-violet/10">
                    <div className="h-full rounded-full bg-brand-action" style={{ width: `${f.progress}%` }} />
                  </div>}
                  <p className="mt-1 text-xs text-brand-muted">{f.note}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <Title>What happened</Title>
          <p className="mt-2 text-xs text-brand-muted">Recorded today in Lagos time. Totals count files; time and success rate use recorded runs, including retries. Percentages use completed work units; other steps show Working.</p>
          {!s.activity.length&&<p className="mt-3 text-sm text-brand-muted">No recorded activity yet. Earlier indexing has no stage history.</p>}
          <Activity items={s.activity} />
        </section>
      </>
    );
  } else if (selection?.kind === "source") {
    const src = selection.source;
    const c = connectorById(src.connectorId);
    title = src.label;
    subtitle = c.name;
    body = (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Files tracked" value={src.files} />
          <Stat label="Last sync" value={src.lastSync} />
        </div>

        <section className="mt-8">
          <Title>Watched folders</Title>
          <ul className="mt-3 flex flex-wrap gap-2">
            {src.folders.map((f) => (
              <li key={f} className="rounded-lg bg-brand-canvas px-2.5 py-1 text-xs font-medium text-brand-ink">
                {f}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <Title>What happened</Title>
          <Activity items={src.activity} />
        </section>
      </>
    );
  }

  const panel=(
    <aside
      aria-hidden={!open}
      className={`${mobile?'flex h-dvh w-full':'absolute right-0 top-0 z-30 flex h-full w-[400px]'} flex-col border-l border-brand-line bg-brand-surface shadow-[-20px_0_60px_rgba(34,40,63,0.08)] transition-transform duration-300 ease-out motion-reduce:transition-none ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-brand-line p-6">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-brand-muted">{subtitle}</p>
        </div>
        <AnimateIcon animateOnHover asChild><button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          tabIndex={open ? 0 : -1}
          className="grid size-9 shrink-0 place-items-center rounded-xl text-brand-muted transition hover:bg-brand-canvas hover:text-brand-ink"
        >
          <X className="size-5" strokeWidth={1.8} />
        </button></AnimateIcon>
      </div>
      <div className="thin-scrollbar flex-1 overflow-y-auto p-6">{body}</div>
    </aside>
  );
  return mobile?(open?createPortal(<dialog ref={dialog} aria-label={title||'Factory details'} onCancel={event=>{event.preventDefault();onClose();}} className="fixed inset-0 m-0 h-dvh max-h-dvh w-full max-w-full overflow-hidden bg-transparent p-0 text-brand-ink backdrop:bg-brand-ink/30"><motion.div initial={{x:reduced?0:'100%'}} animate={{x:0}} transition={reduced?{duration:.01}:{duration:.32,ease:[.22,1,.36,1]}} style={{willChange:'transform',backfaceVisibility:'hidden'}} className="h-full w-full">{panel}</motion.div></dialog>,document.body):null):panel;
}
