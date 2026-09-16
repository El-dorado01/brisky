import React, { useState, useEffect } from 'react';
import { ConnectorAccount, ConnectorFolder, SyncResult } from '../types';

interface ConnectorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  token?: string | null;
  onSyncTriggered?: () => void;
}

export const ConnectorsModal: React.FC<ConnectorsModalProps> = ({
  isOpen,
  onClose,
  token,
  onSyncTriggered,
}) => {
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Folder selection state
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [folders, setFolders] = useState<ConnectorFolder[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [savingFolders, setSavingFolders] = useState(false);

  // Sync state
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ accountId: string; result: SyncResult } | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(true);

  const effectiveToken = token || (typeof window !== 'undefined' ? localStorage.getItem('brisky_token') : null);

  // Headers for requests WITHOUT a body (GET, DELETE, empty POSTs)
  const authHeaders: Record<string, string> = {
    ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
  };

  // Headers for requests WITH a JSON body
  const jsonAuthHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
  };

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/v1/connectors', { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
      setPollingEnabled(data.pollingEnabled !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
    } else {
      setActiveAccountId(null);
      setSyncResult(null);
    }
  }, [isOpen]);

  const handleConnectGoogleDrive = async () => {
    try {
      setError(null);
      const res = await fetch('/api/v1/connectors/google-drive/auth-url', {
        headers: authHeaders,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to generate Google Drive authorization link');
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenFolders = async (account: ConnectorAccount) => {
    setActiveAccountId(account.id);
    setSelectedFolderIds(new Set(account.selectedFolders.map((f) => f.id)));
    setLoadingFolders(true);
    try {
      const res = await fetch(`/api/v1/connectors/${account.id}/folders`, {
        headers: authHeaders,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to load Google Drive folders');
      }
      const data = await res.json();
      setFolders(data.folders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingFolders(false);
    }
  };

  const toggleFolder = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleSaveFolders = async () => {
    if (!activeAccountId) return;
    setSavingFolders(true);
    try {
      const chosenFolders = folders
        .filter((f) => selectedFolderIds.has(f.id))
        .map((f) => ({ id: f.id, name: f.name }));

      const res = await fetch(`/api/v1/connectors/${activeAccountId}/select-folders`, {
        method: 'POST',
        headers: jsonAuthHeaders,
        body: JSON.stringify({ folders: chosenFolders }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to save selected folders');
      }

      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === activeAccountId
            ? { ...acc, selectedFolders: chosenFolders }
            : acc,
        ),
      );
      setActiveAccountId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingFolders(false);
    }
  };

  const handleSyncAccount = async (accountId: string) => {
    setSyncingId(accountId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/connectors/${accountId}/sync`, {
        method: 'POST',
        headers: jsonAuthHeaders,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Sync failed');
      }
      const data = await res.json();
      setSyncResult({ accountId, result: data });
      await fetchAccounts();
      if (onSyncTriggered) onSyncTriggered();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncChanges = async (accountId: string) => {
    setSyncingId(accountId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/connectors/${accountId}/sync-changes`, {
        method: 'POST',
        headers: jsonAuthHeaders,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Incremental sync failed');
      }
      const data = await res.json();
      setSyncResult({
        accountId,
        result: {
          discovered: (data.addedCount || 0) + (data.modifiedCount || 0) + (data.renamedCount || 0),
          queued: (data.addedCount || 0) + (data.modifiedCount || 0),
          existing: data.renamedCount || 0,
          archived: data.deletedCount || 0,
        },
      });
      await fetchAccounts();
      if (onSyncTriggered) onSyncTriggered();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!window.confirm('Disconnect this Google Drive account? Indexed intelligence will remain.')) return;
    try {
      const res = await fetch(`/api/v1/connectors/${accountId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to disconnect account');
      }
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      if (activeAccountId === accountId) setActiveAccountId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 bg-zinc-950/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Connected Media Sources</h2>
              <p className="text-xs text-zinc-400">
                Index videos continuously without uploading raw camera masters
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Thesis Reminder Banner */}
          <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-800/30 flex items-start space-x-3 text-xs text-blue-200/90">
            <span className="text-base">🏛️</span>
            <div>
              <strong className="text-blue-300">We keep the intelligence, not the tape.</strong>
              <p className="mt-0.5 text-blue-200/70">
                Your media stays in your own storage. Our workers pull bytes ephemerally to generate
                720p web preview proxies and vector memory, then immediately purge the raw master files.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-xl text-red-300 text-xs flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
                Dismiss
              </button>
            </div>
          )}

          {/* Sync Result Banner */}
          {syncResult && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-emerald-300 text-xs">
              <strong>Sync Complete:</strong> Discovered {syncResult.result.discovered} file(s),{' '}
              {syncResult.result.queued} queued for indexing, {syncResult.result.existing} up to date,{' '}
              {syncResult.result.archived} archived.
            </div>
          )}

          {/* Accounts Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider text-[11px]">
                Cloud Accounts
              </h3>
              <button
                onClick={handleConnectGoogleDrive}
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-sm hover:shadow-blue-500/20 space-x-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" />
                </svg>
                <span>Connect Google Drive</span>
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-zinc-500 text-sm animate-pulse">
                Loading connected sources...
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/20 p-6 space-y-3">
                <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-zinc-300">No storage sources connected</h4>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Connect your Google Drive account to discover and index video footage straight from your cloud drives.
                </p>
                <button
                  onClick={handleConnectGoogleDrive}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition"
                >
                  Connect Google Drive Now
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-zinc-700 transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.74 3.535L12 11.235l4.26-7.7H7.74zM1.94 13.935l4.26-7.7 4.26 7.7H1.94zm8.52 0l4.26-7.7 4.26 7.7H10.46z" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-white">{acc.email}</span>
                            {acc.status === 'error' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                Token Revoked / Error
                              </span>
                            ) : (
                              <>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Connected
                                </span>
                                {pollingEnabled && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                                    Live Sync Active
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {acc.selectedFolders.length === 0
                              ? '⚠️ No folders selected. Pick at least one folder before syncing.'
                              : `Monitoring ${acc.selectedFolders.length} folder(s): ${acc.selectedFolders.map((f) => f.name).join(', ')}`}
                          </p>
                          {acc.lastSyncedAt && (
                            <p className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                              Last synced: {new Date(acc.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, {new Date(acc.lastSyncedAt).toLocaleDateString()}
                              {pollingEnabled && (
                                <>
                                  <span className="text-zinc-600">•</span>
                                  <span className="text-zinc-500">Living poller running</span>
                                </>
                              )}
                            </p>
                          )}
                          {acc.lastError && (
                            <div className="mt-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/40 text-[11px] text-rose-300 space-y-1">
                              <div className="flex items-center gap-1.5 font-semibold text-rose-200">
                                <span>⚠️</span>
                                <span>Authentication Issue</span>
                              </div>
                              <p className="text-rose-300/80">{acc.lastError}</p>
                              {acc.lastError.includes('invalid_grant') && (
                                <p className="text-rose-300 font-medium pt-0.5">
                                  Google Drive authorization expired or was revoked. Click "Connect Google Drive" above to re-authorize.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleSyncChanges(acc.id)}
                          disabled={syncingId === acc.id || acc.selectedFolders.length === 0}
                          title={acc.selectedFolders.length === 0 ? 'Select at least one folder before syncing' : 'Quickly sync incremental changes'}
                          className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition flex items-center space-x-1.5 disabled:opacity-40"
                        >
                          {syncingId === acc.id ? (
                            <>
                              <svg className="w-3.5 h-3.5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              <span>Scanning...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              <span>Sync Changes</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleSyncAccount(acc.id)}
                          disabled={syncingId === acc.id || acc.selectedFolders.length === 0}
                          title={acc.selectedFolders.length === 0 ? 'Select at least one folder before syncing' : 'Full sync of selected folders'}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition flex items-center space-x-1.5 disabled:opacity-40"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Full Sync</span>
                        </button>

                        <button
                          onClick={() => handleOpenFolders(acc)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition"
                        >
                          Folders
                        </button>

                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800/80 transition"
                          title="Disconnect Account"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Active Folder Selector for this account */}
                    {activeAccountId === acc.id && (
                      <div className="pt-3 border-t border-zinc-800/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-300">
                            Select Google Drive Folders to Monitor:
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {selectedFolderIds.size === 0
                              ? 'All folders selected'
                              : `${selectedFolderIds.size} folder(s) selected`}
                          </span>
                        </div>

                        {loadingFolders ? (
                          <div className="text-xs text-zinc-500 py-4 text-center">
                            Loading Drive folder tree...
                          </div>
                        ) : folders.length === 0 ? (
                          <div className="text-xs text-zinc-500 py-2">
                            No subfolders found. The system will scan your root Google Drive for video files.
                          </div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
                            {folders.map((folder) => (
                              <label
                                key={folder.id}
                                className="flex items-center space-x-2.5 p-2 rounded-lg bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/60 cursor-pointer text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedFolderIds.has(folder.id)}
                                  onChange={() => toggleFolder(folder.id)}
                                  className="w-4 h-4 rounded border-zinc-700 text-blue-600 focus:ring-blue-500/20 bg-zinc-800"
                                />
                                <span className="text-zinc-300 flex-1">{folder.name}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-end space-x-2 pt-2">
                          <button
                            onClick={() => setActiveAccountId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveFolders}
                            disabled={savingFolders}
                            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50"
                          >
                            {savingFolders ? 'Saving...' : 'Save Folder Preferences'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/40 flex items-center justify-between text-xs text-zinc-500">
          <span>Phase 4 Cloud Connector: Google Drive</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
