import React from 'react';
import { Film, Lock, LogOut, ShieldCheck, Upload, User, Cloud } from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  user: UserProfile | null;
  token: string | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenConnectors: () => void;
  onTriggerUpload: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  token,
  onOpenAuth,
  onLogout,
  onOpenConnectors,
  onTriggerUpload,
  fileInputRef,
  onFileUpload,
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600/20 text-indigo-400 p-2 rounded-xl border border-indigo-500/30">
          <Film className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-tight text-white">Brisky</span>
            <span className="text-[10px] uppercase font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
              Phase 4: Cloud Connectors
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Storage belongs to user · Intelligence belongs to us · Universal MediaConnector
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-1.5 text-xs text-slate-200 shadow-sm">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-medium max-w-[140px] truncate" title={user.email}>
              {user.name || user.email}
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <button
              onClick={onLogout}
              className="ml-1 text-slate-400 hover:text-rose-400 transition"
              title="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold shadow transition"
          >
            <Lock className="w-3.5 h-3.5" />
            Log In
          </button>
        )}

        <button
          onClick={() => {
            if (!token) {
              onOpenAuth();
              return;
            }
            onOpenConnectors();
          }}
          className="flex items-center gap-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg shadow-sm transition"
          title="Connect Google Drive, Dropbox, or other cloud storage"
        >
          <Cloud className="w-4 h-4" />
          Connect Media
        </button>

        {import.meta.env.VITE_ENABLE_DEV_UPLOAD === 'true' && (
          <>
            <button
              onClick={() => {
                if (!token) {
                  onOpenAuth();
                  return;
                }
                onTriggerUpload();
              }}
              className="flex items-center gap-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg border border-slate-700 transition"
              title="Manual direct upload (Dev diagnostic scaffold)"
            >
              <Upload className="w-3.5 h-3.5 text-slate-400" />
              Upload (Scaffold)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={onFileUpload}
            />
          </>
        )}
      </div>
    </header>
  );
};
