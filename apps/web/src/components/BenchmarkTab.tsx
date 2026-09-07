import React from 'react';
import { BenchmarkItem } from '../types';

interface BenchmarkTabProps {
  benchmarks: BenchmarkItem[];
  runningBenchmark: boolean;
  selectedAssetId: string;
  onRunBenchmark: () => void;
}

export const BenchmarkTab: React.FC<BenchmarkTabProps> = ({
  benchmarks,
  runningBenchmark,
  selectedAssetId,
  onRunBenchmark,
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
        <div>
          <h4 className="text-xs font-semibold text-white">8-Query Benchmark Harness</h4>
          <p className="text-[11px] text-slate-400">
            Measures visual vs spoken accuracy against expected timestamp tolerances.
          </p>
        </div>
        <button
          onClick={onRunBenchmark}
          disabled={runningBenchmark || !selectedAssetId}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg transition disabled:opacity-50 font-medium shrink-0"
        >
          {runningBenchmark ? 'Running...' : 'Run Suite'}
        </button>
      </div>

      <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
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
  );
};
