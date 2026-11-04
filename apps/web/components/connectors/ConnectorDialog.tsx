"use client";

import { useEffect,useId,useRef,type ReactNode } from 'react';
import { motion,useReducedMotion } from 'framer-motion';
import { useBottomSheet } from '@/hooks/use-bottom-sheet';
import { cn } from '@/lib/cn';

let scrollLocks=0,previousOverflow='';
/** Native focus trapping with the shared mobile bottom-drawer motion and drag handle. */
export function ConnectorDialog({open,onDismiss,title,children,alert=false,panelClassName,contentClassName}:{open:boolean;onDismiss:()=>void;title:string;children:ReactNode;alert?:boolean;panelClassName?:string;contentClassName?:string}){
  const ref=useRef<HTMLDialogElement>(null),titleId=useId();
  const sheet=useBottomSheet(onDismiss,768);
  const reduced=useReducedMotion();
  useEffect(()=>{
    const dialog=ref.current;if(!dialog)return;
    if(!open){if(dialog.open)dialog.close();return;}
    dialog.showModal();
    if(scrollLocks++===0){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
    return()=>{if(dialog.open)dialog.close();if(--scrollLocks===0)document.body.style.overflow=previousOverflow;};
  },[open]);
  return <dialog ref={ref} role={alert?'alertdialog':undefined} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onDismiss();}}
    className="fixed inset-0 m-0 h-dvh max-h-dvh w-full max-w-full overflow-hidden bg-transparent p-0 text-brand-ink backdrop:bg-brand-ink/40 backdrop:backdrop-blur-sm">
    {open&&<div className="flex h-full items-end justify-center md:items-center md:p-4" onClick={event=>{if(event.target===event.currentTarget)onDismiss();}}>
      <motion.div {...sheet.panelProps} role="presentation" aria-modal={undefined}
        transition={reduced?{duration:.01}:{type:'tween',duration:.32,ease:[.22,1,.36,1]}}
        style={{willChange:'transform',backfaceVisibility:'hidden'}}
        className={cn("flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-brand-surface shadow-[0_16px_64px_rgba(34,40,63,0.24)] md:max-h-[85dvh] md:max-w-[640px] md:rounded-3xl",panelClassName)}>
        <div className="px-5 md:hidden"><div {...sheet.handleProps} className="-mx-5 flex h-8 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing md:hidden"><div className="h-1 w-10 rounded-full bg-brand-muted/30"/></div></div>
        <h2 id={titleId} className="sr-only">{title}</h2>
        <div className={cn("thin-scrollbar min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 md:p-8",contentClassName)}>{children}</div>
      </motion.div>
    </div>}
  </dialog>;
}
