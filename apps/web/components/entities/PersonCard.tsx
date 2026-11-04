"use client";
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { PencilEdit02Icon } from '@/components/animate-ui/icons/hugeicons/pencil-edit-02';
import { ArrowRight01Icon } from '@/components/animate-ui/icons/hugeicons/arrow-right-01';
import { Delete02Icon } from '@/components/animate-ui/icons/hugeicons/delete-02';
import type { Person } from '@/lib/people-api';

const palettes=[
  {background:'linear-gradient(120deg,#e5dffa,#f4efff 58%,#e7e9ff)',ink:'#7363de',avatar:'#f0ebfc'},
  {background:'linear-gradient(120deg,#d8eee7,#eff8f3 58%,#e2f0ed)',ink:'#348774',avatar:'#e5f3ed'},
  {background:'linear-gradient(120deg,#f5e4d7,#fdf3e9 58%,#f6e5e4)',ink:'#af7351',avatar:'#fcf0e6'},
];

export function PersonCard({person,onEdit,onTags,onDelete}:{person:Person;onEdit:()=>void;onTags:()=>void;onDelete:()=>void}){
  const palette=palettes[Array.from(person.id).reduce((sum,char)=>sum+char.charCodeAt(0),0)%palettes.length];
  const initials=person.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  return <article className="group overflow-hidden rounded-[24px] border border-brand-line/80 bg-brand-surface shadow-[0_2px_8px_rgba(34,40,63,.025)] transition-shadow hover:shadow-[0_8px_24px_rgba(34,40,63,.06)]">
    <div className="relative h-24 overflow-hidden" style={{background:palette.background}}>
      <div aria-hidden className="pointer-events-none absolute -right-7 -top-20 size-56 rounded-full border border-white/70 p-6"><div className="size-full rounded-full border border-white/70 p-6"><div className="size-full rounded-full border border-white/70"/></div></div>
      <div className="absolute inset-x-5 top-4 flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase tracking-[.18em]" style={{color:palette.ink}}>{person.isMe?'Your identity':'A familiar face'}</span><AnimateIcon animateOnHover asChild><button type="button" onClick={onEdit} aria-label={'Edit '+person.name} className="grid size-9 place-items-center rounded-xl bg-brand-surface/65 text-brand-ink/70 transition hover:bg-brand-surface focus-visible:outline-2 focus-visible:outline-brand-violet"><PencilEdit02Icon size={17}/></button></AnimateIcon></div>
    </div>
    <div className="relative px-5 pb-4">
      <div className="-mt-7 flex items-end justify-between gap-3"><div aria-hidden className="grid size-14 place-items-center rounded-[18px] border-[4px] border-white text-lg font-semibold shadow-sm" style={{backgroundColor:palette.avatar,color:palette.ink}}>{initials}</div>{person.isMe&&<span className="mb-1 rounded-full bg-brand-violet/10 px-2.5 py-1 text-xs font-medium text-brand-violet">You</span>}</div>
      <h2 className="mt-3 break-words text-lg font-semibold tracking-tight">{person.name}</h2>
      <div className="mt-2 flex min-h-8 flex-wrap items-center gap-1.5">{person.aliases.length? <>{person.aliases.slice(0,2).map(alias=><span key={alias} className="max-w-full truncate rounded-lg bg-brand-canvas px-2.5 py-1 text-xs text-brand-muted" title={alias}>{alias}</span>)}{person.aliases.length>2&&<span className="text-xs text-brand-muted" title={person.aliases.slice(2).join(', ')} aria-label={person.aliases.slice(2).join(', ')}>+{person.aliases.length-2}</span>}</>:<span className="text-sm text-brand-muted">Known by this name</span>}</div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-brand-line/70 pt-3"><AnimateIcon animateOnHover asChild><button type="button" onClick={onTags} className="-ml-2 flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-brand-violet transition hover:bg-brand-violet/5">View tags<ArrowRight01Icon size={17}/></button></AnimateIcon><AnimateIcon animateOnHover asChild><button type="button" onClick={onDelete} aria-label={'Delete '+person.name} title={'Delete '+person.name} className="grid size-10 place-items-center rounded-xl text-brand-muted/70 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-700"><Delete02Icon size={18}/><span className="sr-only">Delete</span></button></AnimateIcon></div>
    </div>
  </article>;
}

/** Decorative portraits, never presented as detected or saved people. */
export function PeopleEmptyAvatars(){
  return <div aria-hidden className="mx-auto flex h-24 w-fit items-center -space-x-4 px-3">
    {[{bg:'#e4efe9',shirt:'#579586',skin:'#e6b695',hair:'#424e49',rotate:'-10deg'},{bg:'#eae3fb',shirt:'#8170c8',skin:'#b67a59',hair:'#3c304c',rotate:'0deg'},{bg:'#fae8dd',shirt:'#d59570',skin:'#f1c7a4',hair:'#74604b',rotate:'10deg'}].map((p,i)=><div key={p.bg} className={`relative size-[68px] overflow-hidden rounded-full border-[3px] border-white shadow-[0_4px_14px_rgba(34,40,63,.09)] ${i===1?'z-10':'z-0'}`} style={{background:p.bg,transform:`rotate(${p.rotate})${i===1?' translateY(-8px)':''}`}}><svg viewBox="0 0 64 64" className="size-full" fill="none"><path d="M9 64c1-16 10-23 23-23s22 7 23 23" fill={p.shirt}/><path d="M26 38h12v12H26z" fill={p.skin}/><ellipse cx="32" cy="27" rx="13" ry="16" fill={p.skin}/><path d={i===1?'M18 28c-4-18 5-24 15-22 13-1 18 9 13 24l-4-14c-7 6-13 6-20 4l-4 8Z':i===2?'M19 25c-4-13 4-20 14-19 12 0 16 7 13 22l-5-12c-5 3-12 3-18 1l-4 8Z':'M18 28C13 9 23 5 32 6c12-1 17 7 14 22l-4-13-10 4-10-2-4 11Z'} fill={p.hair}/><circle cx="27" cy="28" r="1" fill={p.hair}/><circle cx="37" cy="28" r="1" fill={p.hair}/><path d="M29 35q3 3 6 0" stroke={p.hair} strokeWidth="1.3" strokeLinecap="round"/></svg></div>)}
  </div>;
}
