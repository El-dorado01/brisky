import { dmSans, loveYa } from "../fonts";
import { AuthThemeEnforcer } from "@/components/auth/AuthThemeEnforcer";


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
