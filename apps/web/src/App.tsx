import { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, FileCode, Search, Sparkles } from 'lucide-react';
import {
  ActiveTab,
  AssetSummary,
  BenchmarkItem,
  IndexingJobItem,
  IndexingStats,
  LibraryBenchmarkSummary,
  SearchHit,
  SearchMeta,
  UnitEconomicsSummary,
  UserProfile,
} from './types';
import { usePoller } from './hooks/usePoller';
import { Header } from './components/Header';
import { PipelineStatusBar } from './components/PipelineStatusBar';
import { VideoPlayer } from './components/VideoPlayer';
import { MediaLibrary } from './components/MediaLibrary';
import { MomentSearch } from './components/MomentSearch';
import { BenchmarkTab } from './components/BenchmarkTab';
import { ArtifactsTab } from './components/ArtifactsTab';
import { ObservabilityTab } from './components/ObservabilityTab';
import { AuthModal } from './components/AuthModal';
import { LineageModal } from './components/LineageModal';

export default function App() {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [stats, setStats] = useState<IndexingStats>({
    discovered: 0,
    indexed: 0,
    processing: 0,
    queued: 0,
    failed: 0,
    remaining: 0,
  });
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [lastQuery, setLastQuery] = useState<string>('');
  const [hasExactMatch, setHasExactMatch] = useState<boolean>(true);
  const [searchMeta, setSearchMeta] = useState<SearchMeta | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkItem[]>([]);
  const [runningBenchmark, setRunningBenchmark] = useState<boolean>(false);
  const [librarySummary, setLibrarySummary] = useState<LibraryBenchmarkSummary | null>(null);
  const [runningLibraryBenchmark, setRunningLibraryBenchmark] = useState<boolean>(false);
  const [unitEconomics, setUnitEconomics] = useState<UnitEconomicsSummary | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');
  const [jobs, setJobs] = useState<IndexingJobItem[]>([]);
  const [artifacts, setArtifacts] = useState<Record<string, unknown> | null>(null);
  const [indexingLabel, setIndexingLabel] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [lineageModalAssetId, setLineageModalAssetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Authentication State
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('media_intel_token'));
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('media_intel_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [showAuthModal, setShowAuthModal] = useState<boolean>(!localStorage.getItem('media_intel_token'));

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const headers = new Headers(init.headers || {});
      const currentToken = token || localStorage.getItem('media_intel_token');
      if (currentToken) {
        headers.set('Authorization', `Bearer ${currentToken}`);
      }
      const res = await fetch(input, { ...init, headers });
      if (res.status === 401) {
        setToken(null);
        setUser(null);
        localStorage.removeItem('media_intel_token');
        localStorage.removeItem('media_intel_user');
        setShowAuthModal(true);
      }
      return res;
    },
    [token],
  );

  const fetchAssets = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/media');
      if (res.ok) {
        const data = await res.json();
        const next: AssetSummary[] = data.assets || [];
        setAssets(next);
        setSelectedAssetId((current) => {
          if (current && next.some((a) => a.assetId === current)) return current;
          return next[0]?.assetId || '';
        });
      }
    } catch (err) {
      console.error('Failed to load assets', err);
    }
  }, [authFetch]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/indexing/stats');
      if (res.ok) {
        const data: IndexingStats = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load indexing stats', err);
    }
  }, [authFetch]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/indexing/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to load indexing jobs', err);
    }
  }, [authFetch]);

  const fetchEconomics = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/media/economics');
      if (res.ok) {
        const data: UnitEconomicsSummary = await res.json();
        setUnitEconomics(data);
      }
    } catch (err) {
      console.error('Failed to load unit economics', err);
    }
  }, [authFetch]);

  // Initial user fetch & refresh
  useEffect(() => {
    if (!token) {
      setShowAuthModal(true);
      return;
    }
    authFetch('/api/v1/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          localStorage.setItem('media_intel_user', JSON.stringify(data.user));
        }
      })
      .catch(() => undefined);

    fetchAssets();
    fetchStats();
    fetchJobs();
    fetchEconomics();
  }, [token, authFetch, fetchAssets, fetchStats, fetchJobs, fetchEconomics]);

  const selected = assets.find((a) => a.assetId === selectedAssetId);
  const isBusy = assets.some((a) => a.status === 'queued' || a.status === 'processing');

  // Adaptive, visibility-aware polling
  usePoller({
    enabled: Boolean(token),
    isBusy,
    activeTab,
    fetchAssets,
    fetchStats,
    fetchJobs,
  });

  // Fetch artifacts when active asset changes
  useEffect(() => {
    if (!selectedAssetId || !token) return;
    if (selected?.status && selected.status !== 'indexed') {
      setArtifacts(null);
      return;
    }
    authFetch(`/api/v1/media/${selectedAssetId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setArtifacts(data))
      .catch((err) => console.error(err));
  }, [selectedAssetId, selected?.status, token, authFetch]);

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, time);
      videoRef.current.play().catch(() => undefined);
    }
  };

  const handleSelectMoment = (assetId: string, time: number) => {
    if (assetId !== selectedAssetId) {
      pendingSeekTimeRef.current = Math.max(0, time);
      setSelectedAssetId(assetId);
    } else {
      handleSeek(time);
    }
  };

  const handleSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    setSearching(true);
    setHasSearched(true);
    setLastQuery(q);
    try {
      const res = await authFetch('/api/v1/media/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setHasExactMatch(data.hasExactMatch ?? true);
        setSearchMeta({
          hasExactMatch: data.hasExactMatch ?? true,
          queryIntent: data.queryIntent,
          primaryModifier: data.primaryModifier,
          missingTerms: data.missingTerms,
          explanation: data.explanation,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleRetry = async (assetId: string) => {
    setRetryingId(assetId);
    try {
      const res = await authFetch(`/api/v1/indexing/jobs/${assetId}/retry`, { method: 'POST' });
      if (res.ok) {
        await fetchAssets();
        await fetchStats();
        await fetchJobs();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRetryingId(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const ALLOWED_EXTS = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.ogv', '.mpg', '.mpeg', '.ts'];
    const validFiles: File[] = [];
    const invalidNames: string[] = [];

    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const isVideo = file.type.startsWith('video/') || ALLOWED_EXTS.includes(ext);
      if (isVideo && file.size > 0) {
        validFiles.push(file);
      } else {
        invalidNames.push(file.name);
      }
    }

    if (invalidNames.length > 0) {
      alert(`Skipped ${invalidNames.length} non-video/empty file(s):\n${invalidNames.join('\n')}`);
    }
    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    let successCount = 0;
    const failedUploads: Array<{ filename: string; reason: string }> = [];

    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setIndexingLabel(`Uploading (${i + 1}/${validFiles.length}): ${file.name}...`);
        const formData = new FormData();
        formData.append('files', file);

        try {
          const res = await authFetch('/api/v1/media/upload', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();
          if (!res.ok) {
            failedUploads.push({ filename: file.name, reason: data.message || 'Upload failed' });
          } else {
            successCount++;
            if (data.rejected && data.rejected.length > 0) {
              data.rejected.forEach((r: { filename: string; reason: string }) => failedUploads.push(r));
            }
          }
        } catch (fileErr: unknown) {
          const msg = fileErr instanceof Error ? fileErr.message : String(fileErr);
          failedUploads.push({ filename: file.name, reason: msg });
        }
        fetchAssets();
        fetchStats();
        fetchJobs();
      }

      if (failedUploads.length > 0) {
        const rejMsg = failedUploads.map((r) => `• ${r.filename}: ${r.reason}`).join('\n');
        alert(`Completed: ${successCount} queued.\n\n${failedUploads.length} file(s) failed:\n${rejMsg}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Batch upload error: ${msg}`);
    } finally {
      setIndexingLabel(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchAssets();
      await fetchStats();
      await fetchJobs();
    }
  };

  const handleRunBenchmark = async () => {
    if (!selectedAssetId) return;
    setRunningBenchmark(true);
    try {
      const res = await authFetch(`/api/v1/media/benchmark/run/${selectedAssetId}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBenchmarks(data.results || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRunningBenchmark(false);
    }
  };

  const handleRunLibraryBenchmark = async () => {
    setRunningLibraryBenchmark(true);
    try {
      const res = await authFetch('/api/v1/media/benchmark/library', { method: 'POST' });
      if (res.ok) {
        const data: LibraryBenchmarkSummary = await res.json();
        setLibrarySummary(data);
      }
    } catch (err) {
      console.error('Failed to run library benchmark', err);
    } finally {
      setRunningLibraryBenchmark(false);
    }
  };

  const handleFeedback = async (
    assetId: string,
    segmentId: string,
    timestampSec: number,
    feedback: 'positive' | 'negative',
  ) => {
    try {
      await authFetch('/api/v1/media/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: lastQuery || query,
          assetId,
          segmentId,
          timestampSec,
          feedback,
        }),
      });
      fetchEconomics();
    } catch (err) {
      console.error('Failed to submit search feedback', err);
    }
  };

  const handleDeleteOriginal = async () => {
    if (!selectedAssetId) return;
    if (!confirm('Simulate "kept the intelligence, not the tape": Delete master upload bytes?')) return;
    try {
      const res = await authFetch(`/api/v1/media/${selectedAssetId}/delete-original`, { method: 'POST' });
      if (res.ok) {
        await fetchAssets();
        alert('Master upload bytes deleted! Web proxy stream and database intelligence remain fully searchable.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('media_intel_token');
    localStorage.removeItem('media_intel_user');
    setAssets([]);
    setJobs([]);
    setSelectedAssetId('');
    setShowAuthModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        user={user}
        token={token}
        onOpenAuth={() => setShowAuthModal(true)}
        onLogout={handleLogout}
        onTriggerUpload={() => fileInputRef.current?.click()}
        fileInputRef={fileInputRef}
        onFileUpload={handleFileUpload}
      />

      <PipelineStatusBar stats={stats} indexingLabel={indexingLabel} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 flex flex-col gap-5">
          <VideoPlayer
            selected={selected}
            token={token}
            videoRef={videoRef}
            currentTime={currentTime}
            duration={duration}
            setCurrentTime={setCurrentTime}
            setDuration={setDuration}
            pendingSeekTimeRef={pendingSeekTimeRef}
            onDeleteOriginal={handleDeleteOriginal}
          />
          <MediaLibrary
            assets={assets}
            selectedAssetId={selectedAssetId}
            token={token}
            retryingId={retryingId}
            onSelectAsset={setSelectedAssetId}
            onRefresh={fetchAssets}
            onRetry={handleRetry}
            onOpenLineage={(id) => setLineageModalAssetId(id)}
          />
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex border-b border-slate-800 text-sm">
            <button
              onClick={() => setActiveTab('search')}
              className={`pb-2.5 px-4 font-medium transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'search'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-4 h-4" />
              Moment Search
            </button>
            <button
              onClick={() => setActiveTab('benchmark')}
              className={`pb-2.5 px-4 font-medium transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'benchmark'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Benchmark Suite
            </button>
            <button
              onClick={() => setActiveTab('artifacts')}
              className={`pb-2.5 px-4 font-medium transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'artifacts'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode className="w-4 h-4" />
              Raw Artifacts
            </button>
            <button
              onClick={() => setActiveTab('observability')}
              className={`pb-2.5 px-4 font-medium transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'observability'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              Observability {jobs.length > 0 && `(${jobs.length})`}
            </button>
          </div>

          {activeTab === 'search' && (
            <MomentSearch
              query={query}
              setQuery={setQuery}
              searching={searching}
              hasSearched={hasSearched}
              lastQuery={lastQuery}
              hasExactMatch={hasExactMatch}
              searchMeta={searchMeta}
              results={results}
              token={token}
              artifacts={artifacts}
              onSearch={handleSearch}
              onSelectMoment={handleSelectMoment}
              onFeedback={handleFeedback}
            />
          )}

          {activeTab === 'benchmark' && (
            <BenchmarkTab
              benchmarks={benchmarks}
              librarySummary={librarySummary}
              runningBenchmark={runningBenchmark}
              runningLibraryBenchmark={runningLibraryBenchmark}
              selectedAssetId={selectedAssetId}
              onRunBenchmark={handleRunBenchmark}
              onRunLibraryBenchmark={handleRunLibraryBenchmark}
            />
          )}

          {activeTab === 'artifacts' && <ArtifactsTab artifacts={artifacts} />}

          {activeTab === 'observability' && (
            <ObservabilityTab
              jobs={jobs}
              economics={unitEconomics}
              retryingId={retryingId}
              onRefresh={() => {
                fetchJobs();
                fetchEconomics();
              }}
              onRetry={handleRetry}
            />
          )}
        </div>
      </main>

      {showAuthModal && (
        <AuthModal
          token={token}
          onClose={() => setShowAuthModal(false)}
          onSuccess={(newToken, newUser) => {
            setToken(newToken);
            setUser(newUser);
            localStorage.setItem('media_intel_token', newToken);
            localStorage.setItem('media_intel_user', JSON.stringify(newUser));
            setShowAuthModal(false);
          }}
        />
      )}

      {lineageModalAssetId && (
        <LineageModal
          assetId={lineageModalAssetId}
          token={token}
          onClose={() => setLineageModalAssetId(null)}
          onSelectAsset={(id) => setSelectedAssetId(id)}
        />
      )}
    </div>
  );
}
