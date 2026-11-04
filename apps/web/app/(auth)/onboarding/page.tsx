import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingView } from "@/components/onboarding/OnboardingView";

export const metadata: Metadata = {
  title: "Welcome to Brisky – Onboarding",
  description: "Make Brisky yours. Find moments in your memories, learning, work, and creative projects.",
};

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-canvas" />}>
      <OnboardingView />
    </Suspense>
  );
}

