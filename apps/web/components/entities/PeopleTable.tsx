"use client";
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { PencilEdit02Icon } from '@/components/animate-ui/icons/hugeicons/pencil-edit-02';
import { Delete02Icon } from '@/components/animate-ui/icons/hugeicons/delete-02';
import { ArrowRight01Icon } from '@/components/animate-ui/icons/hugeicons/arrow-right-01';
import type { Person } from '@/lib/people-api';

export function PeopleTable({people,onEdit,onTags,onDelete}:{people:Person[];onEdit:(person:Person)=>void;onTags:(person:Person)=>void;onDelete:(person:Person)=>void}){
  return <div className="overflow-x-auto rounded-2xl border border-brand-line bg-brand-surface">
    <table className="w-full text-left text-sm">
      <caption className="sr-only">People and their search aliases</caption>
      <thead className="border-b border-brand-line bg-brand-canvas/60 text-xs text-brand-muted"><tr><th scope="col" className="px-4 py-3 font-medium sm:px-5">Person</th><th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">Other names</th><th scope="col" className="px-3 py-3 text-right font-medium sm:px-5">Actions</th></tr></thead>
      <tbody className="divide-y divide-brand-line/70">{people.map(person=><tr key={person.id} className="transition-colors hover:bg-brand-canvas/40">
        <th scope="row" className="px-4 py-3 font-normal sm:px-5"><div className="flex items-center gap-3"><span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-violet/10 text-xs font-semibold text-brand-violet">{person.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()}</span><div className="min-w-0"><span className="break-words font-medium text-brand-ink">{person.name}</span>{person.isMe&&<span className="ml-2 rounded-full bg-brand-violet/10 px-2 py-0.5 text-xs text-brand-violet">You</span>}{person.aliases.length>0&&<p className="mt-1 break-words text-xs text-brand-muted sm:hidden">{person.aliases.join(', ')}</p>}</div></div></th>
        <td className="hidden max-w-xs break-words px-4 py-3 text-brand-muted sm:table-cell">{person.aliases.join(', ')||<span aria-label="No aliases">—</span>}</td>
        <td className="px-2 py-3 sm:px-4"><div className="flex items-center justify-end gap-0.5 sm:gap-1"><AnimateIcon animateOnHover asChild><button type="button" onClick={()=>onTags(person)} aria-label={'View tags for '+person.name} title="View tags" className="inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg px-2 text-brand-violet hover:bg-brand-violet/5"><span className="sr-only md:not-sr-only">View tags</span><ArrowRight01Icon size={17}/></button></AnimateIcon><AnimateIcon animateOnHover asChild><button type="button" onClick={()=>onEdit(person)} aria-label={'Edit '+person.name} title="Edit person" className="grid size-9 place-items-center rounded-lg text-brand-muted hover:bg-brand-canvas hover:text-brand-violet"><PencilEdit02Icon size={17}/></button></AnimateIcon><AnimateIcon animateOnHover asChild><button type="button" onClick={()=>onDelete(person)} aria-label={'Delete '+person.name} title="Delete person" className="grid size-9 place-items-center rounded-lg text-brand-muted hover:bg-red-50 hover:text-red-700"><Delete02Icon size={17}/></button></AnimateIcon></div></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
