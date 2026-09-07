import React from 'react';

interface ArtifactsTabProps {
  artifacts: Record<string, unknown> | null;
}

export const ArtifactsTab: React.FC<ArtifactsTabProps> = ({ artifacts }) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
      <span className="text-xs font-semibold text-slate-300">
        PostgreSQL Intelligence & Raw JSON Inspector
      </span>
      <pre className="text-[11px] font-mono text-emerald-400 bg-black/70 p-3 rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto">
        {artifacts
          ? JSON.stringify(artifacts, null, 2)
          : '// Select an indexed video to view intelligence artifacts'}
      </pre>
    </div>
  );
};
