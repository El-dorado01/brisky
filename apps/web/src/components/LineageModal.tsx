import React, { useEffect, useState } from 'react';
import { GitBranch, Hash, Layers, RefreshCw, X } from 'lucide-react';
import { AssetLineage } from '../types';

interface LineageModalProps {
  assetId: string;
  token: string | null;
  onClose: () => void;
  onSelectAsset: (id: string) => void;
}

export const LineageModal: React.FC<LineageModalProps> = ({
  assetId,
  token,
  onClose,
  onSelectAsset,
}) => {
  const [lineage, setLineage] = useState<AssetLineage | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`/api/v1/media/${assetId}/lineage`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch lineage`);
        return res.json();
      })
      .then((data: AssetLineage) => {
        if (isMounted) setLineage(data);
      })
      .catch((err: unknown) => {
        if (isMounted) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [assetId, token]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-xs p-1"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
            <GitBranch className="w-5 h-5" />
            <span>Asset Lineage & Derivation Tree</span>
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Lineage for <span className="text-indigo-300 font-mono text-xs">{assetId}</span>
          </h3>
          <p className="text-xs text-slate-400">
            Audit parent-child provenance, proxy relationships, and perceptual hashes (pHash).
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
            <span className="text-xs">Loading derivation provenance...</span>
          </div>
        ) : error ? (
          <div className="bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs p-3 rounded-xl">
            {error}
          </div>
        ) : lineage ? (
          <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-1">
            {/* Perceptual Hash */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Hash className="w-4 h-4 text-indigo-400" />
                <span>Perceptual Hash (pHash):</span>
              </div>
              <span className="font-mono text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-900/60 px-2 py-0.5 rounded">
                {lineage.phash || 'Calculated on ingestion'}
              </span>
            </div>

            {/* Ancestors / Parent */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                Provenance Chain (Ancestors)
              </span>
              {lineage.ancestors.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
                  This is a root media asset with no parent dependencies.
                </div>
              ) : (
                lineage.ancestors.map((anc) => (
                  <div
                    key={anc.assetId}
                    onClick={() => {
                      onSelectAsset(anc.assetId);
                      onClose();
                    }}
                    className="p-2.5 bg-slate-950/60 border border-slate-800 hover:border-indigo-500/60 rounded-lg flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">
                        {anc.originalFilename}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">{anc.assetId}</div>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
                      {anc.relationshipType || 'Parent'}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Current Node */}
            <div className="p-3 bg-indigo-950/30 border border-indigo-500/50 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white">Current Asset Target</span>
                <div className="text-[10px] font-mono text-indigo-300">{lineage.assetId}</div>
              </div>
              <span className="text-[10px] uppercase font-bold text-indigo-200 bg-indigo-900/60 px-2 py-0.5 rounded">
                Active Node
              </span>
            </div>

            {/* Children / Derivatives */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                Derivative Outputs & Clones ({lineage.children.length})
              </span>
              {lineage.children.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
                  No downstream child clips or derivatives generated yet.
                </div>
              ) : (
                lineage.children.map((child) => (
                  <div
                    key={child.assetId}
                    onClick={() => {
                      onSelectAsset(child.assetId);
                      onClose();
                    }}
                    className="p-2.5 bg-slate-950/60 border border-slate-800 hover:border-indigo-500/60 rounded-lg flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">
                        {child.originalFilename}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">{child.assetId}</div>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                      {child.relationshipType}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
