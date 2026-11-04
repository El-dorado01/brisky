"use client";
import { useState } from 'react';
import { FactoryLoading as Loading03Icon } from '@/components/connectors/FactoryIcons';
import { peopleApi,type Person } from '@/lib/people-api';

export function PersonForm({person,onSaved,onCancel}:{person?:Person;onSaved:(person:Person)=>void;onCancel:()=>void}){
  const [name,setName]=useState(person?.name||''),[aliases,setAliases]=useState(person?.aliases.join(', ')||''),[isMe,setIsMe]=useState(person?.isMe||false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{const saved=await peopleApi<Person>(person?'/'+person.id:'',person?'PUT':'POST',{name:name.trim(),aliases:Array.from(new Set(aliases.split(',').map(s=>s.trim()).filter(Boolean))),isMe});onSaved(saved);}catch(error){setError(error instanceof Error?error.message:'Unable to save person.');}finally{setBusy(false);}}
  return <form onSubmit={save} className="space-y-5">
    <div><label htmlFor="person-name" className="mb-2 block text-sm font-medium">Name</label><input id="person-name" required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Uncle Dave" className="h-12 w-full rounded-xl border border-brand-line bg-brand-surface px-4 text-base outline-brand-violet"/></div>
    <div><label htmlFor="person-aliases" className="mb-2 block text-sm font-medium">Other names <span className="font-normal text-brand-muted">(optional)</span></label><input id="person-aliases" value={aliases} onChange={e=>setAliases(e.target.value)} placeholder="my uncle, Dave" className="h-12 w-full rounded-xl border border-brand-line bg-brand-surface px-4 text-base outline-brand-violet"/><p className="mt-2 text-sm text-brand-muted">Separate names with commas. Use names you would search for.</p></div>
    <label className="flex items-center gap-3 rounded-xl bg-brand-canvas p-4 text-sm"><input type="checkbox" checked={isMe} onChange={e=>setIsMe(e.target.checked)} className="size-4 accent-brand-violet"/>This is me <span className="ml-auto text-brand-muted">Use “me” in searches</span></label>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3 pt-2"><button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-brand-line px-5 py-3 text-sm font-medium">Cancel</button><button disabled={busy||!name.trim()} className="flex items-center gap-2 rounded-xl bg-brand-action px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy&&<Loading03Icon size={18} className="animate-spin motion-reduce:animate-none"/>}{busy?'Saving…':person?'Save changes':'Teach Brisky'}</button></div>
  </form>;
}
