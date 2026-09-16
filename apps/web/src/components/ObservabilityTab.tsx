import React from 'react';
import {
  Activity,
  AlertCircle,
  Clock,
  DollarSign,
  Flame,
  Layers,
  RefreshCw,
  ShieldCheck,
  ThumbsUp,
} from 'lucide-react';
import { IndexingJobItem, UnitEconomicsSummary, parseJsonSafe } from '../types';

interface ObservabilityTabProps {
  jobs: IndexingJobItem[];
  economics?: UnitEconomicsSummary | null;
  retryingId: string | null;
  onRefresh: () => void;
  onRetry: (assetId: string) => void;
}

export const ObservabilityTab: React.FC<ObservabilityTabProps> = ({
  jobs,
  economics,
  retryingId,
  onRefresh,
  onRetry,
}) => {
  return (
    <div className="flex flex-col gap-3.5">
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900/70 border border-slate-800 p-3 rounded-xl">
        <div>
          <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-indigo-400" />
            Queue Observability & Unit Economics
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Ingestion costs, Stage-2 search verification spend, and job queue telemetry.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700 transition"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Unit Economics Dashboard Card */}
      {economics && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              Unit Economics & Cost Breakdown
            </span>
            <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800/60 px-2 py-0.5 rounded font-mono">
              Stage 1 vs Stage 2
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Stage 1 Ingestion */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex flex-col gap-1">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Stage-1 Ingestion</span>
              </div>
              <span className="text-base font-bold font-mono text-amber-300">
                ${economics.stage1Ingestion.totalCostUsd.toFixed(4)}{' '}
                <span className="text-[10px] font-sans text-slate-500">total</span>
              </span>
              <div className="text-[10px] text-slate-400 flex flex-col gap-0.5 mt-1 font-mono">
                <div>Rate: ${economics.stage1Ingestion.costPerSourceMinuteUsd.toFixed(4)}/min</div>
                <div>Source: {economics.stage1Ingestion.totalSourceMinutes} mins indexed</div>
                <div>Frames: {economics.stage1Ingestion.totalFramesAnalyzed} analyzed</div>
              </div>
            </div>

            {/* Stage 2 Search Verification */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex flex-col gap-1">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Stage-2 Verification</span>
              </div>
              <span className="text-base font-bold font-mono text-emerald-300">
                ${economics.stage2Verification.estimatedCostUsd.toFixed(4)}{' '}
                <span className="text-[10px] font-sans text-slate-500">spent</span>
              </span>
              <div className="text-[10px] text-slate-400 flex flex-col gap-0.5 mt-1 font-mono">
                <div>Queries: {economics.stage2Verification.totalQueriesVerified} deep verified</div>
                <div>Per Query: ~${economics.stage2Verification.costPerQueryUsd.toFixed(5)}</div>
                <div>Cache Hit Rate: {Math.round(economics.stage2Verification.cacheHitRate * 100)}%</div>
              </div>
            </div>

            {/* User Relevance Feedback */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex flex-col gap-1">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                <ThumbsUp className="w-3.5 h-3.5 text-cyan-400" />
                <span>Relevance Feedback</span>
              </div>
              <span className="text-base font-bold font-mono text-cyan-300">
                {(economics.searchFeedback.positiveRatio * 100).toFixed(0)}%{' '}
                <span className="text-[10px] font-sans text-slate-500">satisfaction</span>
              </span>
              <div className="text-[10px] text-slate-400 flex flex-col gap-0.5 mt-1 font-mono">
                <div className="text-emerald-400">👍 Helpful: {economics.searchFeedback.positiveCount}</div>
                <div className="text-rose-400">👎 Incorrect: {economics.searchFeedback.negativeCount}</div>
                <div>Total: {economics.searchFeedback.positiveCount + economics.searchFeedback.negativeCount} logged</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Worker Waiting Notice */}
      {jobs.some((j) => j.status === 'waiting') && (
        <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-xs flex items-center justify-between">
          <span>
            ⚡ <strong>Decoupled Worker Notice:</strong> Jobs are currently waiting in queue. In accordance with the Media Factory architecture, ensure your worker is running via{' '}
            <code className="bg-amber-900/60 px-1.5 py-0.5 rounded text-amber-200 font-mono">pnpm dev:worker</code>.
          </span>
        </div>
      )}

      {/* Job Queue Header & List */}
      <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 px-1">
        <Layers className="w-3.5 h-3.5 text-indigo-400" />
        Pipeline Job Telemetry ({jobs.length})
      </div>

      {jobs.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
          No indexing jobs recorded yet. Connect Google Drive or sync video files to observe pipeline telemetry.
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-h-[460px] overflow-y-auto pr-1">
          {jobs.map((job) => {
            const timings = parseJsonSafe<Array<{ stage: string; durationMs: number }>>(
              job.timings,
              [],
            );
            const cost = parseJsonSafe<{
              estimatedUsd?: number;
              framesAnalyzed?: number;
              sceneCount?: number;
              indexDurationMs?: number;
            }>(job.cost, {});

            const isActive = job.status === 'active';
            const isWaiting = job.status === 'waiting';
            const isCompleted = job.status === 'completed';
            const isFailed = job.status === 'failed';

            return (
              <div
                key={job.id}
                className="bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 rounded-xl p-3.5 flex flex-col gap-2.5 transition"
              >
                {/* Header: title + status badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h5
                      className="text-xs font-semibold text-slate-200 truncate"
                      title={job.original_filename || job.asset_id}
                    >
                      {job.original_filename || job.asset_id}
                    </h5>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 font-mono">
                      <span>ID: {job.asset_id.slice(0, 8)}...</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(job.created_at).toLocaleTimeString()}
                      </span>
                      {job.attempts > 1 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-400">Attempt #{job.attempts}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isCompleted && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                        Completed
                      </span>
                    )}
                    {isActive && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950 text-amber-400 border border-amber-800/60 flex items-center gap-1 animate-pulse">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        Active
                      </span>
                    )}
                    {isWaiting && job.waiting_reason === 'user_slot' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950/70 text-amber-300 border border-amber-800/60 flex items-center gap-1" title="Waiting for user processing slot">
                        <Clock className="w-3 h-3 text-amber-400" />
                        User Slot Wait
                      </span>
                    )}
                    {isWaiting && job.waiting_reason === 'global_capacity' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-950/70 text-indigo-300 border border-indigo-800/60 flex items-center gap-1" title="Waiting for factory capacity">
                        <Clock className="w-3 h-3 text-indigo-400" />
                        Capacity Wait
                      </span>
                    )}
                    {isWaiting && !job.waiting_reason && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Waiting
                      </span>
                    )}
                    {isFailed && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-950 text-rose-400 border border-rose-800/60 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Failed
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar & Stage */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-300 font-medium">
                      {job.waiting_reason === 'user_slot'
                        ? 'Waiting for free user slot'
                        : job.waiting_reason === 'global_capacity'
                        ? 'Waiting for factory capacity'
                        : job.stage || 'queued'}
                    </span>
                    <span className="font-mono text-indigo-400 font-semibold">{job.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isFailed ? 'bg-rose-500' : isCompleted ? 'bg-emerald-500' : isWaiting ? 'bg-amber-600/80' : 'bg-indigo-500'
                      }`}
                      style={{ width: `${Math.max(job.progress, 4)}%` }}
                    />
                  </div>
                </div>

                {/* Metadata row: Provider / Model / Cost */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/60">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span>
                      Provider: <strong className="text-slate-200">{job.provider || 'gemini'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Model: <strong className="text-slate-200">{job.model || 'gemini-3.5-flash-lite'}</strong>
                    </span>
                  </div>
                  {cost.estimatedUsd !== undefined && (
                    <div className="flex items-center gap-1 text-amber-300 font-mono">
                      <Flame className="w-3 h-3 text-amber-400" />
                      <span>${cost.estimatedUsd.toFixed(4)} USD</span>
                    </div>
                  )}
                </div>

                {/* Stage Timings Breakdown */}
                {Array.isArray(timings) && timings.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium text-slate-400">Stage Timings:</span>
                    <div className="flex flex-wrap gap-1">
                      {timings.map((t, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-slate-800/70 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded font-mono"
                        >
                          {t.stage}:{' '}
                          <strong className="text-indigo-300">
                            {(t.durationMs / 1000).toFixed(1)}s
                          </strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error Message & Retry Action */}
                {isFailed && (
                  <div className="flex flex-col gap-2 bg-rose-950/30 border border-rose-900/50 p-2.5 rounded-lg">
                    <div className="flex items-start gap-2 text-[11px] text-rose-300">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span className="font-mono break-all line-clamp-3">
                        {job.error || 'Pipeline execution error'}
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => onRetry(job.asset_id)}
                        disabled={retryingId === job.asset_id}
                        className="text-xs bg-rose-900/80 hover:bg-rose-800 text-rose-100 px-3 py-1 rounded font-medium transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${retryingId === job.asset_id ? 'animate-spin' : ''}`}
                        />
                        Retry Job
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
