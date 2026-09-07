import React from 'react';
import { Film, GitBranch, RefreshCw } from 'lucide-react';
import { AssetSummary, formatTime } from '../types';

interface MediaLibraryProps {
  assets: AssetSummary[];
  selectedAssetId: string;
  token: string | null;
  retryingId: string | null;
  onSelectAsset: (assetId: string) => void;
  onRefresh: () => void;
  onRetry: (assetId: string) => void;
  onOpenLineage: (assetId: string) => void;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  assets,
  selectedAssetId,
  token,
  retryingId,
  onSelectAsset,
  onRefresh,
  onRetry,
  onOpenLineage,
}) => {
  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Film className="w-4 h-4 text-indigo-400" />
          <span>Media Library Catalog ({assets.length} assets)</span>
        </h3>
        <button
          onClick={onRefresh}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[280px] overflow-y-auto pr-1">
        {assets.map((asset) => {
          const isSelected = asset.assetId === selectedAssetId;
          return (
            <div
              key={asset.assetId}
              onClick={() => onSelectAsset(asset.assetId)}
              className={`relative rounded-xl border p-2 flex flex-col gap-2 cursor-pointer transition text-left group ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-950/30'
                  : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="relative aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800/60 flex items-center justify-center">
                {asset.status === 'indexed' && asset.thumbnailUrl ? (
                  <>
                    <img
                      src={`${asset.thumbnailUrl}?token=${encodeURIComponent(token || '')}`}
                      alt={asset.originalFilename}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 -z-10 flex items-center justify-center text-slate-700">
                      <Film className="w-6 h-6" />
                    </div>
                  </>
                ) : asset.status === 'processing' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-slate-900/60 text-amber-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span className="text-[10px] font-mono text-slate-400">Preview pending...</span>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700">
                    <Film className="w-6 h-6" />
                  </div>
                )}

                {/* Status badge */}
                <div className="absolute top-1 right-1">
                  {asset.status === 'indexed' && (
                    <span className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
                      Indexed
                    </span>
                  )}
                  {asset.status === 'processing' && (
                    <span className="bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      {asset.progress}%
                    </span>
                  )}
                  {asset.status === 'queued' && (
                    <span className="bg-slate-800 border border-slate-600 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
                      Queued
                    </span>
                  )}
                  {asset.status === 'failed' && (
                    <span className="bg-rose-950/80 border border-rose-500/40 text-rose-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
                      Failed
                    </span>
                  )}
                </div>

                {asset.duration > 0 && (
                  <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] px-1 rounded text-slate-300 font-mono">
                    {formatTime(asset.duration)}
                  </span>
                )}
              </div>

              <div>
                <p
                  className="text-xs font-medium text-slate-200 truncate"
                  title={asset.originalFilename}
                >
                  {asset.originalFilename}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                  <span>{asset.segmentCount} moments</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenLineage(asset.assetId);
                    }}
                    className="text-slate-500 hover:text-indigo-400 p-0.5 rounded transition"
                    title="View Media Lineage & Derivation Tree"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {asset.status === 'failed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(asset.assetId);
                  }}
                  disabled={retryingId === asset.assetId}
                  className="text-[11px] text-rose-300 bg-rose-950/60 border border-rose-800/60 rounded px-2 py-1 hover:bg-rose-900 transition flex items-center justify-center gap-1"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${retryingId === asset.assetId ? 'animate-spin' : ''}`}
                  />
                  Retry File
                </button>
              )}
              {asset.status === 'processing' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(asset.assetId);
                  }}
                  disabled={retryingId === asset.assetId}
                  className="text-[10px] text-amber-300/90 bg-slate-800/80 hover:bg-slate-750 border border-amber-800/40 rounded px-2 py-0.5 transition flex items-center justify-center gap-1 mt-0.5"
                  title="Nudge or restart indexing job if it appears stuck"
                >
                  <RefreshCw
                    className={`w-2.5 h-2.5 ${retryingId === asset.assetId ? 'animate-spin' : ''}`}
                  />
                  Nudge
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
