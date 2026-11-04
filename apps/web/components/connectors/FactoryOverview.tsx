"use client";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

import { ConnectorDialog } from './ConnectorDialog';
import { FactoryClose } from './FactoryIcons';
import { useFactory } from '@/lib/factory-context';

export function FactoryOverview({open,onClose}:{open:boolean;onClose:()=>void}){
  const {counts,stages,files,loading,error}=useFactory();
  const count=(status:string)=>counts.filter(item=>item.status===status).reduce((sum,item)=>sum+Number(item.count),0);
  const total=counts.reduce((sum,item)=>sum+Number(item.count),0);
  const statuses=[
    {label:'Indexed',value:count('indexed'),color:'#389f80'},
    {label:'Processing',value:count('processing'),color:'#8068e8'},
    {label:'Queued',value:count('queued'),color:'#b9adeb'},
    {label:'Partially indexed',value:count('partially_indexed'),color:'#e7aa55'},
    {label:'Failed',value:count('failed'),color:'#df7885'},
  ];
  const other=total-statuses.reduce((sum,item)=>sum+item.value,0);
  if(other>0)statuses.push({label:'Other',value:other,color:'#a6a9ba'});
  let offset=0;
  const segments=statuses.filter(item=>item.value>0).map(item=>{const start=offset;offset+=item.value/total*360;return `${item.color} ${start}deg ${offset}deg`;});
  const indexed=statuses[0].value,percent=total?Math.round(indexed/total*100):0;
  return <ConnectorDialog open={open} onDismiss={onClose} title="Factory overview">
    <header className="flex items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand-violet">Your library</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Factory overview</h2><p className="mt-2 text-sm leading-relaxed text-brand-muted">A clear picture of where your assets stand.</p></div>
      <AnimateIcon animateOnHover asChild><button type="button" onClick={onClose} aria-label="Close overview" className="grid size-10 shrink-0 place-items-center rounded-xl text-brand-muted hover:bg-brand-canvas"><FactoryClose size={21}/></button></AnimateIcon>
    </header>
    <div className="mt-7 rounded-2xl border border-brand-line bg-brand-canvas/40 p-5 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Indexing status</h3><span className="flex items-center gap-1.5 text-xs text-brand-muted"><span aria-hidden className={`size-1.5 rounded-full ${error?'bg-amber-500':'bg-emerald-500'}`}/>{error?'Last received totals':'Updates every 2.5s'}</span></div>
      <div className="flex flex-col items-center gap-7 min-[420px]:flex-row min-[420px]:gap-8">
        <div role="img" aria-label={loading?'Loading asset status':`${total} assets tracked; ${indexed} fully indexed`} className="relative size-44 shrink-0 rounded-full" style={{background:!loading&&segments.length?`conic-gradient(${segments.join(',')})`:'#e9e6f2'}}>
          <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-brand-surface"><span className="text-4xl font-semibold tracking-tight tabular-nums">{loading?'—':total.toLocaleString()}</span><span className="mt-1 text-xs text-brand-muted">{total===1?'asset tracked':'assets tracked'}</span></div>
        </div>
        <dl aria-label="Asset indexing totals" aria-live="polite" className="w-full flex-1 space-y-3.5">
          {statuses.map(item=><div key={item.label} className="flex items-center justify-between gap-5"><dt className="flex items-center gap-2.5 text-sm text-brand-muted"><span aria-hidden className="size-2 rounded-full" style={{backgroundColor:item.color}}/>{item.label}</dt><dd className="text-sm font-semibold tabular-nums">{loading?'—':item.value.toLocaleString()}</dd></div>)}
        </dl>
      </div>
    </div>
    <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-brand-canvas px-5 py-4"><div><p className="text-sm font-semibold">{loading?'Updating your library':indexed?'Ready to explore':total?'Still taking shape':'Your library starts here'}</p><p className="mt-1 text-xs leading-relaxed text-brand-muted">{total?`${indexed.toLocaleString()} of ${total.toLocaleString()} assets fully indexed.`:'Connect storage and choose folders to get started.'}</p></div><span className="text-2xl font-semibold tabular-nums text-brand-violet">{loading?'—':`${percent}%`}</span></div>
    <section className="mt-6"><h3 className="text-sm font-semibold">Recent file journeys</h3><p className="mt-1 text-xs text-brand-muted">The 5 most recent files. Open one to follow its recorded steps. Indexed totals include files that reused an existing index.</p><div className="mt-3 space-y-2">{files.slice(0,5).map(file=><details key={file.id} className="rounded-xl border border-brand-line p-3"><summary className="cursor-pointer text-sm"><span className="font-medium">{file.name}</span><span className="ml-2 text-xs text-brand-muted">{file.status.replaceAll('_',' ')}</span></summary><ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{stages.map(stage=>{const live=stage.files.some(f=>f.id===file.id),recent=stage.recentFiles?.find(f=>f.id===file.id);return <li key={stage.id} className="rounded-lg bg-brand-canvas p-2 text-xs"><p className="font-medium">{stage.title}</p><p className={live?'mt-1 text-brand-violet':recent?.status==='completed'?'mt-1 text-emerald-700':'mt-1 text-brand-muted'}>{live?'Processing':recent?.reused?'Reused existing index':recent?.status==='completed'?'Completed':recent?.status||'Not recorded'}</p></li>;})}</ol></details>)}</div></section>
    <p className="mt-5 text-xs leading-relaxed text-brand-muted">These totals count assets, not individual frames. Partially indexed assets are shown separately.</p>
  </ConnectorDialog>;
}
