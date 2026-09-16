import React from 'react';
import { CheckCircle2, Cpu, RefreshCw } from 'lucide-react';
import { IndexingStats } from '../types';

interface PipelineStatusBarProps {
  stats: IndexingStats;
  indexingLabel: string | null;
}

export const PipelineStatusBar: React.FC<PipelineStatusBarProps> = ({ stats, indexingLabel }) => {
  const waitingForSlot = stats.waitingForSlot ?? (stats.waitingReasons ? (stats.waitingReasons.user_slot + stats.waitingReasons.global_capacity) : 0);
  const activeSlots = stats.activeSlots ?? stats.processing;
  const maxSlots = stats.globalMaxSlots ?? 2;

  return (
    <section className="bg-slate-900/40 border-b border-slate-800/80 px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Left: Job Metrics & Factual Slot Progress */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Factual Progress (§651) */}
          {stats.discovered > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-950/40 border border-indigo-800/50 px-2.5 py-1 rounded-lg text-indigo-200 font-medium">
              <span>
                <strong className="text-white">{stats.indexed}</strong> / {stats.discovered} videos indexed
              </span>
              {waitingForSlot > 0 && (
                <span className="text-amber-300 ml-1">
                  • {waitingForSlot} waiting for a free slot
                </span>
              )}
            </div>
          )}

          {/* Slot Allocation Indicator */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/80 px-2.5 py-1 rounded-lg text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              Factory Slots: <strong className={activeSlots >= maxSlots ? 'text-amber-300' : 'text-emerald-400'}>{activeSlots}</strong>/{maxSlots} active
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Queued:</span>
            <span className="font-semibold text-slate-300 px-2 py-0.5 bg-slate-800 rounded">
              {stats.queued ?? stats.remaining}
            </span>
          </div>

          {stats.failed > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-rose-400 font-medium">Failed:</span>
              <span className="font-semibold text-rose-300 px-2 py-0.5 bg-rose-950/60 border border-rose-800/50 rounded">
                {stats.failed}
              </span>
            </div>
          )}
        </div>

        {/* Right: Active Status, Search Availability, and Active Job */}
        <div className="flex items-center gap-3">
          {indexingLabel && (
            <span className="text-amber-400 text-xs animate-pulse font-medium">
              {indexingLabel}
            </span>
          )}

          {stats.indexed > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Searchable content is available now</span>
            </div>
          )}

          {stats.processing > 0 && stats.activeAsset && (
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 text-xs">
              <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
              <span className="text-slate-300 truncate max-w-[150px]">
                {stats.activeAsset.filename}
              </span>
              <span className="text-amber-400 font-mono text-[11px]">
                [{stats.activeAsset.stage} {stats.activeAsset.progress}%]
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
