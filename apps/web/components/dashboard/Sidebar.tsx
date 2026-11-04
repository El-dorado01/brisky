"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

// Official Animate UI Hugeicons
import { PinIcon } from "@/components/animate-ui/icons/hugeicons/pin";
import { Search01Icon } from "@/components/animate-ui/icons/hugeicons/search-01";
import { WorkflowIcon } from "@/components/animate-ui/icons/hugeicons/workflow";
import { ClapperboardIcon } from "@/components/animate-ui/icons/hugeicons/clapperboard";
import { UsersIcon } from "@/components/animate-ui/icons/hugeicons/users";
import { Layers01Icon } from "@/components/animate-ui/icons/hugeicons/layers-01";
import { PanelLeftIcon } from "@/components/animate-ui/icons/hugeicons/panel-left";
import { PanelRightIcon } from "@/components/animate-ui/icons/hugeicons/panel-right";
import { ComputerTerminal01Icon } from "@/components/animate-ui/icons/hugeicons/computer-terminal-01";
import { ArrowDown01Icon } from "@/components/animate-ui/icons/hugeicons/arrow-down-01";
import { ArrowUpDownIcon } from "@/components/animate-ui/icons/hugeicons/arrow-up-down";
import { UserIcon } from "@/components/animate-ui/icons/hugeicons/user";
import { Settings02Icon } from "@/components/animate-ui/icons/hugeicons/settings-02";
import { UserAdd01Icon } from "@/components/animate-ui/icons/hugeicons/user-add-01";
import { Logout01Icon } from "@/components/animate-ui/icons/hugeicons/logout-01";
import { FactoryClose as X } from "@/components/connectors/FactoryIcons";
import { Check } from "lucide-react";

import { useSpaces } from "@/lib/spaces-context";

const primaryNav = [
  { href: "/search", label: "Search", Icon: Search01Icon },
  { href: "/factory", label: "Factory", Icon: WorkflowIcon },
  { href: "/studio", label: "Studio", Icon: ClapperboardIcon },
  { href: "/entities", label: "People & Entities", Icon: UsersIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [currentUser, setCurrentUser] = useState<{name:string;email:string}|null>(null);
  const profileName=currentUser?.name || currentUser?.email || 'Your profile';
  const profileEmail=currentUser?.email || 'Not signed in';
  const profileInitial=(currentUser?.name || currentUser?.email || '?').charAt(0).toUpperCase();
  useEffect(()=>{
    let active=true;
    const refresh=()=>{void fetch('/api/auth/session',{cache:'no-store'}).then(async response=>{
      if(!response.ok){if(active)setCurrentUser(null);return;}
      const result=await response.json();if(active)setCurrentUser(result.user);
    }).catch(()=>{});};
    refresh();window.addEventListener('brisky-profile-updated',refresh);
    return()=>{active=false;window.removeEventListener('brisky-profile-updated',refresh);};
  },[pathname]);
  const [addAccountModalOpen, setAddAccountModalOpen] = useState(false);
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [accountAddedFeedback, setAccountAddedFeedback] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { spaces, activeSpaceId, selectSpace, setMobileActionsHost, loading:spacesLoading, error:spacesError, refreshSpaces } = useSpaces();
  const singleSpace=pathname==='/search' && Boolean(activeSpaceId);
  const mobilePageTitle=singleSpace ? 'Spaces' : ({
    '/entities':'People & Entities','/studio':'Studio','/factory':'Factory',
    '/settings':'Settings','/developer':'Developer','/entity/new':'Teach Brisky','/entities/new':'Teach Brisky',
  } as Record<string,string>)[pathname] || 'Brisky';
  const searchHome=pathname==='/search' && !singleSpace;
  useEffect(()=>{
    if(!mobileOpen)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobileOpen(false);};
    window.addEventListener('keydown',close);
    return ()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',close);};
  },[mobileOpen]);

  // Close user dropdown menu when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

  const linkClass = (active: boolean, isCollapsed = false) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      isCollapsed ? "justify-center" : ""
    } ${
      active
        ? "bg-brand-violet/10 !text-brand-violet"
        : "!text-brand-muted hover:bg-brand-canvas hover:!text-brand-ink"
    }`;

  function handleOpenSpace(id: string) {
    selectSpace(id);
    setMobileOpen(false);
  }

  function handleToggleSpaces() {
    if (collapsed) {
      setCollapsed(false);
      setSpacesOpen(true);
    } else {
      setSpacesOpen((prev) => !prev);
    }
  }

  function handleNavigate(path: string) {
    setUserMenuOpen(false);
    setMobileOpen(false);
    router.push(path);
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Logout failed');
      // Drop the in-memory app/router state as well as the server session cookie.
      window.location.replace('/login');
    } catch {
      window.alert('Unable to log out. Please try again.');
      setLoggingOut(false);
    }
  }

  function handleOpenAddAccount() {
    setUserMenuOpen(false);
    setAddAccountModalOpen(true);
    setAccountAddedFeedback(false);
    setNewAccountEmail("");
  }

  function handleAddAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccountEmail.trim()) return;
    setAccountAddedFeedback(true);
    setTimeout(() => {
      setAddAccountModalOpen(false);
      setAccountAddedFeedback(false);
    }, 1200);
  }

  const isSpacesParentActive = pathname === "/search" && Boolean(activeSpaceId);

  function renderNavContent(isCollapsed: boolean) {
    return (
      <>
        <nav
          className="thin-scrollbar mt-8 flex min-h-0 flex-1 flex-col overflow-y-auto pr-0.5"
          aria-label="Main"
        >
          {/* Primary sidebar items using official Animate UI Hugeicons */}
          <div className="flex flex-col gap-1">
            {primaryNav.map(({ href, label, Icon }) => {
              const isSearch = href === "/search";
              const isActive = isSearch
                ? pathname === "/search" && !activeSpaceId
                : pathname === href;

              return (
                <AnimateIcon key={href} animateOnHover asChild>
                  <Link
                    href={href}
                    onClick={() => {
                      if (isSearch) selectSpace(null);
                      setMobileOpen(false);
                    }}
                    title={isCollapsed ? label : undefined}
                    aria-label={isCollapsed ? label : undefined}
                    aria-current={isActive ? "page" : undefined}
                    className={linkClass(isActive, isCollapsed)}
                  >
                    <Icon size={19} className="shrink-0" />
                    {!isCollapsed && <span className="truncate">{label}</span>}
                  </Link>
                </AnimateIcon>
              );
            })}
          </div>

          {/* Collapsible Spaces section */}
          <div className="mt-4">
            <AnimateIcon animateOnHover asChild>
              <button
                type="button"
                onClick={handleToggleSpaces}
                title={isCollapsed ? "Spaces" : undefined}
                aria-label={isCollapsed ? "Spaces" : undefined}
                aria-expanded={!isCollapsed ? spacesOpen : undefined}
                className={`w-full ${linkClass(isSpacesParentActive && !spacesOpen, isCollapsed)}`}
              >
                <Layers01Icon size={19} className="shrink-0" />
                {!isCollapsed && (
                  <>
                    <span className="flex-1 text-left">Spaces</span>
                    <motion.span
                      animate={{ rotate: spacesOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="inline-flex shrink-0 items-center justify-center text-brand-muted"
                    >
                      <ArrowDown01Icon size={15} />
                    </motion.span>
                  </>
                )}
              </button>
            </AnimateIcon>

            {!isCollapsed && spacesOpen && (
              <ul className="ml-5 mt-1.5 space-y-1 pl-2.5">
                {spacesLoading && <li className="px-2.5 py-2 text-xs text-brand-muted">Loading spaces…</li>}
                {spacesError && <li className="px-2.5 py-2 text-xs text-brand-muted" role="alert">{spacesError} <button onClick={()=>void refreshSpaces()} className="text-brand-violet underline">Retry</button></li>}
                {!spacesLoading && !spacesError && spaces.length===0 && <li className="px-2.5 py-2 text-xs text-brand-muted">Your spaces will appear here.</li>}
                {spaces.map((space) => {
                  const active = pathname === "/search" && activeSpaceId === space.id;
                  return (
                    <li key={space.id}>
                      <button
                        type="button"
                        onClick={() => handleOpenSpace(space.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                          active
                            ? "bg-brand-violet/10 font-semibold text-brand-violet"
                            : "text-brand-muted hover:bg-brand-canvas hover:text-brand-ink"
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">{space.pinned&&<span className="shrink-0 text-brand-violet" aria-label="Pinned space"><PinIcon size={14}/></span>}<span className="truncate">{space.title}</span></span>
                        <span className="shrink-0 text-xs text-brand-muted/80">
                          {space.momentsCount}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </nav>

        {/* Fixed bottom: Developer link (outside scrollable nav, directly above user info) */}
        <div className="mt-auto shrink-0 pt-2">
          <AnimateIcon animateOnHover asChild>
            <Link
              href="/developer"
              onClick={() => {
                if (mobileOpen) setMobileOpen(false);
              }}
              title={isCollapsed ? "Developer" : undefined}
              aria-label={isCollapsed ? "Developer" : undefined}
              aria-current={pathname === "/developer" ? "page" : undefined}
              className={linkClass(pathname === "/developer", isCollapsed)}
            >
              <ComputerTerminal01Icon size={19} className="shrink-0" />
              {!isCollapsed && <span className="truncate">Developer</span>}
            </Link>
          </AnimateIcon>
        </div>

        {/* ===================================================================
            USER INFO & ACTION MENU (Clean, border-free, interactive)
            With official Animate UI Hugeicons for Profile, Settings, Add account, and Logout.
            =================================================================== */}
        <div ref={userMenuRef} className="relative mt-2 shrink-0">
          {/* User Trigger Button */}
          <AnimateIcon animateOnHover asChild><button
            type="button"
            onClick={() => setUserMenuOpen((prev) => !prev)}
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            title={isCollapsed ? `${profileName} (${profileEmail})` : undefined}
            className={`group flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-brand-canvas ${
              isCollapsed ? "justify-center" : ""
            } ${userMenuOpen ? "bg-brand-canvas ring-2 ring-brand-violet/20" : ""}`}
          >
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-action text-xs font-semibold text-white shadow-2xs transition group-hover:scale-105"
            >
              {profileInitial}
            </span>
            {!isCollapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight text-brand-ink">
                    {profileName}
                  </p>
                  <p className="truncate text-xs text-brand-muted">{profileEmail}</p>
                </div>
                <ArrowUpDownIcon
                  size={16}
                  className="shrink-0 text-brand-muted/70 transition group-hover:text-brand-ink"
                />
              </>
            )}
          </button></AnimateIcon>

          {/* Popover Menu with official Animate UI Hugeicons */}
          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                role="menu"
                aria-label="User account actions"
                className={`absolute z-50 rounded-2xl border border-brand-line/80 bg-brand-surface p-1.5 shadow-[0_16px_40px_rgba(34,40,63,0.14)] backdrop-blur-md ${
                  isCollapsed
                    ? "bottom-0 left-full ml-3 w-64"
                    : "bottom-full left-0 mb-2 w-full min-w-[240px]"
                }`}
              >
                {/* Account Card Header */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-action text-xs font-semibold text-white shadow-2xs">
                    {profileInitial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-brand-ink">
                      {profileName}
                    </p>
                    <p className="truncate text-xs text-brand-muted">
                      {profileEmail}
                    </p>
                  </div>
                </div>

                <div className="my-1 h-px bg-brand-line/60" />

                {/* Profile */}
                <AnimateIcon animateOnHover asChild>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleNavigate("/settings?section=profile")}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-brand-ink transition hover:bg-brand-canvas"
                  >
                    <UserIcon size={17} className="text-brand-muted" />
                    <span>Profile</span>
                  </button>
                </AnimateIcon>

                {/* Settings (Moved inside user menu) */}
                <AnimateIcon animateOnHover asChild>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleNavigate("/settings")}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-brand-ink transition hover:bg-brand-canvas"
                  >
                    <Settings02Icon size={17} className="text-brand-muted" />
                    <span>Settings</span>
                  </button>
                </AnimateIcon>

                {/* Add Account */}
                <AnimateIcon animateOnHover asChild>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleOpenAddAccount}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-brand-ink transition hover:bg-brand-canvas"
                  >
                    <UserAdd01Icon size={17} className="text-brand-muted" />
                    <span>Add account</span>
                  </button>
                </AnimateIcon>

                <div className="my-1 h-px bg-brand-line/60" />

                {/* Log Out */}
                <AnimateIcon animateOnHover asChild>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    <Logout01Icon size={17} />
                    <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
                  </button>
                </AnimateIcon>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Glass chrome occupies a real row, preserving space for page content. */}
      <header className={`relative z-30 grid h-[calc(4.25rem+env(safe-area-inset-top))] shrink-0 grid-cols-[5rem_minmax(0,1fr)_5rem] items-center px-4 pt-[env(safe-area-inset-top)] md:hidden ${searchHome ? 'border-0 bg-transparent shadow-none' : 'border-b border-white/30 bg-brand-surface/25 backdrop-blur-xl backdrop-saturate-150'}`}>
        <AnimateIcon animateOnHover asChild>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          className="grid size-10 shrink-0 place-items-center rounded-xl text-brand-muted transition hover:bg-brand-canvas hover:text-brand-violet"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 8h16M4 16h10" /></svg>
        </button>
        </AnimateIcon>
        {searchHome ? <Link href="/search" className="text-center text-2xl leading-none text-brand-violet [font-family:var(--font-logo),var(--font-dm-sans),sans-serif]" aria-label="Brisky home">/ˈbrɪski/</Link> :
          <h1 className="truncate text-center text-base font-semibold tracking-tight text-brand-ink">{mobilePageTitle}</h1>}
        <div ref={setMobileActionsHost} className="flex items-center justify-end" />
      </header>

      {/* Mobile slide-over navigation drawer (border-free, 276px wide) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-brand-ink/30 backdrop-blur-2xs md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="mobile-navigation"
        aria-hidden={!mobileOpen}
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-[276px] flex-col bg-brand-surface px-3.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-2">
          <span className="text-3xl leading-none text-brand-violet [font-family:var(--font-logo),var(--font-dm-sans),sans-serif]">
            /ˈbrɪski/
          </span>
        </div>
        {renderNavContent(false)}
      </aside>

      {/* Desktop sticky sidebar (clean, border-free, widened to 264px) */}
      <aside
        className={`sticky top-0 z-20 hidden h-dvh shrink-0 flex-col bg-brand-surface px-3.5 py-6 transition-[width] duration-200 md:flex ${
          collapsed ? "w-[72px]" : "w-[264px]"
        }`}
      >
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}>
          <span className="text-3xl leading-none text-brand-violet [font-family:var(--font-logo),var(--font-dm-sans),sans-serif]">
            {collapsed ? "b." : "/ˈbrɪski/"}
          </span>
          {!collapsed && (
            <AnimateIcon animateOnHover asChild>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                className="grid size-8 place-items-center rounded-lg text-brand-muted transition hover:bg-brand-canvas hover:text-brand-ink"
              >
                <PanelLeftIcon size={18} />
              </button>
            </AnimateIcon>
          )}
        </div>

        {collapsed && (
          <AnimateIcon animateOnHover asChild>
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="mx-auto mt-4 grid size-9 place-items-center rounded-lg text-brand-muted transition hover:bg-brand-canvas hover:text-brand-ink"
            >
              <PanelRightIcon size={18} />
            </button>
          </AnimateIcon>
        )}

        {renderNavContent(collapsed)}
      </aside>

      {/* Add Account Modal */}
      {addAccountModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 p-4 backdrop-blur-xs"
          onClick={() => setAddAccountModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-brand-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-brand-ink">Add account</h3>
                <p className="mt-1 text-xs text-brand-muted">
                  Sign in with another email to switch workspaces effortlessly.
                </p>
              </div>
              <AnimateIcon animateOnHover asChild><button
                type="button"
                onClick={() => setAddAccountModalOpen(false)}
                className="rounded-xl p-1 text-brand-muted hover:bg-brand-canvas hover:text-brand-ink"
              >
                <X className="size-5" />
              </button></AnimateIcon>
            </div>

            {accountAddedFeedback ? (
              <div className="mt-5 flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-700">
                <Check className="size-4 shrink-0 text-emerald-600" />
                <span>Account connected! Switching profile…</span>
              </div>
            ) : (
              <form onSubmit={handleAddAccountSubmit} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="account-email" className="text-xs font-medium text-brand-ink">
                    Email address
                  </label>
                  <input
                    id="account-email"
                    type="email"
                    required
                    placeholder="name@team.com"
                    value={newAccountEmail}
                    onChange={(e) => setNewAccountEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-brand-line bg-brand-canvas/60 px-3.5 py-2.5 text-xs text-brand-ink placeholder:text-brand-muted/70 focus:border-brand-violet focus:bg-brand-surface focus:outline-hidden focus:ring-3 focus:ring-brand-violet/15"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddAccountModalOpen(false)}
                    className="rounded-xl px-3.5 py-2 text-xs font-semibold text-brand-muted hover:text-brand-ink"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-brand-action px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-action-hover"
                  >
                    Connect account
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
