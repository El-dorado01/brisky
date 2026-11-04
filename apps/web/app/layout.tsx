import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

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
