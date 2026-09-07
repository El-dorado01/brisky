import React from 'react';
import { Film, Flame, Trash2 } from 'lucide-react';
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
}) => {
  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-4">
      <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 group">
        {selected?.streamUrl ? (
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
              <button
                onClick={onDeleteOriginal}
                disabled={selected.originalDeleted}
                className="p-1.5 text-xs text-rose-400 hover:bg-rose-950/40 rounded border border-rose-900/40 disabled:opacity-40 transition"
                title="Simulate thesis: Delete original master bytes"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selected.originalDeleted && (
            <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800/40 px-2.5 py-1 rounded">
              ✓ Original master bytes deleted from disk. Playing from 720p proxy using durable
              PostgreSQL intelligence.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
