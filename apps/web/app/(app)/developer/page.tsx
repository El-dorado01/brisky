import type { Metadata } from "next";
import { DeveloperView } from "@/components/developer/DeveloperView";

export const metadata: Metadata = {
  title: "Developer Platform – Brisky",
  description: "Programmatic multimodal search, moment extraction, and identity grounding for high-throughput video pipelines.",
};

export default function DeveloperPage() {
  return <DeveloperView />;
}

