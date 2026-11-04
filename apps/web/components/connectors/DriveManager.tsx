"use client";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { useEffect,useState } from 'react';
import { FactoryLoading as LoaderCircle,FactoryReload } from './FactoryIcons';
import { GoogleDriveIcon } from './GoogleDriveIcon';
import { ConnectorDialog } from './ConnectorDialog';
import { Search01Icon } from '@/components/animate-ui/icons/hugeicons/search-01';
import { ArrowRight01Icon } from '@/components/animate-ui/icons/hugeicons/arrow-right-01';
import { Delete02Icon } from '@/components/animate-ui/icons/hugeicons/delete-02';
import { factoryFetch,type DriveAccount,useFactory } from '@/lib/factory-context';
type Folder={id:string;name:string};
export function DriveManager({account,onDirtyChange,onCancel}:{account:DriveAccount;onDirtyChange?:(dirty:boolean)=>void;onCancel?:()=>void}){
  const {refresh}=useFactory();
  const [saved,setSaved]=useState(account.selectedFolders);
  const [trail,setTrail]=useState<Folder[]>([{id:'root',name:'My Drive'}]),[folders,setFolders]=useState<Folder[]>([]),[selected,setSelected]=useState<Folder[]>(account.selectedFolders),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
  const parent=trail.at(-1)!.id;
  const [filter,setFilter]=useState(''),[folderError,setFolderError]=useState(''),[retry,setRetry]=useState(0),[disconnect,setDisconnect]=useState(false),[activeAction,setActiveAction]=useState(''),[failed,setFailed]=useState(false);
  const dirty=selected.map(f=>f.id).sort().join('|')!==saved.map(f=>f.id).sort().join('|');
  function select(next:Folder[]){setSelected(next);onDirtyChange?.(next.map(f=>f.id).sort().join('|')!==saved.map(f=>f.id).sort().join('|'));}
  function browse(next:Folder[]){setLoading(true);setFilter('');setFolderError('');setTrail(next);}
  useEffect(()=>{let active=true;void factoryFetch<{folders:Folder[]}>(`connectors/${account.id}/folders?parent=${encodeURIComponent(parent)}`).then(result=>{if(active){setFolders(result.folders);setFolderError('');}}).catch(error=>{if(active)setFolderError(error.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[account.id,parent,retry]);
  async function action(kind:'save'|'sync'|'disconnect'){
    setBusy(true);setActiveAction(kind);setMessage('');setFailed(false);try{
      if(kind==='save'){
        const result=await factoryFetch<{syncStatus?:string;discovered?:number;queued?:number;error?:string}>(`connectors/${account.id}/folders`,'POST',{folders:selected,sync:true});
        setSaved(selected);onDirtyChange?.(false);setFailed(result.syncStatus==='failed');
        setMessage(result.syncStatus==='complete'?`Folders saved. Found ${result.discovered} files; ${result.queued} queued.`:result.syncStatus==='failed'?'Folders saved, but sync could not finish. Choose Sync to retry.':result.syncStatus==='paused'?'Folders saved. Sync is currently paused for this workspace.':'Folder selection saved.');
      }
      if(kind==='sync'){const result=await factoryFetch<{queued:number;discovered:number}>(`connectors/${account.id}/sync`,'POST');setMessage(`Found ${result.discovered} files; ${result.queued} queued.`);}
      if(kind==='disconnect')await factoryFetch(`connectors/${account.id}`,'DELETE');
      await refresh();
    }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:'Unable to update this source.');}finally{setBusy(false);setActiveAction('');setDisconnect(false);}
  }
  const visible=folders.filter(folder=>folder.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet disabled:cursor-not-allowed disabled:opacity-50';
  return <><section className="mt-6 space-y-6" aria-label={`Manage ${account.email}`}>
    <div className="flex items-start gap-3 rounded-2xl border border-brand-line bg-brand-canvas/50 p-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-brand-line bg-brand-surface"><GoogleDriveIcon className="size-7"/></span>
      <div className="min-w-0 flex-1"><p className="break-all text-base font-semibold leading-relaxed">{account.email}</p><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand-muted"><span className={account.status==='connected'?'font-medium text-emerald-700':'font-medium text-amber-700'}>{account.status==='connected'?'Connected':'Needs attention'}</span><span>{account.files} {account.files===1?'file':'files'} tracked</span></div><p className="mt-1 text-sm text-brand-muted">{account.lastSyncedAt?`Last synced ${new Date(account.lastSyncedAt).toLocaleString()}`:'No sync yet'}</p></div>
    </div>

    <p className="text-sm leading-relaxed text-brand-muted" role="status">{account.processing?`${account.processing} processing. `:''}{account.queued?`${account.queued} queued. `:''}{account.failed?`${account.failed} file(s) need indexing attention. `:''}{account.syncEnabled===false?'Sync is paused for this source. Folder changes can still be saved.':'Sync queues files for processing; they become searchable when indexing completes.'}</p>
    <section aria-label="Folders to include">
      <div className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold">Folders to include</h3><span className="shrink-0 rounded-full bg-brand-violet/10 px-3 py-1 text-sm font-medium text-brand-violet">{selected.length} selected</span></div>
      <p className="mt-1.5 text-sm leading-relaxed text-brand-muted">Select folders to include. Browse to choose individual subfolders.</p>
      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-line">
        <nav aria-label="Drive folder path" className="flex flex-wrap items-center gap-1 border-b border-brand-line bg-brand-canvas/60 px-3 py-2">{trail.map((folder,index)=><span key={folder.id} className="inline-flex min-w-0 items-center gap-1">{index>0&&<ArrowRight01Icon size={14} className="shrink-0 text-brand-muted"/>}<button type="button" disabled={busy||index===trail.length-1} aria-current={index===trail.length-1?'location':undefined} onClick={()=>browse(trail.slice(0,index+1))} className="min-h-10 max-w-[220px] truncate rounded-lg px-2 text-sm font-medium text-brand-violet hover:bg-brand-violet/5 disabled:text-brand-ink">{folder.name}</button></span>)}</nav>
        <label className="m-3 flex min-h-11 items-center gap-2 rounded-xl border border-brand-line px-3 text-brand-muted"><Search01Icon size={18}/><input type="search" value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Find a folder in this location" aria-label="Filter Drive folders" className="min-w-0 flex-1 bg-transparent text-base text-brand-ink outline-none placeholder:text-brand-muted md:text-sm"/></label>
        {loading?<div role="status" className="flex min-h-32 items-center justify-center gap-2 text-sm text-brand-muted"><LoaderCircle size={20} animate loop/>Loading folders…</div>:folderError?<div role="alert" className="px-4 pb-4 text-sm"><p className="leading-relaxed text-red-700">{folderError}</p><button type="button" onClick={()=>{setLoading(true);setRetry(value=>value+1);}} className="mt-3 font-semibold text-brand-violet">Retry folders</button></div>:<ul className="thin-scrollbar max-h-[min(32dvh,18rem)] overflow-y-auto overscroll-contain px-2 pb-2">{visible.map(folder=><li key={folder.id} className="flex items-center gap-2 rounded-xl hover:bg-brand-canvas"><label className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 pl-3"><input type="checkbox" disabled={busy} checked={selected.some(f=>f.id===folder.id)} onChange={event=>select(event.target.checked?[...selected.filter(f=>f.id!==folder.id),folder]:selected.filter(f=>f.id!==folder.id))} className="size-5 shrink-0 accent-brand-violet"/><span className="min-w-0 break-words text-base font-medium leading-snug">{folder.name}</span></label><AnimateIcon animateOnHover asChild><button type="button" disabled={busy} onClick={()=>browse([...trail,folder])} aria-label={`Browse ${folder.name}`} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium text-brand-violet hover:bg-brand-violet/5">Browse<ArrowRight01Icon size={16}/></button></AnimateIcon></li>)}{!visible.length&&<li className="px-3 py-6 text-center text-sm text-brand-muted">{filter?'No folders match your search.':'No subfolders in this location.'}</li>}</ul>}
      </div>
    </section>

    {selected.length>0&&<section aria-label="Selected folders"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Your selection</h3><button type="button" disabled={busy} onClick={()=>select([])} className="min-h-10 px-2 text-sm font-medium text-brand-violet">Clear selection</button></div><ul className="mt-1 flex max-h-32 flex-wrap gap-2 overflow-y-auto">{selected.map(folder=><li key={folder.id} className="inline-flex max-w-full items-center gap-1 rounded-xl border border-brand-violet/20 bg-brand-violet/5 py-1 pl-3 text-sm text-brand-ink"><span className="truncate">{folder.name}</span><AnimateIcon animateOnHover asChild><button type="button" disabled={busy} onClick={()=>select(selected.filter(f=>f.id!==folder.id))} aria-label={`Remove ${folder.name} from selection`} className="grid size-8 shrink-0 place-items-center rounded-lg text-brand-muted hover:bg-brand-violet/10"><Delete02Icon size={15}/></button></AnimateIcon></li>)}</ul></section>}

    <div className="flex flex-col gap-3 rounded-2xl border border-brand-line p-4 md:flex-row md:items-center md:justify-between"><div><h3 className="text-sm font-semibold">Sync saved folders</h3><p className="mt-1 text-sm leading-relaxed text-brand-muted">{dirty?'Save your selection before starting a sync.':selected.length?'Import media from your saved folder selection.':'Choose and save at least one folder to sync.'}</p></div><AnimateIcon animateOnHover asChild><button disabled={busy||dirty||!saved.length} onClick={()=>void action('sync')} className={`${button} shrink-0 border border-brand-line bg-brand-surface hover:border-brand-violet/40`}>{activeAction==='sync'?<LoaderCircle size={17} animate loop/>:<FactoryReload size={17}/>}Sync selected folders</button></AnimateIcon></div>

    <div className="flex flex-col gap-3 border-t border-brand-line pt-5 md:flex-row md:items-center md:justify-between"><div><h3 className="text-sm font-semibold">Disconnect this account</h3><p className="mt-1 text-sm leading-relaxed text-brand-muted">Stop future syncing. Saved moments stay in Brisky.</p></div><button disabled={busy} onClick={()=>setDisconnect(true)} className={`${button} shrink-0 border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100`}>Disconnect</button></div>
    {message&&<p role={failed?'alert':'status'} className={`rounded-xl border p-3 text-sm leading-relaxed ${failed?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message}</p>}
  </section>

  <footer className="sticky -bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-10 -mx-5 -mb-[max(1.5rem,env(safe-area-inset-bottom))] mt-6 flex items-center justify-between gap-3 border-t border-brand-line bg-brand-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 md:-bottom-8 md:-mx-8 md:-mb-8 md:px-8 md:pb-8"><span className="hidden text-sm text-brand-muted md:block">{dirty?'Unsaved folder changes':'All changes saved'}</span><div className="flex w-full gap-3 md:w-auto"><button type="button" disabled={busy} onClick={onCancel} className={`${button} flex-1 border border-brand-line md:flex-none`}>Cancel</button><button type="button" disabled={busy||!dirty} onClick={()=>void action('save')} className={`${button} flex-1 bg-brand-action text-white hover:bg-brand-action-hover md:flex-none`}>{activeAction==='save'&&<LoaderCircle size={17} animate loop/>}{activeAction==='save'?'Saving & syncing…':'Save & sync'}</button></div></footer>

  <ConnectorDialog open={disconnect} onDismiss={()=>{if(!busy)setDisconnect(false);}} title="Disconnect Google Drive?" alert><h2 className="text-xl font-semibold">Disconnect Google Drive?</h2><p className="mt-3 text-base leading-relaxed text-brand-muted">Brisky will stop syncing this account. Your original Drive files and saved moments will remain.{dirty?' Unsaved folder changes will be discarded.':''}</p><div className="mt-6 flex flex-col-reverse gap-3 md:flex-row md:justify-end"><button type="button" disabled={busy} onClick={()=>setDisconnect(false)} className={`${button} border border-brand-line`}>Keep connected</button><button type="button" disabled={busy} onClick={()=>void action('disconnect')} className={`${button} bg-red-600 text-white hover:bg-red-700`}>{activeAction==='disconnect'&&<LoaderCircle size={17} animate loop/>}Disconnect</button></div></ConnectorDialog>
  </>;
}
