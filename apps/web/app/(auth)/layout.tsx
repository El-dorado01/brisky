import { DM_Sans, Love_Ya_Like_A_Sister } from "next/font/google";
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

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${dmSans.variable} ${loveYa.variable} min-h-dvh w-full bg-brand-canvas text-brand-ink [font-family:var(--font-dm-sans),sans-serif]`}
      style={{ backgroundColor: "var(--color-brand-canvas)" }}
    >
      <AuthThemeEnforcer />
      {children}
    </div>
  );
}
