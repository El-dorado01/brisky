import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Folder,
  RefreshCw,
  RotateCw,
  Trash2,
  AlertTriangle,
  X,
  Zap,
} from 'lucide-react';
import { ConnectorAccount, ConnectorFolder, SyncResult } from '../types';

export const GoogleDriveIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M29.5 21l-3.1708 5.5489A3.07 3.07 0 0 1 23.6459 28H8.3541a3.07 3.07 0 0 1-2.6833-1.4511L4.3687 24.27 9.7578 21Z" fill="#4285F4"/>
    <path d="M12.3822 4.13a3.2262 3.2262 0 0 0-1.7067 1.4276L2.9591 18.76a3.07 3.07 0 0 0-.1012 3.0489l1.53 2.4658L9.7579 21 16 10.32Z" fill="#00AC47"/>
    <path d="M19.6068 4.13a3.2256 3.2256 0 0 1 1.7066 1.4276L29.03 18.76a3.07 3.07 0 0 1 .1013 3.0489l-1.5295 2.4658L22.2311 21 15.9889 10.32Z" fill="#FFBA00"/>
  </svg>
);

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
              <Cloud className="w-5 h-5" />
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
            <X className="w-5 h-5" />
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
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 text-zinc-900 text-xs font-semibold transition shadow-sm space-x-2 active:scale-95"
              >
                <GoogleDriveIcon className="w-4 h-4" />
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
                  <Cloud className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-zinc-300">No storage sources connected</h4>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Connect your Google Drive account to discover and index video footage straight from your cloud drives.
                </p>
                <button
                  onClick={handleConnectGoogleDrive}
                  className="inline-flex items-center px-4 py-2 bg-white hover:bg-zinc-100 text-zinc-900 rounded-lg text-xs font-semibold transition shadow-sm space-x-2 active:scale-95"
                >
                  <GoogleDriveIcon className="w-4 h-4" />
                  <span>Connect Google Drive Now</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-zinc-700 transition space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 shadow-sm p-2 mt-0.5">
                          <GoogleDriveIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="text-sm font-medium text-white">{acc.email}</span>
                            {acc.status === 'error' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                                Action Required
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
                              <span className={`w-1.5 h-1.5 rounded-full ${acc.status === 'error' ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>
                              Last synced: {new Date(acc.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, {new Date(acc.lastSyncedAt).toLocaleDateString()}
                              {pollingEnabled && (
                                <>
                                  <span className="text-zinc-600">•</span>
                                  <span className={acc.status === 'error' ? 'text-rose-400 font-medium' : 'text-zinc-500'}>
                                    {acc.status === 'error' ? 'Sync paused (reconnection required)' : 'Living poller running'}
                                  </span>
                                </>
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {acc.status === 'error' ? (
                          <button
                            onClick={handleConnectGoogleDrive}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm active:scale-95"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Reconnect</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSyncChanges(acc.id)}
                            disabled={syncingId === acc.id || acc.selectedFolders.length === 0}
                            title={acc.selectedFolders.length === 0 ? 'Select at least one folder before syncing' : 'Quickly sync incremental changes'}
                            className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition flex items-center space-x-1.5 disabled:opacity-40"
                          >
                            {syncingId === acc.id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                                <span>Scanning...</span>
                              </>
                            ) : (
                              <>
                                <Zap className="w-3.5 h-3.5 text-blue-400" />
                                <span>Sync Changes</span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => handleSyncAccount(acc.id)}
                          disabled={syncingId === acc.id || acc.selectedFolders.length === 0 || acc.status === 'error'}
                          title={acc.status === 'error' ? 'Reconnect account first to sync' : acc.selectedFolders.length === 0 ? 'Select at least one folder before syncing' : 'Full sync of selected folders'}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition flex items-center space-x-1.5 disabled:opacity-40"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Full Sync</span>
                        </button>

                        <button
                          onClick={() => handleOpenFolders(acc)}
                          disabled={acc.status === 'error'}
                          title={acc.status === 'error' ? 'Reconnect account first' : 'Select Folders'}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition disabled:opacity-40 flex items-center gap-1.5"
                        >
                          <Folder className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Folders</span>
                        </button>

                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800/80 transition"
                          title="Disconnect Account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Dedicated Actionable Reconnect Banner when error */}
                    {acc.status === 'error' && (
                      <div className="mt-3 p-3.5 rounded-xl bg-gradient-to-r from-rose-950/70 via-rose-900/30 to-zinc-950 border border-rose-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-semibold text-rose-200 text-xs">
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                            <span>Google Drive Authorization Expired</span>
                          </div>
                          <p className="text-[11px] text-rose-300/80 leading-relaxed">
                            {acc.lastError?.includes('invalid_grant')
                              ? 'Your Google OAuth session expired or was revoked. Reconnect your Google Drive account to resume automatic syncing and file monitoring.'
                              : acc.lastError || 'Authentication error occurred. Please re-authorize your Google Drive account.'}
                          </p>
                        </div>
                        <button
                          onClick={handleConnectGoogleDrive}
                          className="shrink-0 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-rose-950/50 transition active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Reconnect Google Drive</span>
                        </button>
                      </div>
                    )}

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
