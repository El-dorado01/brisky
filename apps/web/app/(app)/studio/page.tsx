import type { Metadata } from "next";
import { StudioView } from "@/components/studio/StudioView";

export const metadata: Metadata = {
  title: "Studio – Brisky",
  description: "Create source-grounded briefs and storylines from your shortlisted moments.",
};

export default async function StudioPage({searchParams}:{searchParams:Promise<{output?:string;source?:string}>}) {
  const params=await searchParams;
  return <StudioView initialOutputId={typeof params.output==='string'?params.output:undefined} initialSourceId={typeof params.source==='string'?params.source:undefined}/>;
}
