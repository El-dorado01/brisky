import type { Metadata, Viewport } from "next";
import { bricolage, instrument, plexMono } from "./fonts";
import "./globals.css";


export const metadata: Metadata = {
  title: "Brisky — Find the moment, not the file.",
  description:
    "Connect your media once. Brisky continuously understands it, so you can find any moment by describing what you remember. We keep the intelligence, not the tape.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${bricolage.variable} ${instrument.variable} ${plexMono.variable}`}
    >
      <body><script dangerouslySetInnerHTML={{__html:`try{if(['search','factory','studio','settings','entities','entity','developer','onboarding','login','signup'].includes(location.pathname.split('/')[1])){var p=JSON.parse(localStorage.getItem('brisky.browser-preferences.v1')||'{}'),t=['light','dark'].includes(p.theme)?p.theme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.briskyTheme=t;document.documentElement.dataset.briskyText=['small','large','extra-large'].includes(p.textSize)?p.textSize:'standard';}}catch{}`}}/>{children}</body>
    </html>
  );
}
