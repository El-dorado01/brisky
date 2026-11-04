import type { Metadata } from "next";
import { PeopleView } from "@/components/entities/PeopleView";

export const metadata: Metadata = {
  title: "People & Entities – Brisky",
  description: "Teach Brisky your people, places, and things for personalized video intelligence.",
};

export default function EntitiesPage() {
  return <PeopleView />;
}

