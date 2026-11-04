"use client";
import { AppSelect } from '@/components/ui/AppSelect';
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { useEffect,useRef,useState } from 'react';
import { FactoryClose as Cancel01Icon,FactoryLoading as Loading03Icon } from '@/components/connectors/FactoryIcons';
import { ConnectorDialog } from '@/components/connectors/ConnectorDialog';
import { allPeople,peopleApi,type Person } from '@/lib/people-api';
import { PersonForm } from './PersonForm';
import { CheckIcon } from '@/components/animate-ui/icons/hugeicons/check';
import { UserIcon } from '@/components/animate-ui/icons/hugeicons/user';
import { Add01Icon } from '@/components/animate-ui/icons/hugeicons/add-01';
import { PencilEdit02Icon } from '@/components/animate-ui/icons/hugeicons/pencil-edit-02';
import { Delete02Icon } from '@/components/animate-ui/icons/hugeicons/delete-02';
import { Search01Icon } from '@/components/animate-ui/icons/hugeicons/search-01';

type ReferenceCheck={message?:string;status:string;suggestedBox?:number[]};
const referenceAdvice:Record<string,string>={adjust_selection:'Brisky found a face inside your selection. Review the smaller highlighted box, then use it to help Brisky recognise them.',ambiguous_selection:'More than one face could fit this selection. Draw around just one person’s face.',face_too_small:'This face is too small for matching. Try a closer moment, or save a manual tag.',no_face_detected:'Brisky couldn’t find a usable face in this frame. Try another moment, or save a manual tag.',target_not_detected:'Brisky couldn’t match a face to your selection. Draw a tighter box around the face, or try another moment.',unavailable:'Face checks are unavailable right now. You can still save a manual tag.'};

type Point={x:number;y:number};
export type TagFrame={image:string;time:number};
export function TagPerson({frame,assetId,startS,endS,onClose,onChooseFrame}:{frame:TagFrame;assetId:string;startS:number;endS:number;onClose:()=>void;onChooseFrame?:(time:number)=>Promise<void>}){
  const [people,setPeople]=useState<Person[]>([]),[person,setPerson]=useState(''),[creating,setCreating]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<string|null>(null);
  const [start,setStart]=useState(startS),[end,setEnd]=useState(endS),[a,setA]=useState<Point|null>(null),[b,setB]=useState<Point|null>(null),[drawing,setDrawing]=useState(false);
  const [referenceCheck,setReferenceCheck]=useState<ReferenceCheck|null>(null),[checking,setChecking]=useState(false),[savedAsManual,setSavedAsManual]=useState(false);
  const [editing,setEditing]=useState(false),[deleting,setDeleting]=useState(false),[frameTime,setFrameTime]=useState(frame.time);
  const area=useRef<HTMLDivElement>(null),feedback=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(referenceCheck||saved)feedback.current?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[referenceCheck,saved]);
  useEffect(()=>{let active=true;allPeople().then(items=>{if(active)setPeople(items);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const box=a&&b?[Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(a.x-b.x),Math.abs(a.y-b.y)]:null;
  const valid=box&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[0]+box[2]<=1.000001&&box[1]+box[3]<=1.000001&&box[2]>.01&&box[3]>.01&&Number.isFinite(start)&&Number.isFinite(end)&&start>=startS&&start<=frame.time&&end>frame.time&&end<=endS;
  function point(event:React.PointerEvent){const rect=area.current!.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
  async function save(manual=false){
    if(!valid||!frame||!box||!person)return;setBusy(true);setError('');
    try{
      if(!manual){
        setChecking(true);let result:ReferenceCheck;
        try{result=await peopleApi<ReferenceCheck>('/'+person+'/reference-check','POST',{assetId,frame_s:frame.time,box});}
        catch(e){setReferenceCheck({status:'unavailable',message:e instanceof Error?e.message:referenceAdvice.unavailable});return;}
        if(result.status!=='ready'){setReferenceCheck(result);return;}
      }
      setChecking(false);
      const tag=await peopleApi<{id:string}>('/'+person+'/appearances','POST',{assetId,start_s:start,end_s:end,frame_s:frame.time,box});
      setSaved(tag.id);setSavedAsManual(manual);setReferenceCheck(null);
    }catch(e){setError(e instanceof Error?e.message:'Unable to save tag.');}finally{setBusy(false);setChecking(false);}
  }
  function useSuggestedBox(){const next=referenceCheck?.suggestedBox;if(!next)return;setA({x:next[0],y:next[1]});setB({x:next[0]+next[2],y:next[1]+next[3]});setReferenceCheck(null);area.current?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}

  const selectedPerson=people.find(p=>p.id===person);
  const hasSelection=!!box&&box[2]>.01&&box[3]>.01;
  const clock=(seconds:number)=>Number.isFinite(seconds)&&seconds>=0?`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toFixed(2).padStart(5,'0')}`:'—';
  const inputClass='h-11 w-full rounded-xl border border-brand-line bg-brand-surface px-3 text-base text-brand-ink outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/15 disabled:opacity-50';
  const resetSelection=()=>{setA(null);setB(null);setReferenceCheck(null);};
  const guidance=!hasSelection?'Select one face to begin.':!person?'Choose who this is to continue.':!valid?'Check that the time range includes this frame.':'Your selection is ready to check.';

  return <ConnectorDialog open={!!frame} onDismiss={()=>{if(!busy)onClose();}} title="Teach Brisky a familiar face"
    panelClassName="max-h-[96dvh] md:max-h-[90dvh] md:max-w-[960px]"
    contentClassName="flex min-h-0 flex-col overflow-hidden p-0 md:p-0">
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-brand-line px-5 pb-5 pt-2 md:px-7 md:py-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 hidden size-11 shrink-0 items-center justify-center rounded-2xl border border-brand-violet/10 bg-brand-violet/5 text-brand-violet sm:flex"><UserIcon size={22}/></span>
        <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-violet">Teach Brisky</p><h2 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">{saved?'Brisky learned this moment':creating?'Meet someone new':'A face to remember'}</h2><p className="mt-1.5 text-sm leading-relaxed text-brand-muted">{saved?'A familiar face, connected to its moment.':creating?'Give them a name you’ll remember.':'Select a face. Tell Brisky who it belongs to.'}</p></div>
      </div>
      <AnimateIcon animateOnHover asChild><button disabled={busy} onClick={onClose} aria-label="Close tagging" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-brand-line bg-brand-surface text-brand-muted transition hover:bg-brand-canvas hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-brand-violet disabled:opacity-40"><Cancel01Icon size={20}/></button></AnimateIcon>
    </header>

    <div className="thin-scrollbar min-h-0 overflow-y-auto overscroll-contain" aria-busy={busy}>
      <div className="grid md:grid-cols-[1.15fr_1fr]">
        <section aria-label="Face selection" className="min-w-0 border-b border-brand-line bg-brand-canvas p-5 md:border-b-0 md:border-r md:p-7">
          <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-brand-ink text-[11px] font-semibold text-white">1</span><h3 className="text-sm font-semibold">Select a face</h3></div><span className="rounded-md border border-brand-line bg-brand-surface px-2 py-1 font-mono text-[11px] tabular-nums text-brand-muted">{clock(frame.time)}</span></div>
          <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-2xl border border-brand-line bg-brand-line p-2.5 shadow-inner md:min-h-56 md:p-3">
            <div ref={area} className={`relative mx-auto w-fit max-w-full overflow-hidden rounded-lg bg-black ${saved||busy?'':'cursor-crosshair'}`} style={{touchAction:'none'}}
              onPointerDown={event=>{if(saved||busy||creating||editing||deleting)return;setReferenceCheck(null);event.currentTarget.setPointerCapture(event.pointerId);const p=point(event);setA(p);setB(p);setDrawing(true);}}
              onPointerMove={event=>{if(drawing)setB(point(event));}}
              onPointerUp={event=>{if(drawing)setB(point(event));setDrawing(false);}} onPointerCancel={()=>setDrawing(false)}>
              {/* Captured locally from the authenticated source; no separate upload. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frame.image} alt="Paused source frame. Drag over the face you want to tag." draggable={false} className="block max-h-[32dvh] w-auto max-w-full select-none md:max-h-[340px]"/>
              {box&&<div aria-hidden className="pointer-events-none absolute rounded-sm border-2 border-white bg-brand-violet/15 shadow-[0_0_0_999px_rgba(15,18,35,0.25)]" style={{left:box[0]*100+'%',top:box[1]*100+'%',width:box[2]*100+'%',height:box[3]*100+'%'}}><span className="absolute -left-0.5 -top-0.5 size-2 border-l-2 border-t-2 border-white"/><span className="absolute -bottom-0.5 -right-0.5 size-2 border-b-2 border-r-2 border-white"/></div>}
              {referenceCheck?.status==='adjust_selection'&&referenceCheck.suggestedBox&&<div aria-hidden className="pointer-events-none absolute border-2 border-dashed border-amber-300" style={{left:referenceCheck.suggestedBox[0]*100+'%',top:referenceCheck.suggestedBox[1]*100+'%',width:referenceCheck.suggestedBox[2]*100+'%',height:referenceCheck.suggestedBox[3]*100+'%'}}/>}
            </div>
          </div>
          {!saved&&onChooseFrame&&<div className="mt-4 rounded-xl border border-brand-line bg-brand-surface p-3"><label htmlFor="face-frame-time" className="flex items-center justify-between gap-2 text-sm font-medium"><span>Choose a clearer frame</span><output className="font-mono text-xs text-brand-muted">{clock(frameTime)}</output></label><input id="face-frame-time" type="range" min={startS} max={Math.max(startS,endS-.04)} step="0.04" value={frameTime} disabled={busy||creating||editing||deleting} onChange={e=>setFrameTime(Number(e.target.value))} className="mt-2 h-8 w-full cursor-pointer accent-brand-violet"/><p className="text-xs leading-relaxed text-brand-muted">Starts at your paused position. Look for a clear, front-facing view.</p><AnimateIcon animateOnHover asChild><button disabled={busy||creating||editing||deleting} onClick={async()=>{setBusy(true);setError('');try{await onChooseFrame(frameTime);resetSelection();setStart(Math.min(start,frameTime));setEnd(Math.max(end,Math.min(endS,frameTime+.04)));}catch(e){setError(e instanceof Error?e.message:'Unable to load this frame.');}finally{setBusy(false);}}} className="mt-3 flex min-h-10 items-center gap-2 rounded-lg bg-brand-violet/10 px-3 text-sm font-semibold text-brand-violet disabled:opacity-50">{busy?<Loading03Icon size={16} className="animate-spin"/>:<Search01Icon size={16}/>}Use this frame</button></AnimateIcon></div>}
          {!saved&&<>
            <div className="mt-3 flex min-h-9 items-start justify-between gap-3"><p className="max-w-64 text-sm leading-relaxed text-brand-muted">{hasSelection?'Keep the box close to the face. Drag again to redraw.':'Drag a box around one face in the frame.'}</p>{hasSelection&&<AnimateIcon animateOnHover asChild><button disabled={busy||creating} onClick={resetSelection} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-brand-violet transition hover:bg-brand-violet/5 disabled:opacity-40"><PencilEdit02Icon size={15}/>Reset</button></AnimateIcon>}</div>
            {!creating&&<details className="group mt-4 border-t border-brand-line pt-3"><summary className="cursor-pointer text-xs font-medium text-brand-muted transition hover:text-brand-violet">Select with coordinates</summary><p className="mt-3 text-xs leading-relaxed text-brand-muted">Percent of the frame. You can use these fields instead of drawing.</p><div className="mt-3 grid grid-cols-4 gap-2">{['Left','Top','Width','Height'].map((label,i)=><label key={label} className="text-xs text-brand-muted">{label}<input aria-label={'Face box '+label.toLowerCase()} type="number" disabled={busy} min={0} max={100} step={.1} value={Number(((box?.[i]||0)*100).toFixed(1))} onChange={event=>{setReferenceCheck(null);const next=[...(box||[0,0,0,0])];next[i]=Number(event.target.value)/100;next[2]=Math.min(next[2],1-next[0]);next[3]=Math.min(next[3],1-next[1]);setA({x:next[0],y:next[1]});setB({x:next[0]+next[2],y:next[1]+next[3]});}} className={`${inputClass} mt-1 px-2 text-sm`}/></label>)}</div></details>}
          </>}
          {saved&&<p className="mt-3 text-sm leading-relaxed text-brand-muted">Saved at {clock(frame.time)} in the original recording.</p>}
        </section>

        <section aria-label="Person and visibility" className="min-w-0 p-5 md:p-7">
          {editing&&selectedPerson?<PersonForm key={selectedPerson.id} person={selectedPerson} onCancel={()=>setEditing(false)} onSaved={p=>{setPeople(old=>old.map(item=>item.id===p.id?p:item));setEditing(false);}}/>:deleting&&selectedPerson?<div><h3 className="text-lg font-semibold">Delete {selectedPerson.name}?</h3><p className="mt-3 text-sm leading-relaxed text-brand-muted">This removes their profile and all their appearance tags. Your original media stays in place.</p><div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} onClick={()=>setDeleting(false)} className="rounded-xl border border-brand-line px-4 py-3 text-sm">Keep person</button><AnimateIcon animateOnHover asChild><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await peopleApi('/'+person,'DELETE');setPeople(old=>old.filter(p=>p.id!==person));setPerson('');setReferenceCheck(null);setDeleting(false);}catch(e){setError(e instanceof Error?e.message:'Unable to delete person.');}finally{setBusy(false);}}} className="flex items-center gap-2 rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Delete02Icon size={17}/>{busy?'Deleting?':'Delete person'}</button></AnimateIcon></div></div>:creating?<PersonForm onCancel={()=>setCreating(false)} onSaved={p=>{setPeople(old=>[...old,p]);setPerson(p.id);setReferenceCheck(null);setCreating(false);}}/>:saved?<div ref={feedback} className="flex h-full flex-col items-center justify-center py-4 text-center">
            <span className="relative flex size-20 items-center justify-center rounded-3xl border border-brand-violet/15 bg-gradient-to-br from-brand-violet/10 to-[#efedf9] text-3xl font-semibold text-brand-violet">{selectedPerson?.name.slice(0,1).toUpperCase()}<span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-4 border-white bg-brand-action text-white"><CheckIcon size={13}/></span></span>
            <h3 className="mt-5 text-xl font-semibold">{selectedPerson?.name}</h3><p className="mt-2 text-sm text-brand-muted">Tagged from {clock(start)} to {clock(end)}</p><p role="status" className="mt-5 max-w-72 rounded-xl bg-brand-canvas px-4 py-3 text-sm leading-relaxed text-brand-muted">{savedAsManual?'Your manual tag is saved. Face matching still needs a usable face reference.':'Brisky learned who this is in this moment. You can find it again using their name.'}</p>
          </div>:<>
            <div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-brand-ink text-[11px] font-semibold text-white">2</span><h3 className="text-sm font-semibold">Who is this?</h3></div>
            <div className="mt-5 flex items-center justify-between gap-2"><label htmlFor="tag-person" className="text-sm font-medium">Person</label><AnimateIcon animateOnHover asChild><button disabled={loading||busy} onClick={()=>setCreating(true)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-violet transition hover:bg-brand-violet/5 disabled:opacity-40"><Add01Icon size={15}/>Add person</button></AnimateIcon></div>
            <div className="relative mt-1">
              <AppSelect id="tag-person" label="Person" searchable value={person} disabled={loading||busy} placeholder={loading?'Loading people?':'Choose a person'} onValueChange={value=>{setPerson(value);setReferenceCheck(null);}} options={people.map(p=>({value:p.id,label:p.name+(p.isMe?' (You)':''),description:p.aliases.length?p.aliases.join(', '):'Saved in your people'}))}/>

            </div>
            {!people.length&&!loading&&<p className="mt-2 text-sm leading-relaxed text-brand-muted">New here? Add someone to start teaching Brisky.</p>}
            {selectedPerson&&<div className="mt-3 flex items-center gap-3 rounded-xl bg-brand-violet/[.04] px-3 py-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white bg-brand-violet/10 text-sm font-semibold text-brand-violet">{selectedPerson.name.slice(0,1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{selectedPerson.name}</p><p className="truncate text-xs text-brand-muted">{selectedPerson.isMe?'You':selectedPerson.aliases.length?selectedPerson.aliases.join(', '):'Saved in your people'}</p></div></div>}

            {selectedPerson&&<div className="mt-2 flex gap-2"><AnimateIcon animateOnHover asChild><button disabled={busy} onClick={()=>{setEditing(true);}} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-brand-violet hover:bg-brand-violet/5"><PencilEdit02Icon size={16}/>Edit person</button></AnimateIcon><AnimateIcon animateOnHover asChild><button disabled={busy} onClick={()=>{setDeleting(true);setError('');}} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50"><Delete02Icon size={16}/>Delete</button></AnimateIcon></div>}
            <details className="mt-6 rounded-xl border border-brand-line bg-brand-surface">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium"><span className="ml-1">Visible in this moment</span><span className="mt-1 block pl-5 font-mono text-xs font-normal tabular-nums text-brand-muted">{clock(start)} — {clock(end)}</span></summary>
              <fieldset className="space-y-4 border-t border-brand-line px-4 pb-4 pt-3"><legend className="sr-only">When are they visible?</legend><label className="block text-sm text-brand-muted"><span className="flex justify-between"><span>From</span><output className="font-mono text-brand-ink">{clock(start)}</output></span><input aria-label="Visible from" aria-valuetext={clock(start)} type="range" disabled={busy} min={startS} max={Math.max(startS,frame.time)} step="0.01" value={start} onChange={e=>setStart(Number(e.target.value))} className="mt-2 h-8 w-full cursor-pointer accent-brand-violet"/></label><label className="block text-sm text-brand-muted"><span className="flex justify-between"><span>Until</span><output className="font-mono text-brand-ink">{clock(end)}</output></span><input aria-label="Visible until" aria-valuetext={clock(end)} type="range" disabled={busy} min={Math.min(endS,frame.time+.01)} max={endS} step="0.01" value={end} onChange={e=>setEnd(Number(e.target.value))} className="mt-2 h-8 w-full cursor-pointer accent-brand-violet"/></label><p className="text-xs leading-relaxed text-brand-muted">The selected face frame stays inside this range.</p></fieldset>
            </details><p className="mt-2 px-1 text-xs leading-relaxed text-brand-muted">Adjust this range to include only when they’re visible.</p>
            {referenceCheck&&<div ref={feedback} role="status" className="mt-5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 text-sm leading-relaxed text-amber-950"><p className="mb-1 font-semibold">{referenceCheck.status==='adjust_selection'?'A closer look':referenceCheck.status==='unavailable'?'Face check could not finish':referenceCheck.status==='ambiguous_selection'?'One face at a time':'Try a clearer selection'}</p><p>{referenceCheck.message||referenceAdvice[referenceCheck.status]||referenceAdvice.unavailable}</p>{referenceCheck.status==='adjust_selection'&&referenceCheck.suggestedBox&&<AnimateIcon animateOnHover asChild><button disabled={busy} onClick={useSuggestedBox} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-200 bg-brand-surface px-3 py-2 text-xs font-semibold text-brand-ink transition hover:border-brand-violet/40 hover:text-brand-violet disabled:opacity-50"><CheckIcon size={16}/>Use tighter selection</button></AnimateIcon>}</div>}
          </>}
          {error&&<p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm leading-relaxed text-red-700">{error}</p>}
        </section>
      </div>
    </div>

    {!creating&&!editing&&!deleting&&<footer className="shrink-0 border-t border-brand-line bg-brand-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:px-7 md:py-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p aria-live="polite" className="text-xs leading-relaxed text-brand-muted md:max-w-52">{saved?'This tag is saved to your people.':busy?(checking?'Brisky is checking your selection…':'Saving this moment…'):referenceCheck?'Review Brisky’s feedback before saving.':guidance}</p>
        <div className="flex flex-col gap-2 min-[420px]:flex-row md:justify-end">{saved?<><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await peopleApi('/appearances/'+saved,'DELETE');setSaved(null);}catch(e){setError(e instanceof Error?e.message:'Unable to undo.');}finally{setBusy(false);}}} className="order-2 min-h-11 rounded-xl border border-brand-line px-4 py-3 text-sm font-medium transition hover:bg-brand-canvas disabled:opacity-50 min-[420px]:order-1">Undo tag</button><AnimateIcon animateOnHover asChild><button onClick={onClose} className="order-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-action px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 min-[420px]:order-2"><CheckIcon size={17}/>Done</button></AnimateIcon></>:<>
          {referenceCheck&&<button disabled={!valid||!person||busy} onClick={()=>void save(true)} className="order-2 min-h-11 rounded-xl border border-brand-line px-4 py-3 text-sm font-medium transition hover:bg-brand-canvas disabled:opacity-50 min-[420px]:order-1">Save manual tag</button>}
          <AnimateIcon animateOnHover asChild><button disabled={!valid||!person||busy} onClick={()=>void save()} className="order-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-action px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet disabled:opacity-40 disabled:shadow-none min-[420px]:order-2">{busy?<Loading03Icon size={17} className="animate-spin motion-reduce:animate-none"/>:<Search01Icon size={17}/>} {busy?(checking?'Checking face…':'Saving…'):referenceCheck?'Check again':'Teach Brisky this person'}</button></AnimateIcon>
        </>}</div>
      </div>
    </footer>}
  </ConnectorDialog>;
}
