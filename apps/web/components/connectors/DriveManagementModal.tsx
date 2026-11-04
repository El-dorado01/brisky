"use client";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { ArrowLeft01Icon as ArrowLeft } from '@/components/animate-ui/icons/hugeicons/arrow-left-01';
import { FactoryClose as X } from './FactoryIcons';
import { useState } from 'react';
import type { DriveAccount } from '@/lib/factory-context';
import { ConnectorDialog } from './ConnectorDialog';
import { DriveManager } from './DriveManager';

export function DriveManagementModal({open,account,onBack}:{open:boolean;account:DriveAccount|undefined;onBack:()=>void}){
  const [dirty,setDirty]=useState(false),[confirm,setConfirm]=useState(false);
  function back(){if(dirty)setConfirm(true);else onBack();}
  return <><ConnectorDialog open={open&&!!account} onDismiss={back} title="Manage Google Drive">
    <header className="flex items-start justify-between gap-3">
      <div><AnimateIcon animateOnHover asChild><button type="button" onClick={back} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-brand-violet"><ArrowLeft size={16}/>Back to connectors</button></AnimateIcon><h2 className="text-2xl font-semibold tracking-tight">Manage Google Drive</h2><p className="mt-1.5 text-sm text-brand-muted">Choose which folders Brisky can include.</p></div>
      <AnimateIcon animateOnHover asChild><button type="button" onClick={back} aria-label="Close Drive management" className="grid size-9 shrink-0 place-items-center rounded-xl text-brand-muted hover:bg-brand-canvas"><X size={20}/></button></AnimateIcon>
    </header>
    {open&&account&&<DriveManager key={account.id} account={account} onDirtyChange={setDirty} onCancel={back}/>}
  </ConnectorDialog>
  <ConnectorDialog open={open&&confirm} onDismiss={()=>setConfirm(false)} title="Unsaved folder changes" alert>
    <h2 className="text-xl font-semibold">Unsaved folder changes</h2><p className="mt-3 text-sm text-brand-muted">Your folder selection has not been saved. Discard these changes and return to Connectors?</p>
    <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={()=>setConfirm(false)} className="rounded-lg border border-brand-line px-4 py-2 text-sm font-medium">Keep editing</button><button type="button" onClick={()=>{setConfirm(false);setDirty(false);onBack();}} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Discard changes</button></div>
  </ConnectorDialog></>;
}
