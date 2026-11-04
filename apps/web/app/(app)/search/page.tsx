import type { Metadata } from "next";
import { SearchStage } from "@/components/search/SearchStage";

export const metadata: Metadata = {
  title: "Search – Brisky",
};

export default function SearchPage() {
  return (
    <main className="relative flex h-dvh min-w-0 flex-1 flex-col items-center justify-center overflow-hidden">
      <SearchStage />
    </main>
  );
}

