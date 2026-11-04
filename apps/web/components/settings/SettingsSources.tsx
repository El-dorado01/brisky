"use client";
import {useState} from 'react';
import Link from 'next/link';
import {FactoryProvider,useFactory} from '@/lib/factory-context';
import {ConnectorsModal} from '@/components/connectors/ConnectorsModal';
import {GoogleDriveIcon} from '@/components/connectors/GoogleDriveIcon';

function Sources(){const {accounts,loading,error,refresh}=useFactory(),[open,setOpen]=useState(false);return <>
  <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-md text-sm leading-7 text-brand-muted">Choose the accounts and folders Brisky can use. Folder selection and automatic sync are managed per connection.</p><button type="button" onClick={()=>setOpen(true)} className="min-h-11 rounded-xl bg-brand-action px-4 text-sm font-semibold text-white hover:bg-brand-action-hover">Manage connections</button></div>
  {loading?<p role="status" className="mt-6 text-sm text-brand-muted">Loading connections...</p>:error?<p role="alert" className="mt-6 text-sm text-red-700">{error}<button type="button" onClick={()=>void refresh()} className="ml-2 underline">Retry</button></p>:!accounts.length?<div className="mt-6 rounded-2xl border border-dashed border-brand-line p-6 text-center text-sm text-brand-muted">No accounts connected yet.</div>:<ul className="mt-6 divide-y divide-brand-line">{accounts.map(account=><li key={account.id} className="flex min-w-0 items-center gap-3 py-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-canvas"><GoogleDriveIcon className="size-6"/></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{account.accountName||account.email}</p><p className="mt-1 text-xs leading-6 text-brand-muted">{account.selectedFolders.length} folders · {account.syncEnabled?'Automatic sync on':'Automatic sync off'}</p></div><span className="text-xs font-medium text-brand-muted">{account.status}</span></li>)}</ul>}
  <Link href="/factory" className="mt-6 inline-flex min-h-10 items-center text-sm font-semibold text-brand-violet hover:text-brand-violet-hover">View processing in Factory</Link><ConnectorsModal open={open} onClose={()=>setOpen(false)}/>
  </>;}
export function SettingsSources(){return <FactoryProvider><Sources/></FactoryProvider>;}
