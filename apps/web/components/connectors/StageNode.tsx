"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { usePulse } from "@/components/connectors/usePulse";
import type { PipelineStage } from "@/lib/pipeline-stages";

export type StageNodeType = Node<{ stage: PipelineStage; index: number }, "stage">;

const handle = "!size-2.5 !border-2 !border-white !bg-brand-action";

function StageNodeImpl({ data, selected }: NodeProps<StageNodeType>) {
  const { stage, index } = data;
  const { Icon, files } = stage;
  const active = files.length > 0;
  const pulse = usePulse(index * 450);

  return (
    <div
      className={`w-[240px] cursor-pointer rounded-2xl border bg-brand-surface p-4 shadow-[0_6px_24px_rgba(115,99,222,0.08)] transition hover:border-brand-violet/60 ${
        selected
          ? "border-brand-violet ring-4 ring-brand-violet/25"
          : active
            ? "border-brand-violet/50 ring-4 ring-brand-violet/10"
            : "border-brand-line"
      }`}
    >
      <Handle type="target" position={Position.Left} className={handle} />

      <div className="flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-violet/10 text-brand-violet">
          <Icon size={20} strokeWidth={1.8} animate={pulse} />
        </span>
        {active ? (
          <span className="rounded-full bg-brand-action px-2 py-0.5 text-[11px] font-medium text-white">
            {files.length} {files.length === 1 ? "file" : "files"}
          </span>
        ) : (
          <span className="rounded-full bg-brand-canvas px-2 py-0.5 text-[11px] font-medium text-brand-muted">No active files</span>
        )}
      </div>

      <h3 className="mt-3 text-sm font-semibold text-brand-ink">{stage.title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-brand-muted">{stage.description}</p>

      {active && (
        <ul className="mt-3 space-y-2.5 border-t border-brand-line pt-3">
          {files.slice(0,5).map((f) => (
            <li key={f.name}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-medium text-brand-ink">{f.name}</span>
                <span className="shrink-0 text-brand-muted">{f.progress===null?'Working':`${f.progress}%`}</span>
              </div>
              {f.progress!==null&&<div className="mt-1 h-1 overflow-hidden rounded-full bg-brand-violet/10">
                <div className="h-full rounded-full bg-brand-action" style={{ width: `${f.progress}%` }} />
              </div>}
              <p className="mt-1 text-[11px] text-brand-muted">{f.note}</p>
            </li>
          ))}
        </ul>
      )}

      {!!stage.recentFiles?.length&&files.length<5&&<ul className="mt-3 space-y-2 border-t border-brand-line pt-3">{stage.recentFiles.filter(file=>!files.some(active=>active.id===file.id)).slice(0,Math.max(0,5-files.length)).map(file=><li key={file.id} className="flex items-center gap-2 text-[11px]"><span className="min-w-0 flex-1 truncate text-brand-ink">{file.name}</span><span className={file.status==='completed'?'text-emerald-700':'text-amber-700'}>{file.reused?'Reused':file.status==='completed'?'Done':file.status==='deferred'?'Waiting':file.status}</span></li>)}</ul>}

      <p className="mt-3 text-[11px] text-brand-muted">{stage.doneToday===null?"Live indexing status":`${stage.doneToday} done today`}</p>

      <Handle type="source" position={Position.Right} className={handle} />
    </div>
  );
}

export const StageNode = memo(StageNodeImpl);
