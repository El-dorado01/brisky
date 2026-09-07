import React from 'react';
import { CheckCircle2, Clock, Film, Play, Search, Sparkles } from 'lucide-react';
import { SearchHit, dynamicPills, formatTime } from '../types';

interface MomentSearchProps {
  query: string;
  setQuery: (q: string) => void;
  searching: boolean;
  hasSearched: boolean;
  lastQuery: string;
  hasExactMatch: boolean;
  results: SearchHit[];
  token: string | null;
  artifacts: Record<string, unknown> | null;
  onSearch: (overrideQuery?: string) => void;
  onSelectMoment: (assetId: string, time: number) => void;
}

export const MomentSearch: React.FC<MomentSearchProps> = ({
  query,
  setQuery,
  searching,
  hasSearched,
  lastQuery,
  hasExactMatch,
  results,
  token,
  artifacts,
  onSearch,
  onSelectMoment,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder="Describe any moment across all videos in your library..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-24 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-inner"
        />
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
        <button
          onClick={() => onSearch()}
          disabled={searching || !query.trim()}
          className="absolute right-2 top-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg transition disabled:opacity-50 font-medium"
        >
          {searching ? 'Searching...' : 'Find'}
        </button>
      </div>

      {/* Suggestions */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] text-slate-500 self-center mr-1">Suggestions:</span>
        {dynamicPills(artifacts).map((pill) => (
          <button
            key={pill}
            onClick={() => {
              setQuery(pill);
              onSearch(pill);
            }}
            className="text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700 transition"
          >
            {pill}
          </button>
        ))}
      </div>

      {/* Results List */}
      <div className="flex flex-col gap-2.5 max-h-[500px] overflow-y-auto pr-1">
        {results.length === 0 &&
          !searching &&
          (hasSearched ? (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-400 text-sm">
              <p className="font-semibold text-slate-300">
                No matching moments found for &quot;{lastQuery}&quot;
              </p>
              <p className="text-xs text-slate-500 mt-1">
                None of your videos contain direct mentions or strong semantic matches for this topic.
              </p>
            </div>
          ) : (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
              Enter a natural language query above to search across your entire indexed media library.
            </div>
          ))}

        {results.length > 0 && !hasExactMatch && (
          <div className="p-2.5 bg-amber-950/30 border border-amber-800/40 rounded-lg flex items-center justify-between text-xs text-amber-300/90">
            <span>
              No direct mentions of <strong>&quot;{lastQuery}&quot;</strong> found. Showing related
              topics:
            </span>
            <span className="text-[10px] bg-amber-900/60 px-2 py-0.5 rounded text-amber-200 uppercase tracking-wider font-semibold">
              Related Topics
            </span>
          </div>
        )}

        {results.map((hit) => {
          const isRelated = hit.matchQuality === 'related';
          const startFmt = formatTime(hit.startTime);
          const endFmt = formatTime(hit.endTime);

          return (
            <div
              key={hit.segmentId}
              onClick={() => onSelectMoment(hit.assetId, hit.startTime)}
              className={`p-3.5 bg-slate-900/80 hover:bg-slate-900 border ${
                isRelated
                  ? 'border-amber-900/40 hover:border-amber-600/50'
                  : 'border-slate-800/80 hover:border-indigo-500/60'
              } rounded-xl transition cursor-pointer flex flex-col sm:flex-row gap-3.5 group shadow-sm`}
            >
              {/* Thumbnail with duration badge and play hover */}
              <div className="relative w-full sm:w-28 h-20 bg-black rounded-lg overflow-hidden shrink-0 border border-slate-800 flex items-center justify-center">
                {hit.thumbnailUrl ? (
                  <img
                    src={`${hit.thumbnailUrl}?token=${encodeURIComponent(token || '')}`}
                    alt="moment"
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : null}
                <div className="absolute inset-0 -z-10 flex items-center justify-center text-slate-700">
                  <Film className="w-6 h-6" />
                </div>
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <Play className="w-6 h-6 text-white fill-white" />
                </div>
                <span className="absolute bottom-1 right-1 bg-black/85 text-[10px] px-1.5 py-0.5 rounded text-slate-200 font-mono">
                  {startFmt}
                </span>
              </div>

              {/* Content Section */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                {/* Header: File name & Quality Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-xs font-bold text-white tracking-tight truncate">
                        {hit.filename || hit.assetId}
                      </span>
                    </div>
                    {hit.title && hit.title !== hit.filename && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5 ml-5">{hit.title}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {hit.subTopic && (
                      <span
                        className="text-[9px] font-semibold text-cyan-300 bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-800/50 max-w-[140px] truncate"
                        title={hit.subTopic}
                      >
                        {hit.subTopic}
                      </span>
                    )}
                    {isRelated ? (
                      <span className="text-[9px] uppercase font-semibold text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-800/50">
                        Related
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase font-semibold text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800/50">
                        Direct
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                      {hit.score}
                    </span>
                  </div>
                </div>

                {/* Relevant Section timestamp */}
                <div className="flex items-center gap-2 text-xs mt-2 font-mono">
                  <span className="text-slate-400 font-sans text-[11px] font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    Relevant section:
                  </span>
                  <span className="font-semibold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-900/50 text-[11px]">
                    {startFmt} – {endFmt}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ({(hit.endTime - hit.startTime).toFixed(0)}s)
                  </span>
                </div>

                {/* Why Picked & Relation to Query */}
                <div className="mt-2.5 bg-slate-950/80 border border-slate-800/90 rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-indigo-400 shrink-0 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Why picked:</span>
                    </div>
                    <span className="text-xs text-slate-300 font-medium leading-relaxed">
                      {hit.whyPicked || (isRelated ? 'Semantic topic match' : 'Direct modality match')}
                    </span>
                  </div>

                  <div className="flex items-start gap-2 pt-2 border-t border-slate-800/60">
                    <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-emerald-400 shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Relation:</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {hit.queryRelation ||
                        hit.matchReason ||
                        hit.description ||
                        `Relevant moment for "${lastQuery}".`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
