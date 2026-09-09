import React, { useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Eye,
  Layers,
  Mic,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  BenchmarkItem,
  LibraryBenchmarkItem,
  LibraryBenchmarkSummary,
} from '../types';

interface BenchmarkTabProps {
  benchmarks: BenchmarkItem[];
  librarySummary: LibraryBenchmarkSummary | null;
  runningBenchmark: boolean;
  runningLibraryBenchmark: boolean;
  selectedAssetId: string;
  onRunBenchmark: () => void;
  onRunLibraryBenchmark: () => void;
}

export const BenchmarkTab: React.FC<BenchmarkTabProps> = ({
  benchmarks,
  librarySummary,
  runningBenchmark,
  runningLibraryBenchmark,
  selectedAssetId,
  onRunBenchmark,
  onRunLibraryBenchmark,
}) => {
  const [suiteMode, setSuiteMode] = useState<'library' | 'single'>('library');
  const [filterType, setFilterType] = useState<string>('all');

  const filteredLibraryResults = (librarySummary?.results || []).filter((item) => {
    if (filterType === 'all') return true;
    if (filterType === 'spoken') return item.type === 'spoken';
    if (filterType === 'visual') return item.type === 'visual';
    if (filterType === 'mixed') return item.type === 'mixed';
    if (filterType === 'negative') return item.type === 'negative';
    if (filterType === 'failed') return item.verdict === 'fail';
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Suite Selector Tabs */}
      <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
        <button
          onClick={() => setSuiteMode('library')}
          className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition flex items-center justify-center gap-1.5 ${
            suiteMode === 'library'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Phase 3: 30-Query Library Suite
        </button>
        <button
          onClick={() => setSuiteMode('single')}
          className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition flex items-center justify-center gap-1.5 ${
            suiteMode === 'single'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          Single Video (8 Queries)
        </button>
      </div>

      {suiteMode === 'library' ? (
        <div className="flex flex-col gap-4">
          {/* Header & Run Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                30-Query Multi-Modal Library Benchmark
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tests 10 Spoken, 10 Visual, 5 Mixed, and 5 Negative Control modifier traps across all indexed videos.
              </p>
            </div>
            <button
              onClick={onRunLibraryBenchmark}
              disabled={runningLibraryBenchmark}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3.5 py-2 rounded-lg transition disabled:opacity-50 font-medium shrink-0 flex items-center justify-center gap-1.5 shadow-md shadow-indigo-950"
            >
              {runningLibraryBenchmark ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Running 30 Queries...
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  Run Library Suite
                </>
              )}
            </button>
          </div>

          {/* KPI Scorecard */}
          {librarySummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl flex flex-col">
                <span className="text-[10px] uppercase font-bold text-slate-400">Recall @ 5</span>
                <span className="text-xl font-bold font-mono text-emerald-400 mt-1">
                  {(librarySummary.recallAt5 * 100).toFixed(0)}%
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">Across positive queries</span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl flex flex-col">
                <span className="text-[10px] uppercase font-bold text-slate-400">Median Error</span>
                <span className="text-xl font-bold font-mono text-indigo-300 mt-1">
                  {librarySummary.medianTimestampErrorSec.toFixed(1)}s
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">Timestamp accuracy</span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl flex flex-col">
                <span className="text-[10px] uppercase font-bold text-slate-400">p50 / p95 Latency</span>
                <span className="text-xl font-bold font-mono text-cyan-300 mt-1">
                  {librarySummary.p50LatencyMs} / {librarySummary.p95LatencyMs}
                  <span className="text-xs font-sans text-slate-500 ml-0.5">ms</span>
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">Vector + BM25 speed</span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl flex flex-col">
                <span className="text-[10px] uppercase font-bold text-slate-400">Stage-2 Verified</span>
                <span className="text-xl font-bold font-mono text-amber-300 mt-1">
                  {librarySummary.stage2VerificationCount}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">Gemini VLM confirmations</span>
              </div>
            </div>
          )}

          {/* Modality Pass Rates */}
          {librarySummary && (
            <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-xl flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-slate-300">Modality Pass Breakdown:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                  <Mic className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-slate-400 text-[11px]">Spoken:</span>
                  <strong className="text-cyan-300 font-mono ml-auto">
                    {(librarySummary.modalityBreakdown.spokenPassRate * 100).toFixed(0)}%
                  </strong>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                  <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-slate-400 text-[11px]">Visual:</span>
                  <strong className="text-emerald-300 font-mono ml-auto">
                    {(librarySummary.modalityBreakdown.visualPassRate * 100).toFixed(0)}%
                  </strong>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                  <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="text-slate-400 text-[11px]">Mixed:</span>
                  <strong className="text-purple-300 font-mono ml-auto">
                    {(librarySummary.modalityBreakdown.mixedPassRate * 100).toFixed(0)}%
                  </strong>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-slate-400 text-[11px]">Negative:</span>
                  <strong className="text-amber-300 font-mono ml-auto">
                    {(librarySummary.modalityBreakdown.negativeControlPassRate * 100).toFixed(0)}%
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Filter Pills */}
          {librarySummary && (
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-slate-500 mr-1">Filter:</span>
              {[
                { id: 'all', label: `All (${librarySummary.results.length})` },
                { id: 'spoken', label: 'Spoken (10)' },
                { id: 'visual', label: 'Visual (10)' },
                { id: 'mixed', label: 'Mixed (5)' },
                { id: 'negative', label: 'Negative Controls (5)' },
                {
                  id: 'failed',
                  label: `Failures (${librarySummary.results.filter((r) => r.verdict === 'fail').length})`,
                },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`px-2.5 py-0.5 rounded-full border transition ${
                    filterType === f.id
                      ? 'bg-indigo-600/90 text-white border-indigo-500 font-medium'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Results List */}
          <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
            {!librarySummary && !runningLibraryBenchmark && (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                Click &quot;Run Library Suite&quot; above to evaluate multi-modal search quality, modifier gating, and latency across your entire video library.
              </div>
            )}

            {filteredLibraryResults.map((bm: LibraryBenchmarkItem) => {
              const isPass = bm.verdict === 'pass';
              return (
                <div
                  key={bm.queryId}
                  className={`p-3 bg-slate-900/60 border ${
                    isPass ? 'border-slate-800/80 hover:border-slate-700' : 'border-rose-900/50 hover:border-rose-700'
                  } rounded-xl flex flex-col gap-1.5 text-xs transition`}
                >
                  {/* Top Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {bm.type === 'spoken' && <Mic className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                      {bm.type === 'visual' && <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      {bm.type === 'mixed' && <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                      {bm.type === 'negative' && <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      <span className="font-semibold text-slate-200 truncate">
                        &quot;{bm.query}&quot;
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {bm.stage2Verified && (
                        <span className="text-[9px] uppercase font-bold text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-600/50 flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          VLM Verified
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${
                          isPass
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {isPass ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {isPass ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-400 mt-0.5 bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                    <div>
                      Target / Expected:{' '}
                      <span className="text-slate-300 font-medium font-mono">{bm.expectedWindow}</span>
                    </div>
                    <div>
                      Found:{' '}
                      <span className="text-indigo-300 font-medium font-mono">{bm.resultWindow}</span>
                    </div>
                    {bm.matchedAsset && (
                      <div className="sm:col-span-2 truncate">
                        Matched Video:{' '}
                        <span className="text-slate-200 font-mono">{bm.matchedAsset}</span>
                      </div>
                    )}
                    <div>
                      Winning Path:{' '}
                      <span className="text-cyan-400 font-mono">{bm.winningPath}</span>
                    </div>
                    <div>
                      Latency: <span className="text-slate-300 font-mono">{bm.latencyMs}ms</span>
                    </div>
                  </div>

                  {/* Explanation if negative control or failure */}
                  {bm.explanation && (
                    <div className="text-[10px] text-amber-300/80 bg-amber-950/20 px-2 py-1 rounded border border-amber-900/30 font-sans">
                      {bm.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Single Asset 8-Query Harness */
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
            <div>
              <h4 className="text-xs font-semibold text-white">8-Query Benchmark Harness</h4>
              <p className="text-[11px] text-slate-400">
                Measures visual vs spoken accuracy against expected timestamp tolerances for selected video.
              </p>
            </div>
            <button
              onClick={onRunBenchmark}
              disabled={runningBenchmark || !selectedAssetId}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3.5 py-1.5 rounded-lg transition disabled:opacity-50 font-medium shrink-0"
            >
              {runningBenchmark ? 'Running...' : 'Run Suite'}
            </button>
          </div>

          <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
            {benchmarks.length === 0 && (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                Select a video in your library and click &quot;Run Suite&quot; to test its 8-moment benchmark.
              </div>
            )}
            {benchmarks.map((bm) => (
              <div
                key={bm.queryId}
                className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col gap-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">&quot;{bm.query}&quot;</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      bm.hit
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {bm.hit ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 mt-1">
                  <div>Expected: {bm.expectedWindow}</div>
                  <div>Found: {bm.resultWindow}</div>
                  <div>
                    Path: <span className="text-indigo-400">{bm.winningPath}</span>
                  </div>
                  <div>
                    Error: {bm.timestampErrorSec}s ({bm.latencyMs}ms)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
