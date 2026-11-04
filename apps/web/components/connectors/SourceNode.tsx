"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { usePulse } from "@/components/connectors/usePulse";
import { connectorById, type ConnectedSource } from "@/lib/connectors";

export type SourceNodeType = Node<{ source: ConnectedSource; index: number }, "source">;

function SourceNodeImpl({ data, selected }: NodeProps<SourceNodeType>) {
  const { source, index } = data;
  const { Icon, name } = connectorById(source.connectorId);
  const pulse = usePulse(index * 450 + 200);

  return (
    <div className={`w-[210px] cursor-pointer rounded-2xl border bg-brand-surface p-3.5 shadow-[0_6px_24px_rgba(115,99,222,0.08)] transition hover:border-brand-violet/60 ${
        selected ? "border-brand-violet ring-4 ring-brand-violet/25" : "border-brand-line"
      }`}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-canvas">
          <Icon className={`size-5 transition-transform duration-500 ${pulse ? "-rotate-12 scale-125" : ""}`} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-ink">{source.label}</p>
          <p className="truncate text-xs text-brand-muted">{name}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-brand-muted">
        <span>{source.files} files</span>
        <span className="flex items-center gap-1.5 font-medium text-brand-violet">
          <span className="relative flex size-2">
            {source.syncing && <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-violet/50" />}
            <span className={`relative inline-flex size-2 rounded-full ${source.syncing ? "bg-brand-action" : "bg-brand-muted/40"}`} />
          </span>
          <span className={source.syncing ? "" : "text-brand-muted"}>{source.statusText||(source.syncing ? "Processing" : "Connected")}</span>
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2.5 !border-2 !border-white !bg-brand-action" />
    </div>
  );
}

export const SourceNode = memo(SourceNodeImpl);

