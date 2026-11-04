"use client";

import { AppSelect } from '@/components/ui/AppSelect';
import { SpaceCompanion } from "./SpaceCompanion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from 'react-dom';
import { useSpaces } from '@/lib/spaces-context';
import { useMobileLayout } from '@/hooks/use-mobile-layout';
import { spacesFetch, spaceRequestId } from '@/lib/spaces-client';
import type { SpaceDetail,SpaceCitation } from '@/lib/spaces-types';
import { LoaderCircle } from 'lucide-react';
import { SpaceStudio } from '@/components/studio/SpaceStudio';
import { ResponseActions } from './ResponseActions';
import { ReplyCitation } from './ReplyCitation';
import { SourcePreview } from './SourcePreview';
import { formatChatTime } from '@/lib/chat-time';
import { MomentThumbnail } from './MomentThumbnail';
import { FactoryAudio,FactoryClose } from '@/components/connectors/FactoryIcons';
import { ConnectorDialog } from '@/components/connectors/ConnectorDialog';
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

// Official Animate UI Hugeicons
import { CheckIcon } from "@/components/animate-ui/icons/hugeicons/check";
import { Add01Icon } from "@/components/animate-ui/icons/hugeicons/add-01";
import { ArrowDown01Icon } from "@/components/animate-ui/icons/hugeicons/arrow-down-01";
import { ArrowUp01Icon } from "@/components/animate-ui/icons/hugeicons/arrow-up-01";
import { Copy01Icon } from "@/components/animate-ui/icons/hugeicons/copy-01";
import { Download01Icon } from "@/components/animate-ui/icons/hugeicons/download-01";
import { PencilEdit02Icon } from "@/components/animate-ui/icons/hugeicons/pencil-edit-02";
import { PinIcon } from "@/components/animate-ui/icons/hugeicons/pin";
import { MoreHorizontalIcon } from "@/components/animate-ui/icons/hugeicons/more-horizontal";
import { Maximize01Icon } from "@/components/animate-ui/icons/hugeicons/maximize-01";
import { Minimize01Icon } from "@/components/animate-ui/icons/hugeicons/minimize-01";
import { PanelRightIcon } from "@/components/animate-ui/icons/hugeicons/panel-right";
import { PanelLeftIcon } from "@/components/animate-ui/icons/hugeicons/panel-left";
import { SendHorizontalIcon } from "@/components/animate-ui/icons/hugeicons/send-horizontal";
import { TrashIcon } from "@/components/animate-ui/icons/hugeicons/trash";
import { ClapperboardIcon } from "@/components/animate-ui/icons/hugeicons/clapperboard";
import {
  type Modality,
  type SearchMoment,
} from "@/lib/search-results";

type ChatTurn = {
  id: string;
  role: "user" | "brisky";
  text: string;
};

function UserAvatar({initial}:{initial:string}) {
  return (
    <span
      aria-label="You"
      className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-ink text-xs font-semibold text-white shadow-xs"
    >
      {initial}
    </span>
  );
}

function BriskyMascotAvatar() {
  return <span aria-label="Brisky" className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-violet/10 text-base text-brand-violet [font-family:var(--font-logo),sans-serif]">b.</span>;
}

/**
 * Distinct fixed background for the Space / chatroom view:
 * architectural ledger grid + subtle crosshair intersections + soft violet perspective wash.
 */
function SpaceBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-brand-canvas"
    >
      {/* Soft ambient violet wash in top-right and bottom-left corners */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(65% 55% at 88% 12%, rgba(115, 99, 222, 0.08), transparent 70%), radial-gradient(55% 50% at 14% 88%, rgba(115, 99, 222, 0.06), transparent 70%)",
        }}
      />

      {/* Architectural 56px ruled ledger lines masked smoothly toward edges */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(115, 99, 222, 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(115, 99, 222, 0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 85% 80% at 55% 45%, #000 35%, transparent 95%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 80% at 55% 45%, #000 35%, transparent 95%)",
        }}
      />

      {/* Subtle SVG crosshair markers and diagonal editorial guide rails */}
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="space-crosshairs"
            width="112"
            height="112"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 56 52 L 56 60 M 52 56 L 60 56"
              stroke="#7363de"
              strokeWidth="1"
              strokeOpacity="0.18"
            />
            <circle cx="0" cy="0" r="1" fill="#7363de" fillOpacity="0.16" />
            <circle cx="112" cy="0" r="1" fill="#7363de" fillOpacity="0.16" />
            <circle cx="0" cy="112" r="1" fill="#7363de" fillOpacity="0.16" />
            <circle cx="112" cy="112" r="1" fill="#7363de" fillOpacity="0.16" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#space-crosshairs)" />
      </svg>
    </div>
  );
}

function timecode(seconds:number){return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,Math.floor(seconds)%60].map(n=>String(n).padStart(2,'0')).join(':');}

function StudioPanel({ mobile, open, expanded, onClose, children, label='Space Studio',width='w-96' }: {
  mobile: boolean; open: boolean; expanded: boolean; onClose: () => void; children: ReactNode;label?:string;width?:string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobile || !open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]') ?? [])
        .filter(element => element.getBoundingClientRect().height > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [mobile, open, onClose]);
  const panel = (
    <aside ref={panelRef} aria-hidden={!open} inert={!open}
      role={mobile ? 'dialog' : undefined} aria-modal={mobile && open ? true : undefined} aria-label={label}
      className={`${mobile ? 'fixed inset-0 z-[60] h-dvh w-full pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]' : `absolute right-0 top-0 z-40 h-full border-l border-brand-line py-6 ${expanded ? 'w-full' : width}`} flex flex-col overflow-hidden bg-brand-surface px-5 sm:px-6 transition-[width,transform] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
    >
      {mobile && <button type="button" onClick={onClose} aria-label={`Close ${label}`} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-xl text-brand-ink hover:bg-brand-canvas focus-visible:outline-2 focus-visible:outline-brand-violet"><span aria-hidden="true" className="text-2xl leading-none">×</span></button>}
      {children}
    </aside>
  );
  return mobile ? createPortal(panel, document.body) : panel;
}

const subscribeMomentsDrawer=(callback:()=>void)=>{const media=window.matchMedia('(max-width: 1279px)');media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback);};
const getMomentsDrawer=()=>window.matchMedia('(max-width: 1279px)').matches;
const serverMomentsDrawer=()=>false;

export function SearchResultsView({
  initialQuery, spaceId,
}: {
  initialQuery: string; spaceId: string;
}) {
  const [filter, setFilter] = useState<"all" | "shortlisted" | Modality>("all");
  const {setVoiceOpen,mobileActionsHost,updateSpace,deleteSpace,refreshSpaces,takeAutoReply}=useSpaces();
  const [detail,setDetail]=useState<SpaceDetail|null>(null);
  const [profileInitial,setProfileInitial]=useState('?');
  const chatScrollRef=useRef<HTMLDivElement>(null),chatContentRef=useRef<HTMLDivElement>(null),stickToLatest=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/auth/session',{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)return;const {user}=await response.json();
      if(!controller.signal.aborted)setProfileInitial((user?.name?.trim()||user?.email||'?').charAt(0).toUpperCase());
    }).catch(()=>{});
    return()=>controller.abort();
  },[]);
  const latestMessageId=detail?.messages.at(-1)?.id;
  const hasFollowups=(detail?.messages.length??0)>2;

  const [loadError,setLoadError]=useState('');
  const [saving,setSaving]=useState(false);
  const [replying,setReplying]=useState(false);
  const [renameOpen,setRenameOpen]=useState(false),[renameTitle,setRenameTitle]=useState(''),[renaming,setRenaming]=useState(false),[renameError,setRenameError]=useState('');
  const [toast,setToast]=useState<{message:string}|null>(null);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),3200);return()=>clearTimeout(timer);},[toast]);
  const notify=(message:string)=>setToast({message});
  const [deleteOpen,setDeleteOpen]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const [clock,setClock]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setClock(new Date()),60000);return()=>clearInterval(timer);},[]);
  const [sources,setSources]=useState<{id:string;filename:string;duration:number}[]|null>(null);
  const [addingMoment,setAddingMoment]=useState(false);
  const [sourceId,setSourceId]=useState('');
  const [rangeStart,setRangeStart]=useState('0'),[rangeEnd,setRangeEnd]=useState('');
  const [momentTitle,setMomentTitle]=useState('');
  const busyRef=useRef(false);
  const pendingMessage=useRef<{id:string;content:string}|null>(null);
  const reload=useCallback(async()=>{const value=await spacesFetch<SpaceDetail>(`/${spaceId}`);setDetail(value);return value;},[spaceId]);
  const requestReply=useCallback(async(messageId:string)=>{
    if(busyRef.current)return;busyRef.current=true;setReplying(true);setLoadError('');
    try{await spacesFetch(`/${spaceId}/reply`,'POST',{messageId});await reload();void refreshSpaces();}
    catch(error){setLoadError(error instanceof Error?error.message:'Brisky could not finish replying. Please retry.');await reload().catch(()=>undefined);}
    finally{busyRef.current=false;setReplying(false);}
  },[spaceId,reload,refreshSpaces]);
  useEffect(()=>{let live=true;spacesFetch<SpaceDetail>(`/${spaceId}`).then(value=>{if(live){setDetail(value);setLoadError('');if(takeAutoReply(spaceId)&&value.messages.at(-1)?.role==='user')void requestReply(value.messages.at(-1)!.id);}}).catch(error=>{if(live)setLoadError(error.message);});return()=>{live=false;};},[spaceId,takeAutoReply,requestReply]);
  useEffect(()=>{
    if(detail?.replyState!=='processing'||replying)return;
    const timer=setInterval(()=>{void reload().catch(()=>undefined);},2500);
    return()=>clearInterval(timer);
  },[detail?.replyState,replying,reload]);
  useEffect(()=>{
    // Keep follow-up messages and their pending/replied state above the composer.
    // Polling the same message or changing source selection must not steal scroll.
    if(!hasFollowups)return;
    stickToLatest.current=true;
    const frame=requestAnimationFrame(()=>{
      const scroller=chatScrollRef.current;if(!scroller)return;
      scroller.scrollTo({top:scroller.scrollHeight,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });
    return()=>cancelAnimationFrame(frame);
  },[latestMessageId,hasFollowups,replying,detail?.replyState,spaceId]);
  useEffect(()=>{
    const content=chatContentRef.current;if(!content)return;
    const observer=new ResizeObserver(()=>{
      const scroller=chatScrollRef.current;
      if(scroller&&stickToLatest.current&&hasFollowups)scroller.scrollTop=scroller.scrollHeight;
    });
    observer.observe(content);return()=>observer.disconnect();
  },[hasFollowups]);
  const moments=useMemo<SearchMoment[]>(()=>{
    const citations=detail?.messages.slice().reverse().find(message=>message.role==='assistant'&&message.citations?.length)?.citations??[];
    const order=new Map(citations.map((citation,index)=>[citation.momentId,index]));
    return [...(detail?.moments??[])].sort((a,b)=>(order.get(a.id)??Number.MAX_SAFE_INTEGER)-(order.get(b.id)??Number.MAX_SAFE_INTEGER)).map(m=>({id:m.id,label:m.title||m.filename,file:m.filename,folder:'',source:m.source,start:timecode(m.startS),end:timecode(m.endS),durationSec:m.endS-m.startS,totalDuration:'',seekPct:0,score:0,modality:'visual',transcript:m.transcript||m.notes,visualNote:m.description||'',reasoning:m.evidenceStatus==='matched'?'Query checked against source evidence':m.evidenceStatus==='indexed'?'Indexed source evidence':'Saved source range',tags:[]}));
  },[detail]);
  const shortlistedIds=useMemo(()=>detail?.shortlist??[],[detail]);
  const turns:(ChatTurn&{citations?:SpaceCitation[]})[]=(detail?.messages.slice(1)??[]).map(m=>({id:m.id,role:m.role==='assistant'?'brisky':'user',text:m.content,citations:m.citations}));
  const mobileHeader=useMobileLayout();
  const [activeId, setActiveId] = useState<string>('');
  const [momentsOpen,setMomentsOpen]=useState(false);
  const momentsDrawer=useSyncExternalStore(subscribeMomentsDrawer,getMomentsDrawer,serverMomentsDrawer);
  const closeMoments=useCallback(()=>setMomentsOpen(false),[setMomentsOpen]);
  const [citationPlayback,setCitationPlayback]=useState({momentId:'',sequence:0});
  const [followUp, setFollowUp] = useState("");
  const [composerFocused,setComposerFocused]=useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarExpanded, setRightSidebarExpanded] = useState(false);
  const closeStudio = useCallback(() => setRightSidebarOpen(false), [setRightSidebarOpen]);
  useEffect(()=>{
    const updated=(event:Event)=>{if((event as CustomEvent).detail?.spaceId===spaceId)void reload().catch(()=>undefined);};
    const cited=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.spaceId!==spaceId)return;void reload().then(()=>{stickToLatest.current=false;setActiveId(value.momentId);setFilter('all');setRightSidebarOpen(false);setMomentsOpen(true);setCitationPlayback(previous=>({momentId:value.momentId,sequence:previous.sequence+1}));}).catch(()=>undefined);};
    window.addEventListener('brisky-space-updated',updated);window.addEventListener('brisky-open-citation',cited);return()=>{window.removeEventListener('brisky-space-updated',updated);window.removeEventListener('brisky-open-citation',cited);};
  },[spaceId,reload]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    if (moreMenuOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [moreMenuOpen]);

  async function saveShortlist(ids:string[]) {
    if(busyRef.current)return;busyRef.current=true;setSaving(true);setLoadError('');
    try {await spacesFetch(`/${spaceId}/shortlist`,'PUT',{momentIds:ids});await reload();}
    catch(error){setLoadError(error instanceof Error?error.message:'Unable to save shortlist.');}
    finally{busyRef.current=false;setSaving(false);}
  }
  function toggleShortlist(id:string){void saveShortlist(shortlistedIds.includes(id)?shortlistedIds.filter(item=>item!==id):[...shortlistedIds,id]);}
  async function openMomentForm(){
    setAddingMoment(true);setLoadError('');
    try {
      const all:{id:string;filename:string;duration:number}[]=[];let cursor:string|null=null;
      do{const page:{sources:typeof all;nextCursor:string|null}=await spacesFetch(`/${spaceId}/sources${cursor?`?after=${encodeURIComponent(cursor)}`:''}`);all.push(...page.sources);cursor=page.nextCursor;}while(cursor&&all.length<1000);
      setSources(all);if(all[0])setSourceId(all[0].id);
    }catch(error){setLoadError(error instanceof Error?error.message:'Unable to load sources.');}
  }
  async function addMoment(event:FormEvent){
    event.preventDefault();if(busyRef.current)return;busyRef.current=true;setSaving(true);setLoadError('');
    try{await spacesFetch(`/${spaceId}/moments`,'POST',{assetId:sourceId,startS:Number(rangeStart),endS:Number(rangeEnd),...(momentTitle.trim()?{title:momentTitle.trim()}:{})});await reload();void refreshSpaces();setAddingMoment(false);setMomentTitle('');setRangeEnd('');}
    catch(error){setLoadError(error instanceof Error?error.message:'Unable to save source moment.');}
    finally{busyRef.current=false;setSaving(false);}
  }
  async function menuAction(label:string){
    setMoreMenuOpen(false);if(busyRef.current)return;
    if(label==='Delete space'){setDeleteError('');setDeleteOpen(true);return;}
    if(label==='Rename space'){if(!detail)return;setRenameTitle(detail.space.title);setRenameError('');setRenameOpen(true);return;}
    busyRef.current=true;setSaving(true);setLoadError('');
    try {
      if(label==='Pin to sidebar'||label==='Unpin from sidebar'){const pinned=!detail?.space.pinned;await updateSpace(spaceId,{pinned});await reload();notify(pinned?'Space pinned to sidebar':'Space unpinned');}
      else if(label==='Copy space link'){await navigator.clipboard.writeText(`${window.location.origin}/search?space=${spaceId}`);notify('Space link copied');}
      else if(label==='Export messages'&&detail){const blob=new Blob([detail.messages.map(m=>`${m.role}: ${m.content}`).join('\n\n')],{type:'text/plain'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='brisky-space.txt';link.click();URL.revokeObjectURL(url);}
    }catch(error){setLoadError(error instanceof Error?error.message:'Unable to save changes.');}
    finally{busyRef.current=false;setSaving(false);}
  }
  function dismissRename(){
    if(renaming)return;setRenameOpen(false);setTimeout(()=>moreMenuRef.current?.querySelector('button')?.focus(),0);
  }
  async function confirmRename(event:FormEvent){
    event.preventDefault();const title=renameTitle.trim();if(!title||busyRef.current)return;
    busyRef.current=true;setRenaming(true);setRenameError('');
    try{await updateSpace(spaceId,{title});await reload();setRenameOpen(false);notify('Space renamed');setTimeout(()=>moreMenuRef.current?.querySelector('button')?.focus(),0);}
    catch(error){setRenameError(error instanceof Error?error.message:'Unable to rename this space. Please retry.');}
    finally{busyRef.current=false;setRenaming(false);}
  }
  function dismissDelete(){
    if(deleting)return;
    setDeleteOpen(false);
    setTimeout(()=>moreMenuRef.current?.querySelector('button')?.focus(),0);
  }
  async function confirmDelete(){
    if(busyRef.current)return;
    busyRef.current=true;setDeleting(true);setDeleteError('');
    try{await deleteSpace(spaceId);}
    catch(error){setDeleteError(error instanceof Error?error.message:'Unable to delete this space. Please try again.');}
    finally{busyRef.current=false;setDeleting(false);}
  }

  function toggleRightSidebar() {
    setMomentsOpen(false);
    setRightSidebarOpen((prev) => {
      const next = !prev;
      if (!next) setRightSidebarExpanded(false);
      return next;
    });
  }

  const filtered = useMemo(() => {
    if (filter === "all") return moments;
    if (filter === "shortlisted") {
      return moments.filter((m) => shortlistedIds.includes(m.id));
    }
    return moments.filter((m) => m.modality === filter);
  }, [filter, shortlistedIds, moments]);

  const activeMoment =
    filtered.find((m) => m.id === activeId) ?? filtered[0] ?? moments[0];
  const isActiveShortlisted = Boolean(activeMoment && shortlistedIds.includes(activeMoment.id));
  const shortlistedMoments = useMemo(
    () => shortlistedIds.map(id=>moments.find(m=>m.id===id)).filter((m):m is SearchMoment=>Boolean(m)),
    [shortlistedIds, moments],
  );

  function handleFollowUpChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setFollowUp(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }

  async function submitFollowUp(e?: FormEvent) {
    e?.preventDefault();const content=followUp.trim();if(!content||busyRef.current)return;
    busyRef.current=true;setSaving(true);setLoadError('');
    if(pendingMessage.current?.content!==content)pendingMessage.current={id:spaceRequestId(),content};
    let sent:string|null=null;
    try {const result=await spacesFetch<{id:string}>(`/${spaceId}/messages`,'POST',pendingMessage.current);await reload();sent=result.id;pendingMessage.current=null;setFollowUp('');void refreshSpaces();if(textareaRef.current)textareaRef.current.style.height='auto';}
    catch(error){setLoadError(error instanceof Error?error.message:'Unable to save message.');}
    finally{busyRef.current=false;setSaving(false);}
    if(sent)void requestReply(sent);
  }

  function onFollowUpKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitFollowUp();
    }
  }


  const spaceControls=(<>
      {/* Fixed three-dots ellipsis menu outside the right sidebar bar (does not scroll with the chatroom) */}
      {(!rightSidebarExpanded || mobileHeader) && (
        <div
          ref={moreMenuRef}
          className={mobileHeader ? "relative flex items-center" : `absolute top-6 z-40 flex items-center transition-[right] duration-200 ${
            rightSidebarOpen
              ? "hidden md:flex md:right-[408px]"
              : "right-13 sm:right-17"
          }`}
        >
          <AnimateIcon animateOnHover asChild>
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              aria-label="More options in this space"
              aria-expanded={moreMenuOpen}
              className="grid size-10 place-items-center md:size-8 text-brand-muted transition-colors hover:text-brand-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet"
            >
              <MoreHorizontalIcon size={20} />
            </button>
          </AnimateIcon>

          {moreMenuOpen && (
            <div
              role="menu"
              aria-label="Space options"
              className="absolute right-0 top-11 z-50 w-60 rounded-2xl border border-brand-line bg-brand-surface p-2 shadow-[0_16px_42px_rgba(34,40,63,0.14)]"
            >
              <div className="space-y-1">
                {[
                  { label: "Rename space", icon: PencilEdit02Icon },
                  { label: detail?.space.pinned?"Unpin from sidebar":"Pin to sidebar", icon: PinIcon },
                  { label: "Copy space link", icon: Copy01Icon },
                  { label: "Export messages", icon: Download01Icon },
                ].map((item) => {
                  const Icon = item.icon;

  return (
                    <AnimateIcon animateOnHover asChild key={item.label}><button
                      type="button"
                      role="menuitem"
                      onClick={() => void menuAction(item.label)}
                      className="flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-brand-ink transition hover:bg-brand-canvas hover:text-brand-violet"
                    >
                      <Icon className="size-4 shrink-0 text-brand-muted" />
                      <span>{item.label}</span>
                    </button></AnimateIcon>
                  );
                })}
              </div>
              <div className="my-1.5 border-t border-brand-line" />
              <AnimateIcon animateOnHover asChild>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void menuAction("Delete space")}
                  className="flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700"
                >
                  <TrashIcon size={16} />
                  <span>Delete space</span>
                </button>
              </AnimateIcon>
            </div>
          )}
        </div>
      )}

      {/* Top-right sidebar controls (expand to full chatroom width + open/close sidebar trigger) */}
      {!momentsOpen&&<div className={mobileHeader ? "flex items-center" : "absolute right-4 top-6 z-50 flex items-center gap-1 sm:right-8"}>
        {rightSidebarOpen && !mobileHeader && (
          <AnimateIcon animateOnHover asChild>
            <button
              type="button"
              onClick={() => setRightSidebarExpanded((v) => !v)}
              aria-label={
                rightSidebarExpanded
                  ? "Restore studio sidebar width"
                  : "Expand studio sidebar to full chatroom width"
              }
              aria-pressed={rightSidebarExpanded}
              className="hidden size-8 place-items-center text-brand-muted transition-colors hover:text-brand-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet sm:grid"
            >
              {rightSidebarExpanded ? (
                <Minimize01Icon size={18} />
              ) : (
                <Maximize01Icon size={18} />
              )}
            </button>
          </AnimateIcon>
        )}

        <AnimateIcon animateOnHover asChild>
          <button
            type="button"
            onClick={toggleRightSidebar}
            aria-label={rightSidebarOpen ? "Close studio sidebar" : "Open studio sidebar"}
            aria-expanded={rightSidebarOpen}
            className="grid size-10 place-items-center md:size-8 text-brand-muted transition-colors hover:text-brand-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet"
          >
            {mobileHeader ? <PanelRightIcon size={20} /> : rightSidebarOpen ? (
              <PanelRightIcon size={20} />
            ) : (
              <PanelLeftIcon size={20} />
            )}
          </button>
        </AnimateIcon>
      </div>}

  </>);

                  const momentsContent=activeMoment&&<>
          {/* Brisky's response on the left: compact 52px Brisky mascot avatar + natural response */}
          <div className="min-w-0">

            <div className="@container/results min-w-0 w-full flex-1 pt-0.5 sm:pt-1">


              {/* Modality filter pills + shortlist bar inside Brisky's response just above the search results */}
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: "all", label: `All (${moments.length})` },
                      { id: "shortlisted", label: `Shortlisted (${shortlistedIds.length})` },
                    ] as const
                  ).map((tab) => {
                    const active = filter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFilter(tab.id)}
                        className={`rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium transition ${
                          active
                            ? "bg-brand-action text-white"
                            : "border border-brand-line bg-brand-surface text-brand-muted hover:border-brand-violet/40 hover:text-brand-ink"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {shortlistedIds.length > 0 && (
                  <AnimateIcon animateOnHover asChild><button
                    type="button"
                    onClick={() => {setMomentsOpen(false);setRightSidebarOpen(true);}}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-violet/35 bg-brand-violet/10 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-brand-violet transition hover:bg-brand-action hover:text-white"
                  >
                    <CheckIcon size={14} />
                    <span>View {shortlistedIds.length} shortlisted</span>
                  </button></AnimateIcon>
                )}
              </div>

              {/* Container-responsive 7/12 left (larger 2-column cards) + 5/12 right (main match inspector) */}
              <div className="mt-4 flex flex-col gap-5">
                {/* Left side: 7/12 width, 2-column grid of larger result cards (or direct empty state when Shortlisted is empty) */}
                {filtered.length === 0 ? (
                  <section
                    aria-label="Empty shortlist"
                    className="flex flex-col items-center justify-center px-6 py-14 text-center @3xl/results:col-span-7"
                  >
                    {/* Minimalist stacked-frames illustration directly on the page */}
                    <div className="relative mb-4 grid size-14 place-items-center rounded-2xl bg-brand-violet/10 text-brand-violet">
                      <svg
                        viewBox="0 0 40 40"
                        className="size-8"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden
                      >
                        <rect
                          x="6"
                          y="10"
                          width="22"
                          height="16"
                          rx="3.5"
                          stroke="#7363de"
                          strokeWidth="1.8"
                          strokeOpacity="0.45"
                        />
                        <rect
                          x="11"
                          y="14"
                          width="23"
                          height="16"
                          rx="3.5"
                          fill="#ffffff"
                          stroke="#7363de"
                          strokeWidth="1.8"
                        />
                        <path
                          d="M22.5 19V25M19.5 22H25.5"
                          stroke="#7363de"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>

                    <h2 className="text-sm font-semibold text-brand-ink">
                      No shortlisted assets yet
                    </h2>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-brand-muted">
                      Select any moment from your search results to queue it for synthesis briefs, quote sheets, or rough cut reels in Space Studio.
                    </p>

                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFilter("all")}
                        className="rounded-xl border border-brand-line bg-brand-surface px-3.5 py-2 text-xs font-semibold text-brand-ink transition hover:border-brand-violet/40 hover:text-brand-violet"
                      >
                        Browse all {moments.length} moments
                      </button>
                      <AnimateIcon animateOnHover asChild><button
                        type="button"
                        onClick={() => moments[0] && toggleShortlist(moments[0].id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-action px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-action-hover"
                      >
                        <Add01Icon size={14} />
                        <span>Shortlist top match</span>
                      </button></AnimateIcon>
                    </div>
                  </section>
                ) : (
                  <section
                    aria-label="Saved source moments"
                    className="grid grid-cols-1 gap-4 @sm/results:grid-cols-2 @3xl/results:col-span-7"
                  >
                    {filtered.map((moment, index) => {
                      const isSelected = moment.id === activeMoment.id;
                      const isTopMatch = index === 0;
                      const isShortlisted = shortlistedIds.includes(moment.id);

                      return (
                        <article
                          key={moment.id}
                          onClick={() => setActiveId(moment.id)}
                          className={`group relative aspect-[16/11] w-full cursor-pointer overflow-hidden rounded-2xl border bg-brand-canvas transition ${
                            isSelected
                              ? "border-brand-violet ring-3 ring-brand-violet/15"
                              : "border-brand-line hover:border-brand-violet/45 hover:shadow-[0_8px_22px_rgba(115,99,222,0.09)]"
                          }`}
                        >
                          {/* Thumbnail graphic */}
                          <MomentThumbnail spaceId={spaceId} momentId={moment.id} label={moment.label}/>

                          {/* Overlay: Label + Percentage match (top), Timestamps + Shortlist button (bottom) */}
                          <div className="absolute inset-0 flex flex-col justify-between p-3.5">
                            <div className="flex items-center justify-between gap-2 text-xs font-medium">
                              <span className="truncate rounded-md bg-brand-surface/92 px-2.5 py-0.5 text-brand-ink shadow-2xs backdrop-blur-2xs">
                                Source range
                              </span>
                              <span
                                className={`shrink-0 rounded-md px-2 py-0.5 font-semibold tabular-nums shadow-2xs backdrop-blur-2xs ${
                                  isSelected || isTopMatch
                                    ? "bg-brand-action text-white"
                                    : "bg-brand-surface/92 text-brand-ink"
                                }`}
                              >
                                Saved
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span className="shrink-0 whitespace-nowrap rounded-md bg-brand-ink/85 px-2.5 py-0.5 text-xs font-medium tabular-nums text-white backdrop-blur-2xs">
                                {moment.start} – {moment.end}
                              </span>

                              <AnimateIcon animateOnHover asChild><button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleShortlist(moment.id);
                                }}
                                aria-label={
                                  isShortlisted
                                    ? "Remove asset from shortlist"
                                    : "Shortlist asset for processing"
                                }
                                title={
                                  isShortlisted
                                    ? "Shortlisted — click to remove"
                                    : "Shortlist asset for processing"
                                }
                                aria-pressed={isShortlisted}
                                className={`grid size-6 shrink-0 place-items-center rounded-md shadow-2xs backdrop-blur-2xs transition ${
                                  isShortlisted
                                    ? "bg-brand-action text-white"
                                    : "bg-brand-surface/92 text-brand-ink hover:bg-brand-action hover:text-white"
                                }`}
                              >
                                {isShortlisted ? (
                                  <CheckIcon size={14} />
                                ) : (
                                  <Add01Icon size={14} />
                                )}
                              </button></AnimateIcon>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                )}

                {/* Right side: 5/12 width, responsive main inspector card */}
                <aside className="@container/inspector order-first w-full overflow-hidden rounded-2xl border border-brand-line bg-brand-surface shadow-[0_12px_32px_rgba(34,40,63,0.06)]">
                  {detail?.moments.find(m=>m.id===activeMoment.id) && <SourcePreview key={`${activeMoment.id}:${citationPlayback.momentId===activeMoment.id?citationPlayback.sequence:0}`} autoPlay={citationPlayback.momentId===activeMoment.id} spaceId={spaceId} moment={detail.moments.find(m=>m.id===activeMoment.id)!}/>}

                  {/* Responsive card body */}
                  <div className="space-y-3.5 p-4 @sm/inspector:p-5">
                    {/* Full-width Title + File & Modality row */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold leading-snug text-brand-ink">
                          {activeMoment.label}
                        </h3>
                        <p className="mt-0.5 truncate text-xs sm:text-sm text-brand-muted">
                          {activeMoment.file}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-brand-canvas px-2.5 py-0.5 text-xs font-medium text-brand-muted">
                        Source range
                      </span>
                    </div>

                    {/* Prominent collapsible details bar */}
                    <AnimateIcon animateOnHover asChild><button
                      type="button"
                      onClick={() => setDetailsOpen((v) => !v)}
                      aria-expanded={detailsOpen}
                      className="flex w-full items-center justify-between rounded-xl border border-brand-line/80 bg-brand-canvas/55 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-brand-ink transition hover:border-brand-violet/35 hover:text-brand-violet"
                    >
                      <span>Moment details & notes</span>
                      <span className="inline-flex items-center gap-1 text-brand-violet">
                        <span>{detailsOpen ? "Hide" : "Show"}</span>
                        {detailsOpen ? (
                          <ArrowUp01Icon size={16} />
                        ) : (
                          <ArrowDown01Icon size={16} />
                        )}
                      </span>
                    </button></AnimateIcon>

                    {detailsOpen && (
                      <>
                        {/* Transcript / Quote callout */}
                        <div className="rounded-xl bg-brand-canvas/80 p-3.5">
                          <div className="flex items-center justify-between gap-2 text-xs font-medium text-brand-muted">
                            <span>{detail?.moments.find(m=>m.id===activeMoment.id)?.transcript?'Indexed transcript':'Notes'}</span>
                            <span>@{activeMoment.start}</span>
                          </div>
                          <p className="mt-1.5 border-l-2 border-brand-violet pl-2.5 text-sm leading-relaxed text-brand-ink">
                            {activeMoment.transcript || 'No notes added.'}
                          </p>
                        </div>

                        {/* Compact responsive metadata grid */}
                        <dl className="grid grid-cols-1 gap-3 border-t border-brand-line pt-3 text-xs sm:text-sm @sm/inspector:grid-cols-2">
                          <div className="min-w-0">
                            <dt className="text-xs font-medium text-brand-muted">
                              Saved reference
                            </dt>
                            <dd className="mt-0.5 leading-snug text-brand-ink">
                              {activeMoment.reasoning}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs font-medium text-brand-muted">
                              Source location
                            </dt>
                            <dd className="mt-0.5 truncate font-medium text-brand-ink">
                              {activeMoment.source} · {activeMoment.file}
                            </dd>
                            <dd className="mt-0.5 line-clamp-1 text-xs text-brand-muted">
                              {activeMoment.visualNote}
                            </dd>
                          </div>
                        </dl>
                      </>
                    )}

                    {/* Dedicated footer action bar for shortlisting the active asset */}
                    <div className="border-t border-brand-line pt-3">
                      <AnimateIcon animateOnHover asChild><button
                        type="button"
                        onClick={() => toggleShortlist(activeMoment.id)}
                        aria-pressed={isActiveShortlisted}
                        className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition ${
                          isActiveShortlisted
                            ? "bg-brand-action text-white hover:bg-brand-action-hover"
                            : "border border-brand-line bg-brand-canvas/60 text-brand-ink hover:border-brand-violet/45 hover:bg-brand-violet/8 hover:text-brand-violet"
                        }`}
                      >
                        {isActiveShortlisted ? (
                          <>
                            <CheckIcon size={16} />
                            <span>Shortlisted for processing</span>
                          </>
                        ) : (
                          <>
                            <Add01Icon size={16} />
                            <span>Shortlist asset for processing</span>
                          </>
                        )}
                      </button></AnimateIcon>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>

          </>;
  return (
    <div className="relative z-10 flex h-full w-full min-w-0 flex-1 self-stretch overflow-hidden">
      {/* Dedicated fixed background design for the Space chatroom */}
      <SpaceBackground />
      {toast&&createPortal(<div role="status" aria-live="polite" className="fixed left-1/2 top-[max(5rem,env(safe-area-inset-top))] z-[100] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-brand-violet/20 bg-brand-ink px-4 py-3 text-sm text-white shadow-xl"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-action"><CheckIcon size={14}/></span><span>{toast.message}</span><AnimateIcon animateOnHover asChild><button type="button" aria-label="Dismiss notification" onClick={()=>setToast(null)} className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-brand-surface/10"><FactoryClose size={16}/></button></AnimateIcon></div>,document.body)}
      <ConnectorDialog open={renameOpen} onDismiss={dismissRename} title="Rename space" panelClassName="md:max-w-[460px]">
        <span aria-hidden="true" className="mb-5 grid size-12 place-items-center rounded-2xl bg-brand-violet/10 text-brand-violet"><PencilEdit02Icon size={23}/></span>
        <h2 className="text-xl font-semibold tracking-tight">Rename space</h2><p className="mt-2 text-sm leading-relaxed text-brand-muted">Give this conversation a name you can find again.</p>
        <form onSubmit={confirmRename} className="mt-5"><label htmlFor="space-name" className="mb-2 block text-sm font-medium">Space name</label><input id="space-name" autoFocus required maxLength={200} value={renameTitle} disabled={renaming} onChange={event=>setRenameTitle(event.target.value)} className="h-12 w-full rounded-xl border border-brand-line bg-brand-surface px-4 text-base outline-none focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/15 disabled:opacity-50"/>
        {renameError&&<p role="alert" className="mt-3 text-sm text-red-700">{renameError}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" disabled={renaming} onClick={dismissRename} className="rounded-xl border border-brand-line px-4 py-3 text-sm font-medium hover:bg-brand-canvas disabled:opacity-50">Cancel</button><AnimateIcon animateOnHover asChild><button type="submit" disabled={renaming||!renameTitle.trim()} aria-busy={renaming} className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-4 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">{renaming?<LoaderCircle size={16} className="animate-spin motion-reduce:animate-none"/>:<CheckIcon size={16}/>} {renaming?'Saving?':'Save name'}</button></AnimateIcon></div></form>
      </ConnectorDialog>

      <ConnectorDialog open={deleteOpen} onDismiss={dismissDelete} title="Delete space?" alert panelClassName="md:max-w-[460px]">
        <span aria-hidden="true" className="mb-5 grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600"><TrashIcon size={24}/></span>
        <h2 className="text-xl font-semibold tracking-tight">Delete this space?</h2>
        <p className="mt-3 text-sm leading-relaxed text-brand-muted">This will permanently delete {detail?.space.title?<strong className="font-medium text-brand-ink">{detail.space.title}</strong>:'this space'}, including its messages, saved moments and shortlist. Your original media will stay in your library.</p>
        {deleteError&&<p role="alert" className="mt-4 text-sm text-red-600">{deleteError}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" autoFocus disabled={deleting} onClick={dismissDelete} className="rounded-xl border border-brand-line px-4 py-3 text-sm font-semibold transition hover:bg-brand-canvas disabled:opacity-50">Keep space</button>
          <AnimateIcon animateOnHover asChild><button type="button" disabled={deleting} aria-busy={deleting} onClick={()=>void confirmDelete()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60">{deleting?<LoaderCircle size={16} className="animate-spin motion-reduce:animate-none"/>:<TrashIcon size={16}/>}<span>{deleting?'Deleting…':'Delete space'}</span></button></AnimateIcon>
        </div>
      </ConnectorDialog>

      {mobileHeader ? (mobileActionsHost && createPortal(spaceControls,mobileActionsHost)) : spaceControls}

      {/* Main scrollable Space section — owns its own thin scrollbar and shifts left when the fixed 100dvh right sidebar opens */}
      <div
        className={`relative z-10 flex h-full min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          momentsOpen ? "xl:mr-[min(44vw,600px)]" : rightSidebarOpen ? "md:mr-96" : "mr-0"
        }`}
      >
        <div ref={chatScrollRef} aria-label="Space chat" onWheel={event=>{if(event.deltaY<0)stickToLatest.current=false;}} onTouchStart={()=>{stickToLatest.current=false;}} onKeyDown={event=>{if(['ArrowUp','PageUp','Home'].includes(event.key))stickToLatest.current=false;}} onScroll={event=>{const el=event.currentTarget;if(el.scrollHeight-el.scrollTop-el.clientHeight<40)stickToLatest.current=true;}} className="thin-scrollbar mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-y-auto px-4 pb-8 pt-6 sm:px-8 lg:px-10">
          <div ref={chatContentRef} className="flex shrink-0 flex-col">
          {/* Top bar: "Spaces" title at top-left */}
          <header className="hidden min-h-8 items-center justify-between gap-4 pr-20 md:flex">
            <h1 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-[28px]">
              Spaces
            </h1>
          </header>

          {/* Centered date & time of the search, with generous breathing room below the top bar */}
          <div className="mt-2 flex justify-center md:mt-10">
            <time className="rounded-full border border-brand-line/70 bg-brand-surface/85 px-3.5 py-1 text-xs font-medium text-brand-muted backdrop-blur-xs">
              {detail?formatChatTime(detail.space.createdAt,clock): 'Loading space…'}
            </time>
          </div>

          {/* Initial search prompt on the right with user avatar */}
          <div className="mt-4 flex justify-end">
            <div className="flex items-end gap-2.5">
              <div className="max-w-xl whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-brand-action px-4 py-3 text-sm sm:text-base text-white shadow-[0_6px_20px_rgba(115,99,222,0.18)]">
                {detail?.space.query||initialQuery}
              </div>
              <UserAvatar initial={profileInitial} />
            </div>
          </div>

          {loadError&&<p role="alert" className="mt-5 text-sm text-red-600">{loadError} <button className="underline" onClick={()=>void reload().then(()=>setLoadError('')).catch(e=>setLoadError(e.message))}>Retry loading</button></p>}
          {!detail&&!loadError&&<p role="status" className="mt-8 text-sm text-brand-muted">Loading your space…</p>}
          {detail&&!moments.length&&!replying&&detail.replyState!=='processing'&&<section className="mt-8 rounded-2xl border border-brand-line bg-brand-surface/70 p-5"><h2 className="font-semibold">Your space is ready</h2><p className="mt-2 text-sm text-brand-muted">No source moments have been added yet. Your conversation is saved here.</p></section>}


          {/* Gradual transition into a chat session with Brisky when the user sends follow-ups */}
          {turns.length > 0 && (
            <section
              aria-label="Session conversation with Brisky"
              className="mt-8 space-y-5 border-t border-brand-line pt-6"
            >
              {turns.map((turn) =>
                turn.role === "user" ? (
                  <div key={turn.id} className="flex items-end justify-end gap-2.5">
                    <div className="max-w-xl whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-brand-action px-4 py-2.5 text-sm sm:text-base text-white">
                      {turn.text}
                    </div>
                    <UserAvatar initial={profileInitial} />
                  </div>
                ) : (
                  <div key={turn.id} className="flex items-start gap-2.5">
                    <BriskyMascotAvatar />
                    <div className="min-w-0 max-w-2xl pt-2"><p className="whitespace-pre-wrap break-words text-sm sm:text-base leading-relaxed text-brand-ink">{turn.text}</p>
                      {Boolean(turn.citations?.length)&&<div className="mt-3 flex flex-wrap gap-2" aria-label="Reply sources">{turn.citations?.map(citation=><ReplyCitation key={citation.momentId} citation={citation} onOpen={()=>{stickToLatest.current=false;setActiveId(citation.momentId);setFilter('all');setRightSidebarOpen(false);setMomentsOpen(true);setCitationPlayback(previous=>({momentId:citation.momentId,sequence:previous.sequence+1}));}}/>)}</div>}
                      <ResponseActions messageId={turn.id} text={turn.text} onSources={turn.citations?.length?()=>{stickToLatest.current=false;setActiveId(turn.citations![0].momentId);setFilter('all');setRightSidebarOpen(false);setMomentsOpen(true);}:undefined}/>
                    </div>
                  </div>
                ),
              )}
            </section>
          )}

          {/* Bottom conversational composer */}

          {detail?.messages.at(-1)?.role==='user'&&!replying&&detail.replyState!=='processing'&&<button type="button" disabled={saving} onClick={()=>void requestReply(detail.messages.at(-1)!.id)} className="mt-4 self-start rounded-xl border border-brand-violet/30 bg-brand-surface px-4 py-2 text-sm font-medium text-brand-violet">{detail.replyState==='failed'?'Retry Brisky reply':'Ask Brisky'}</button>}
          </div></div>
          <div className="relative z-30 mx-auto w-full max-w-[752px] shrink-0 px-4 pb-5 pt-3">
            <SpaceCompanion busy={replying||detail?.replyState==='processing'} initialSearch={!detail?.messages.some(m=>m.role==='assistant')} failed={!!loadError||detail?.replyState==='failed'} focused={composerFocused} hasReply={!!detail?.messages.some(m=>m.role==='assistant')} hasSources={!!detail?.messages.filter(m=>m.role==='assistant').at(-1)?.citations?.length} loading={!detail&&!loadError}/>

            {moments.length>0&&<div className="mb-2 flex justify-end"><AnimateIcon animateOnHover asChild><button type="button" aria-expanded={momentsOpen} onClick={()=>{setRightSidebarOpen(false);setMomentsOpen(open=>!open);}} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand-line bg-brand-surface/95 px-3 text-sm font-medium shadow-sm transition hover:border-brand-violet/40 hover:text-brand-violet"><ClapperboardIcon size={17}/>Moments<span className="rounded-md bg-brand-violet/10 px-1.5 py-0.5 text-xs text-brand-violet">{moments.length}</span></button></AnimateIcon></div>}
            <form
              onSubmit={submitFollowUp}
              className="flex items-end gap-2.5 rounded-2xl border border-brand-line bg-brand-surface/95 px-3.5 py-2 shadow-[0_14px_40px_rgba(34,40,63,0.14)] backdrop-blur-md transition focus-within:border-brand-violet focus-within:ring-4 focus-within:ring-brand-violet/15"
            >
              <span className="mb-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-brand-violet/10 text-sm text-brand-violet [font-family:var(--font-logo),sans-serif]">
                b.
              </span>
              <label htmlFor="session-followup" className="sr-only">
                Continue this session with Brisky
              </label>
              <textarea
                ref={textareaRef}
                id="session-followup"
                onFocus={()=>setComposerFocused(true)}
                onBlur={()=>setComposerFocused(false)}
                rows={1}
                value={followUp}
                onChange={handleFollowUpChange}
                onKeyDown={onFollowUpKeyDown}
                placeholder="Chat with Brisky…"
                className="thin-scrollbar max-h-36 min-h-7 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-sm sm:text-base leading-relaxed text-brand-ink outline-none placeholder:text-brand-muted/70"
              />
              <AnimateIcon animateOnHover asChild><button type="button" aria-label="Open voice mode" title="Voice mode" disabled={!detail||replying||detail.replyState==='processing'} onClick={()=>setVoiceOpen(true)} className="grid size-9 shrink-0 place-items-center rounded-xl text-brand-violet hover:bg-brand-violet/10 disabled:opacity-40"><FactoryAudio size={19}/></button></AnimateIcon>
              <AnimateIcon animateOnHover asChild>
                <button
                  type="submit"
                  disabled={!followUp.trim() || saving || replying || detail?.replyState==='processing' || !detail}
                  aria-busy={saving||replying}
                  aria-label="Send to Brisky"
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-action text-white transition hover:bg-brand-action-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand-action"
                >
                  {saving?<LoaderCircle size={16} className="animate-spin motion-reduce:animate-none"/>:<SendHorizontalIcon size={16} />}
                </button>
              </AnimateIcon>
            </form>
          </div>
      </div>

      <StudioPanel mobile={momentsDrawer} open={momentsOpen} expanded={false} onClose={closeMoments} label="Source moments" width="w-[min(44vw,600px)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-brand-line pb-4 pr-10 xl:pr-0"><div><h2 className="text-lg font-semibold">Moments <span className="text-brand-muted">{moments.length}</span></h2><p className="mt-1 text-sm text-brand-muted">Watch sources without leaving your conversation.</p></div>{!momentsDrawer&&<AnimateIcon animateOnHover asChild><button type="button" onClick={closeMoments} aria-label="Close source moments" className="grid size-9 shrink-0 place-items-center rounded-lg border border-brand-line hover:bg-brand-canvas"><PanelRightIcon size={18}/></button></AnimateIcon>}</header>
        <div data-moments-content className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">{momentsOpen&&<>
        <button type="button" disabled={!detail||saving} onClick={()=>void openMomentForm()} className="mt-4 self-start rounded-xl border border-brand-line px-3 py-2 text-sm font-medium text-brand-violet disabled:opacity-40">Add source moment</button>
        {addingMoment&&<form onSubmit={addMoment} className="mt-3 max-h-[45dvh] shrink-0 space-y-2 overflow-y-auto rounded-xl bg-brand-canvas p-3 text-sm">
          <p className="font-medium">Save a range from your library</p>
          {sources===null?<p role="status">Loading sources…</p>:sources.length===0?<p>No files in your library yet. Connect or upload files first.</p>:<>
            <div className="block"><span>Source</span><AppSelect label="Source" searchable value={sourceId} onValueChange={setSourceId} options={sources.map(source=>({value:source.id,label:source.filename}))}/></div>
            <div className="grid grid-cols-2 gap-2"><label>Start (seconds)<input required type="number" min="0" step="any" value={rangeStart} onChange={e=>setRangeStart(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-line bg-brand-surface p-2"/></label><label>End (seconds)<input required type="number" min="0" step="any" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-line bg-brand-surface p-2"/></label></div>
            <label className="block">Title (optional)<input maxLength={500} value={momentTitle} onChange={e=>setMomentTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-line bg-brand-surface p-2"/></label>
            <button disabled={saving} aria-busy={saving} className="rounded-lg bg-brand-action px-3 py-2 text-white disabled:opacity-40">{saving?'Saving…':'Save moment'}</button>
          </>}
          <button type="button" onClick={()=>setAddingMoment(false)} className="ml-2 px-2 py-2">Cancel</button>
        </form>}
{momentsContent}</>}</div>
      </StudioPanel>

      <StudioPanel mobile={mobileHeader} open={rightSidebarOpen} expanded={rightSidebarExpanded} onClose={closeStudio}>
        <SpaceStudio spaceId={spaceId} moments={shortlistedMoments} busy={saving} onBrowse={()=>{setRightSidebarOpen(false);setMomentsOpen(true);setFilter('all');}} onOpen={id=>{stickToLatest.current=false;setActiveId(id);setFilter('all');setRightSidebarOpen(false);setMomentsOpen(true);setCitationPlayback(previous=>({momentId:id,sequence:previous.sequence+1}));}} onReorder={ids=>void saveShortlist(ids)} onRemove={toggleShortlist} onClear={()=>void saveShortlist([])}/>
      </StudioPanel>
    </div>
  );
}
