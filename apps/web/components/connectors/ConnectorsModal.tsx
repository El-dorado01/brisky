"use client";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

import { useState } from "react";
import { FactoryClose as X,FactoryLoading as LoaderCircle } from "./FactoryIcons";
import { connectorById, connectors, type Connector } from "@/lib/connectors";

import { factoryFetch,useFactory } from "@/lib/factory-context";
import { DriveManagementModal } from "./DriveManagementModal";
import { ConnectorDialog } from "./ConnectorDialog";


const rowBtn =
  "h-9 shrink-0 rounded-lg px-3.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet";

function Row({
  Icon,
  title,
  subtitle,
  action,
}: {
  Icon: Connector["Icon"];
  title: string;
  subtitle: string;
  action: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-canvas text-brand-ink">
        <Icon className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-sm text-brand-muted">{subtitle}</p>
      </div>
      {action}
    </li>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-muted">
      {children}
      <span className="rounded-full bg-brand-canvas px-2 py-0.5 text-[11px] normal-case tracking-normal">{count}</span>
    </h3>
  );
}

export function ConnectorsModal({ open, onClose }: { open: boolean; onClose: () => void }) {

  const {sources:connectedSources,accounts,error}=useFactory();
  const [managed,setManaged]=useState<string|null>(null),[connecting,setConnecting]=useState(false),[connectionError,setConnectionError]=useState("");
  async function connect(){setConnecting(true);setConnectionError("");try{const result=await factoryFetch<{url:string}>("connectors/google-drive/start","POST");window.location.assign(result.url);}catch(error){setConnectionError(error instanceof Error?error.message:"Unable to connect Google Drive.");setConnecting(false);}}

  return (
    <>
    <ConnectorDialog open={open&&!accounts.some(a=>a.id===managed)} onDismiss={onClose} title="Connectors">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Connectors</h2>
            <p className="mt-1.5 max-w-md text-sm text-brand-muted">
              Brisky reads and indexes your media. Your originals stay where they are.
            </p>
          </div>
          <AnimateIcon animateOnHover asChild><button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-brand-muted transition hover:bg-brand-canvas hover:text-brand-ink"
          >
            <X className="size-5" strokeWidth={1.8} />
          </button></AnimateIcon>
        </div>

        <section className="mt-8">
          <SectionTitle count={connectedSources.length}>Connected</SectionTitle>
          <ul className="mt-1 divide-y divide-brand-line">
            {connectedSources.map((s) => {
              const c = connectorById(s.connectorId);
              return (
                <Row
                  key={s.id}
                  Icon={c.Icon}
                  title={s.label}
                  subtitle={`${c.name} · ${s.files} files`}
                  action={
                    <button
                      type="button"
                      onClick={()=>setManaged(s.id)}
                      className={`${rowBtn} border border-brand-line text-brand-ink hover:border-brand-violet/40`}
                    >
                      Manage
                    </button>
                  }
                />
              );
            })}
          </ul>
        </section>


        {(connectionError||error)&&<p role="alert" className="mt-4 text-sm text-brand-muted">{connectionError||error}</p>}
        {!connectedSources.length&&<p className="mt-3 text-sm text-brand-muted">No sources connected yet.</p>}
        <section className="mt-8">
          <SectionTitle count={connectors.length}>Available</SectionTitle>
          <ul className="mt-1 divide-y divide-brand-line">
            {connectors.map((c) => (
              <Row
                key={c.id}
                Icon={c.Icon}
                title={c.name}
                subtitle={c.description}
                action={
                  c.status === "soon" ? (
                    <span className="shrink-0 rounded-full bg-brand-canvas px-3 py-1.5 text-xs font-medium text-brand-muted">
                      Coming soon
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={connecting} onClick={()=>void connect()}
                      className={`${rowBtn} bg-brand-action text-white hover:bg-brand-action-hover`}
                    >
                      {connecting?<LoaderCircle aria-label="Connecting Google Drive" size={16} animate loop/>:"Add"}
                    </button>
                  )
                }
              />
            ))}
          </ul>
        </section>

        <p className="mt-8 text-xs leading-relaxed text-brand-muted">
          <strong className="font-medium text-brand-ink">We keep the intelligence, not the tape.</strong> Files are
          downloaded only briefly to be indexed, then removed. Disconnect a source at any time.
        </p>
    </ConnectorDialog>
    <DriveManagementModal key={managed||'none'} open={open&&!!managed} account={accounts.find(a=>a.id===managed)} onBack={()=>setManaged(null)}/>
    </>
  );
}
