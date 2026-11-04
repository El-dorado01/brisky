import type { Metadata } from "next";
import { PipelineCanvas } from "@/components/connectors/PipelineCanvas";

export const metadata: Metadata = {
  title: "Factory – Brisky",
};

export default function FactoryPage() {
  return <PipelineCanvas />;
}
