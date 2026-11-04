import localFont from "next/font/local";

// Bundled copies of the existing families keep builds independent of Google
// Fonts availability. Their original licences are in app/fonts/.
export const bricolage = localFont({src:"./fonts/bricolage.ttf",weight:"200 800",variable:"--font-bricolage",display:"swap"});
export const instrument = localFont({src:"./fonts/instrument.ttf",weight:"400 700",variable:"--font-instrument",display:"swap"});
export const plexMono = localFont({src:[{path:"./fonts/plex-mono-400.ttf",weight:"400"},{path:"./fonts/plex-mono-500.ttf",weight:"500"}],variable:"--font-plex-mono",display:"swap"});
export const dmSans = localFont({src:"./fonts/dm-sans.ttf",weight:"100 1000",variable:"--font-dm-sans",display:"swap"});
export const loveYa = localFont({src:"./fonts/love-ya.woff2",weight:"400",variable:"--font-logo",display:"swap"});
