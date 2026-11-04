import { DM_Sans, Love_Ya_Like_A_Sister } from "next/font/google";
import { VoiceConversation } from '@/components/search/VoiceConversation';
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SpacesProvider } from "@/lib/spaces-context";
import { AuthThemeEnforcer } from "@/components/auth/AuthThemeEnforcer";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const loveYa = Love_Ya_Like_A_Sister({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-logo",
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SpacesProvider>
      <AuthThemeEnforcer />
      <div
        className={`${dmSans.variable} ${loveYa.variable} flex h-dvh flex-col overflow-hidden bg-brand-canvas text-brand-ink [font-family:var(--font-dm-sans),sans-serif] md:flex-row`}
        style={{ backgroundColor: "var(--color-brand-canvas)" }}
      >
        <Sidebar />
        <div className="relative isolate min-h-0 min-w-0 flex-1 overflow-auto [&>*]:h-full [&>*]:min-h-0">
          <VoiceConversation />
          {children}
        </div>
      </div>
    </SpacesProvider>
  );
}
