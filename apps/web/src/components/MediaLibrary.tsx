import React from 'react';
import { Film, GitBranch, RefreshCw, Clock, ExternalLink, Cloud } from 'lucide-react';
import { AssetSummary, formatTime } from '../types';

// Timer feature to show elapsed time for processing assets and indexing duration for indexed assets
// Maybe deleted for users.
function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const ElapsedTimer: React.FC<{
  status: AssetSummary['status'];
  startedAt?: string;
  indexDurationMs?: number;
}> = ({ status, startedAt, indexDurationMs }) => {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (status !== 'processing' || !startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status, startedAt]);

  if (status === 'processing' && startedAt) {
    const elapsedMs = now - new Date(startedAt).getTime();
    return (
      <span className="text-[10px] text-amber-400/90 font-mono flex items-center gap-1 mt-0.5">
        <Clock className="w-2.5 h-2.5" />
        {formatElapsed(elapsedMs)} elapsed
      </span>
    );
  }

  if (status === 'indexed' && typeof indexDurationMs === 'number' && indexDurationMs > 0) {
    return (
      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
        <Clock className="w-2.5 h-2.5" />
        Indexed in {formatElapsed(indexDurationMs)}
      </span>
    );
  }

  return null;
};

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
                      src={`${asset.thumbnailUrl}?token=${encodeURIComponent(token || '')}&v=${encodeURIComponent(asset.indexedAt || '')}`}
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

                {/* Cloud source / Purged Master badge */}
                <div className="absolute top-1 left-1 flex items-center gap-1">
                  {(asset.sourceType === 'google_drive' || asset.driveWebViewLink) && (
                    <span className="bg-blue-950/90 border border-blue-500/50 text-blue-300 text-[9px] px-1 py-0.5 rounded font-medium flex items-center gap-0.5">
                      <Cloud className="w-2.5 h-2.5" />
                      Drive
                    </span>
                  )}
                  {asset.originalDeleted && (
                    <span
                      className="bg-purple-950/90 border border-purple-500/40 text-purple-300 text-[9px] px-1 py-0.5 rounded font-medium"
                      title="Raw master video purged from server; 720p/480p preview proxy and intelligence retained"
                    >
                      Proxy
                    </span>
                  )}
                </div>

                {/* Status badge & External Link */}
                <div className="absolute top-1 right-1 flex items-center gap-1">
                  {asset.driveWebViewLink && (
                    <a
                      href={asset.driveWebViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white text-[10px] p-1 rounded transition"
                      title="Open Original in Google Drive"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
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
                <ElapsedTimer
                  status={asset.status}
                  startedAt={asset.startedAt}
                  indexDurationMs={asset.indexDurationMs}
                />
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
