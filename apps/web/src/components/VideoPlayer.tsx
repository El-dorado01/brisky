import React, { useState } from 'react';
import { Film, Flame, Loader2, Sparkles, Trash2, Video } from 'lucide-react';
import { AssetSummary, formatTime } from '../types';

interface VideoPlayerProps {
  selected: AssetSummary | undefined;
  token: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  currentTime: number;
  duration: number;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  pendingSeekTimeRef: React.MutableRefObject<number | null>;
  onDeleteOriginal: () => void;
  onTriggerPreview?: (assetId: string) => Promise<void> | void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  selected,
  token,
  videoRef,
  currentTime,
  duration,
  setCurrentTime,
  setDuration,
  pendingSeekTimeRef,
  onDeleteOriginal,
  onTriggerPreview,
}) => {
  const [triggering, setTriggering] = useState(false);

  const handleGeneratePreview = async () => {
    if (!selected || triggering) return;
    setTriggering(true);
    try {
      if (onTriggerPreview) {
        await onTriggerPreview(selected.assetId);
      }
    } finally {
      setTriggering(false);
    }
  };

  const isPreparing = selected?.proxyStatus === 'queued' || selected?.proxyStatus === 'processing';
  const isNone = selected?.proxyStatus === 'none';
  const isFailed = selected?.proxyStatus === 'failed';
  const canPlay =
    selected?.streamUrl &&
    (selected.proxyStatus === 'ready' || selected.proxyStatus === 'skipped' || !selected.proxyStatus);

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-4">
      <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 group">
        {canPlay ? (
          <video
            ref={videoRef}
            src={`${selected.streamUrl}?token=${encodeURIComponent(token || '')}`}
            className="w-full h-full object-contain"
            onTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
                if (pendingSeekTimeRef.current !== null) {
                  videoRef.current.currentTime = pendingSeekTimeRef.current;
                  videoRef.current.play().catch(() => undefined);
                  pendingSeekTimeRef.current = null;
                }
              }
            }}
            onCanPlay={() => {
              if (videoRef.current && pendingSeekTimeRef.current !== null) {
                videoRef.current.currentTime = pendingSeekTimeRef.current;
                videoRef.current.play().catch(() => undefined);
                pendingSeekTimeRef.current = null;
              }
            }}
            controls
          />
        ) : isPreparing ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-3 p-6 text-center bg-slate-950/90">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-white">Generating On-Demand 720p Preview...</p>
              <p className="text-xs text-slate-400 max-w-sm">
                Brisky generates derived media just-in-time to save permanent warehouse storage. Search and moments are fully available.
              </p>
            </div>
          </div>
        ) : isNone ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-3 p-6 text-center bg-slate-950/90">
            <div className="w-12 h-12 rounded-full bg-indigo-950/80 border border-indigo-800 flex items-center justify-center">
              <Video className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-white">Preview Not Stored</p>
              <p className="text-xs text-slate-400 max-w-sm">
                Indexed moments and transcripts are ready. Proxy video is generated on-demand to stop warehouse bloat.
              </p>
            </div>
            <button
              onClick={handleGeneratePreview}
              disabled={triggering}
              className="mt-2 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded-lg font-medium transition disabled:opacity-50"
            >
              {triggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Generate 720p Preview
            </button>
          </div>
        ) : isFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-rose-300 gap-2 p-6 text-center bg-slate-950/90">
            <p className="text-sm font-semibold">Preview Generation Failed</p>
            <button
              onClick={handleGeneratePreview}
              disabled={triggering}
              className="text-xs bg-rose-950 border border-rose-800 text-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-900 transition"
            >
              Retry Preview Generation
            </button>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
            <Film className="w-12 h-12 opacity-40" />
            <p className="text-sm">No video selected or asset still indexing</p>
          </div>
        )}
      </div>

      {/* Video Controls & Meta */}
      {selected && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white truncate max-w-md">
                {selected.originalFilename}
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                <span>
                  {formatTime(currentTime)} / {formatTime(selected.duration || duration)}
                </span>
                <span>•</span>
                <span>{selected.resolution}</span>
                <span>•</span>
                <span>{selected.codec}</span>
                <span>•</span>
                <span>{selected.segmentCount} moments indexed</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selected.costUsd !== undefined && (
                <div className="flex items-center gap-1.5 text-xs bg-slate-800/80 border border-slate-700/60 px-2.5 py-1 rounded-md text-amber-300 font-mono">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>${selected.costUsd.toFixed(4)}</span>
                </div>
              )}
              {selected.sourceType === 'upload' && import.meta.env.VITE_ENABLE_DEV_UPLOAD === 'true' && (
                <button
                  onClick={onDeleteOriginal}
                  disabled={selected.originalDeleted}
                  className="p-1.5 text-xs text-rose-400 hover:bg-rose-950/40 rounded border border-rose-900/40 disabled:opacity-40 transition"
                  title="Simulate thesis: Delete master upload bytes"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {selected.originalDeleted && (
            <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800/40 px-2.5 py-1 rounded">
              ✓ Original master bytes deleted from disk. Playing from 720p proxy using durable
              PostgreSQL intelligence.
            </div>
          )}
          {selected.proxyStatus === 'ready' && !selected.originalDeleted && (
            <div className="text-[11px] text-indigo-300 bg-indigo-950/30 border border-indigo-800/40 px-2.5 py-1 rounded">
              ✓ On-demand 720p proxy active (managed by LRU disk cache).
            </div>
          )}
          {selected.proxyStatus === 'skipped' && (
            <div className="text-[11px] text-emerald-300 bg-emerald-950/30 border border-emerald-800/40 px-2.5 py-1 rounded">
              ✓ Streaming web-safe master directly (zero proxy transcoding overhead).
            </div>
          )}
        </div>
      )}
    </div>
  );
};
