"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PulseDot } from "@/components/ui/PulseDot";

const navLinks = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#who", label: "Who it's for" },
  { href: "#trust", label: "Philosophy" },
  { href: "#pricing", label: "Pricing" },
  { href: "#footer", label: "Docs" },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-2xl bg-surface-0/62 border-b border-white/8">
      <nav className="max-w-[1280px] mx-auto px-[clamp(18px,3vw,40px)] h-[66px] flex items-center gap-[34px]">
        <a
          href="#top"
          className="font-display font-bold text-[21px] tracking-[-0.01em] text-text-primary whitespace-nowrap no-underline"
        >
          Brisky<span className="text-ember">.</span>
        </a>

        <div className="hidden nav:flex gap-[26px] flex-1 whitespace-nowrap">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-text-secondary no-underline hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden nav:flex items-center gap-2 px-3 py-1.5 border border-white/8 rounded-full whitespace-nowrap">
          <PulseDot />
          <span className="font-mono text-[11px] text-text-secondary tracking-[0.06em]">
            CONTINUOUSLY INDEXING
          </span>
        </div>

        <div className="nav:hidden flex-1" />

        <div className="flex items-center gap-3.5">
          <a
            href="#pricing"
            className="hidden nav:inline text-sm text-text-secondary no-underline hover:text-text-primary"
          >
            Sign in
          </a>
          <Button
            href="#pricing"
            className="text-sm px-[17px] py-2.5 rounded-lg whitespace-nowrap"
          >
            Connect your media
          </Button>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="nav:hidden flex flex-col justify-center gap-[5px] w-11 h-11 px-2.5 bg-transparent border border-white/16 rounded-lg cursor-pointer transition-transform duration-150 ease-out active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-ember focus-visible:outline-offset-2"
          >
            <span className="block h-[1.5px] bg-text-primary" />
            <span className="block h-[1.5px] bg-text-primary" />
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="nav:hidden border-t border-white/8 bg-surface-0 px-[clamp(18px,3vw,40px)] pt-2.5 pb-[22px] flex flex-col">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="text-base text-text-primary no-underline py-[13px]"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
