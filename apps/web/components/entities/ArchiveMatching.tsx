"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {AnimateIcon} from '@/components/animate-ui/icons/icon';
import {Search01Icon} from '@/components/animate-ui/icons/hugeicons/search-01';
import {FactoryLoading} from '@/components/connectors/FactoryIcons';
import {peopleApi} from '@/lib/people-api';

type ArchiveStatus={enabled:boolean;workerAvailable:boolean;hasReferences:boolean;assets:{discovered:number;completed:number};states:{state:string;count:number}[];problems:{filename:string;code:string;startS:number}[]};
const reason:Record<string,string>={no_reference:'Teach a clearer face before retrying.',preview_too_large:'The local preview exceeds the 100 MiB scan limit.',preview_or_revision_changed:'Open the source preview, then retry.',local_runtime_unavailable:'Check the local face runtime on your worker.',worker_interrupted:'The worker stopped before this scan finished.'};
export function ArchiveMatching({personId,onRefresh}:{personId:string;onRefresh:()=>void}){
  const [status,setStatus]=useState<ArchiveStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const requestVersion=useRef(0);
  const reload=useCallback(async()=>{const result=await peopleApi<ArchiveStatus>('/'+personId+'/face-archive');setStatus(result);return result;},[personId]);
  useEffect(()=>{let active=true;peopleApi<ArchiveStatus>('/'+personId+'/face-archive').then(s=>{if(active)setStatus(s);}).catch(()=>{if(active)setError('Unable to load library matching.');});return()=>{active=false;};},[personId]);
  useEffect(()=>{if(!status?.enabled)return;let active=true;const timer=setInterval(()=>{if(document.visibilityState!=='visible')return;const version=requestVersion.current;peopleApi<ArchiveStatus>('/'+personId+'/face-archive').then(s=>{if(active&&version===requestVersion.current){setStatus(s);setError('');onRefresh();}}).catch(()=>{if(active&&version===requestVersion.current)setError('Progress is temporarily unavailable.');});},10000);return()=>{active=false;clearInterval(timer);};},[status?.enabled,personId,onRefresh]);
  async function configure(){if(!status)return;requestVersion.current++;setBusy(true);setError('');try{setStatus(await peopleApi<ArchiveStatus>('/'+personId+'/face-archive','PUT',{enabled:!status.enabled}));}catch(e){setError(e instanceof Error?e.message:'Unable to update library matching.');}finally{setBusy(false);}}
  async function retry(){requestVersion.current++;setBusy(true);setError('');try{await peopleApi('/'+personId+'/face-archive-retry','POST',{});await reload();}catch(e){setError(e instanceof Error?e.message:'Unable to retry.');}finally{setBusy(false);}}
  const count=(state:string)=>status?.states.find(row=>row.state===state)?.count??0;
  return <details className="mb-5 rounded-2xl border border-brand-line bg-brand-canvas/40">
    <summary className="cursor-pointer px-4 py-4 text-sm font-semibold">Find them across your library <span className="ml-2 text-xs font-normal text-brand-muted">{status?(status.enabled?'On':'Off'):error?'Unavailable':'Loading'}</span></summary>
    <div className="border-t border-brand-line px-4 pb-4 pt-3"><p className="text-sm leading-relaxed text-brand-muted">Automatically scan existing, new and changed indexed videos while your worker runs. Matches stay suggestions until you review them.</p>
      {!status&&!error&&<p className="mt-3 text-sm text-brand-muted">Loading settings…</p>}
      {status&&<><AnimateIcon animateOnHover asChild><button disabled={busy||(!status.enabled&&!status.hasReferences)} onClick={()=>void configure()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-violet/20 bg-brand-surface px-4 py-2 text-sm font-semibold text-brand-violet transition hover:bg-brand-violet/5 disabled:opacity-50">{busy?<FactoryLoading size={17} className="animate-spin"/>:<Search01Icon size={17}/>} {status.enabled?'Pause library matching':'Enable library matching'}</button></AnimateIcon>
        {!status.hasReferences&&<p className="mt-3 text-sm text-brand-muted">First teach Brisky this person in a source moment.</p>}
        {status.enabled&&<p role="status" className="mt-3 text-sm text-brand-muted">{status.workerAvailable?'Your worker is checking for videos.':'Waiting for your local worker. Start it to process the library.'}</p>}
        {status.assets.discovered>0&&<div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-brand-line bg-brand-surface p-3"><p className="text-lg font-semibold tabular-nums">{status.assets.completed}/{status.assets.discovered}</p><p className="mt-1 text-xs text-brand-muted">Videos scanned</p></div><div className="rounded-xl border border-brand-line bg-brand-surface p-3"><p className="text-lg font-semibold tabular-nums">{count('queued')+count('running')}</p><p className="mt-1 text-xs text-brand-muted">Windows waiting</p></div><div className="rounded-xl border border-brand-line bg-brand-surface p-3"><p className="text-lg font-semibold tabular-nums">{count('blocked')+count('failed')}</p><p className="mt-1 text-xs text-brand-muted">Need attention</p></div></div>}
        <p className="mt-3 text-xs leading-relaxed text-brand-muted">Sampled every 2.5 seconds in 60-second windows. Brief appearances may be missed. Playable local previews must be no larger than 100 MiB.</p>
        {status.problems.length>0&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-950">Some videos need attention</p><ul className="mt-2 space-y-2">{status.problems.map((p,index)=><li key={index} className="text-xs leading-relaxed text-amber-950"><span className="font-medium">{p.filename}</span> · {reason[p.code]||'Reopen the source and retry.'}</li>)}</ul><button disabled={busy} onClick={()=>void retry()} className="mt-3 min-h-10 rounded-lg border border-amber-200 bg-brand-surface px-3 text-sm font-semibold disabled:opacity-50">Retry interrupted scans</button></div>}
      </>}
      {error&&<div role="alert" className="mt-3 text-sm text-red-700"><p>{error}</p><button disabled={busy} onClick={()=>{void reload().then(()=>setError('')).catch(()=>setError('Library matching is still unavailable.'));}} className="mt-2 min-h-10 rounded-lg border border-brand-line bg-brand-surface px-3 font-medium disabled:opacity-50">Reload status</button></div>}
    </div>
  </details>;
}
