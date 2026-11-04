"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback,useEffect,useRef,useState } from 'react';
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { FactoryClose,FactoryLoading } from '@/components/connectors/FactoryIcons';
import { StudioLibrary } from './StudioLibrary';
import { StudioDocument } from './StudioDocument';
import { ConnectorDialog } from '@/components/connectors/ConnectorDialog';
import { Copy01Icon } from '@/components/animate-ui/icons/hugeicons/copy-01';
import { CheckIcon } from '@/components/animate-ui/icons/hugeicons/check';
import { Download01Icon } from '@/components/animate-ui/icons/hugeicons/download-01';
import { ArrowLeft01Icon } from '@/components/animate-ui/icons/hugeicons/arrow-left-01';
import { SourcePreview } from '@/components/search/SourcePreview';
import { studioFetch } from '@/lib/studio-client';
import { studioMarkdown,type StudioList,type StudioOutput,type StudioSource } from '@/lib/studio-types';

export function StudioView({initialOutputId,initialSourceId}:{initialOutputId?:string;initialSourceId?:string}){
  const scrollRoot=useRef<HTMLDivElement>(null);
  useEffect(()=>{scrollRoot.current?.scrollTo({top:0,behavior:'instant'});},[initialOutputId]);
  const router=useRouter(),[items,setItems]=useState<StudioOutput[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[listError,setListError]=useState(''),[error,setError]=useState('');
  const [active,setActive]=useState<StudioOutput|null>(null),[preview,setPreview]=useState<{outputId:string;source:StudioSource}|null>(null),[copied,setCopied]=useState(false),[actionError,setActionError]=useState(''),[refreshing,setRefreshing]=useState(false);
  const output=active?.id===initialOutputId?active:null;
  const source=preview&&preview.outputId===initialOutputId?preview.source:initialSourceId?output?.sources.find(s=>s.id===initialSourceId):undefined;
  const refresh=useCallback(async()=>{
    try{const result=await studioFetch<StudioList>('/api/studio');setItems(result.items);setCursor(result.nextCursor);setListError('');}catch(error){setListError(error instanceof Error?error.message:'Your documents could not load.');}finally{setLoading(false);}
  },[]);
  useEffect(()=>{let live=true;void Promise.resolve().then(()=>{if(live)return refresh();});return()=>{live=false;};},[refresh]);
  useEffect(()=>{
    if(!initialOutputId)return;let live=true;
    studioFetch<{output:StudioOutput}>(`/api/studio/${encodeURIComponent(initialOutputId)}`).then(result=>{if(live){setActive(result.output);setError('');}}).catch(error=>{if(live)setError(error.message);});
    return()=>{live=false;};
  },[initialOutputId]);
  useEffect(()=>{
    if(!initialOutputId||output?.status!=='generating')return;
    const timer=setInterval(()=>{void studioFetch<{output:StudioOutput}>(`/api/studio/${initialOutputId}`).then(result=>{setActive(result.output);void refresh();}).catch(()=>{});},2500);return()=>clearInterval(timer);
  },[initialOutputId,output?.status,refresh]);
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),2000);return()=>clearTimeout(timer);},[copied]);
  function select(id:string){setError('');setActionError('');setPreview(null);router.push(`/studio?output=${id}`);}
  function closePreview(){setPreview(null);if(initialSourceId)router.replace(`/studio?output=${initialOutputId}`);}
  async function loadMore(){if(!cursor||refreshing)return;setRefreshing(true);try{const result=await studioFetch<StudioList>('/api/studio?after='+encodeURIComponent(cursor));setItems(old=>[...old,...result.items.filter(item=>!old.some(o=>o.id===item.id))]);setCursor(result.nextCursor);}catch(error){setListError(error instanceof Error?error.message:'Unable to load more.');}finally{setRefreshing(false);}}
  function download(){if(!output?.document)return;const text=studioMarkdown(output,window.location.origin),url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=(output.title.replace(/[^a-z0-9]+/gi,'-').slice(0,70)||'brisky-document')+'.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const iconButton='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-brand-line bg-brand-surface px-3 text-sm font-medium text-brand-ink transition hover:border-brand-violet/40 hover:text-brand-violet focus-visible:outline-2 focus-visible:outline-brand-violet';
  return <div ref={scrollRoot} className="thin-scrollbar flex h-dvh min-w-0 flex-1 flex-col overflow-y-auto bg-brand-canvas text-brand-ink">
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-16 pt-6 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-line pb-7"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-violet">Made from your moments</p><h1 className="mt-2 hidden text-3xl font-semibold tracking-tight md:block">Studio</h1><p className="mt-2 text-sm text-brand-muted">A home for what you make from your moments.</p></div><Link href={output?`/search?space=${output.spaceId}`:'/search'} className={iconButton}><ArrowLeft01Icon size={16}/>{output?'Back to space':'Explore moments'}</Link></header>
      <div className={`mt-7 ${initialOutputId?'xl:grid xl:grid-cols-[240px_minmax(0,1fr)] xl:items-start xl:gap-10 2xl:gap-12':''}`}>
        <StudioLibrary items={items} selectedId={initialOutputId} loading={loading} error={listError} hasMore={!!cursor} loadingMore={refreshing} onSelect={select} onRetry={()=>void refresh()} onMore={()=>void loadMore()}/>

        {initialOutputId&&<section aria-label="Studio document" className="mx-auto w-full min-w-0 max-w-4xl"><Link href="/studio" className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-brand-violet xl:hidden"><ArrowLeft01Icon size={16}/>All creations</Link>
          {error?<p role="alert" className="rounded-2xl border border-red-200 bg-brand-surface p-5 text-sm text-red-700">{error}</p>:!output?<p role="status" className="rounded-2xl bg-brand-surface p-8 text-sm text-brand-muted">Opening your document...</p>:output.status==='generating'?<div role="status" className="rounded-3xl border border-brand-line bg-brand-surface p-8"><FactoryLoading size={28} className="text-brand-violet"/><h2 className="mt-5 text-xl font-semibold">Brisky is bringing your moments together</h2><p className="mt-3 text-sm leading-relaxed text-brand-muted">Your source references stay attached. This page updates when the document is ready.</p></div>:output.status==='failed'?<div className="rounded-3xl border border-brand-line bg-brand-surface p-8"><h2 className="text-xl font-semibold">This creation did not finish</h2><p className="mt-3 text-sm leading-relaxed text-brand-muted">Your shortlist is safe. Return to the space to create it again.</p><Link href={`/search?space=${output.spaceId}`} className={`${iconButton} mt-5`}>Return to space</Link></div>:output.document&&<>
            <div className="sticky top-0 z-20 -mx-1 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-line/60 bg-brand-canvas/85 px-3 py-3 backdrop-blur-xl"><span className="text-xs text-brand-muted">{output.sources.length} {output.sources.length===1?'source moment':'source moments'} attached</span><div className="flex gap-2"><AnimateIcon animateOnHover asChild><button type="button" onClick={async()=>{setActionError('');try{await navigator.clipboard.writeText(studioMarkdown(output,window.location.origin));setCopied(true);}catch{setActionError('Copy did not work. You can download the document instead.');}}} className={iconButton}>{copied?<CheckIcon size={16}/>:<Copy01Icon size={16}/>} {copied?'Copied':'Copy'}</button></AnimateIcon><AnimateIcon animateOnHover asChild><button type="button" onClick={download} className={iconButton}><Download01Icon size={16}/>Download</button></AnimateIcon></div></div>
            {actionError&&<p role="alert" className="mb-3 text-sm text-red-700">{actionError}</p>}<span role="status" className="sr-only">{copied?'Document copied.':''}</span>
            <StudioDocument key={output.id} output={output} onSource={source=>setPreview({outputId:output.id,source})}/>

          </>}
        </section>}
      </div>
    </main>
    <ConnectorDialog open={!!source&&source.available!==false} onDismiss={closePreview} title="Source moment" panelClassName="md:max-w-[850px]" contentClassName="p-0 md:p-0"><header className="flex items-center justify-between gap-3 border-b border-brand-line px-5 py-4"><h2 className="min-w-0 truncate text-base font-semibold">{source?.title||source?.filename}</h2><AnimateIcon animateOnHover asChild><button type="button" onClick={closePreview} aria-label="Close source preview" className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-brand-canvas"><FactoryClose size={20}/></button></AnimateIcon></header>{source&&output&&<SourcePreview key={`${output.id}:${source.id}`} spaceId={output.spaceId} autoPlay moment={{id:source.momentId,assetId:source.assetId,title:source.title,filename:source.filename,startS:source.startS,endS:source.endS,notes:'',source:'Original source'}}/>}</ConnectorDialog>
  </div>;
}
