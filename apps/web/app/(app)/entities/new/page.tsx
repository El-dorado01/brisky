import type { Metadata } from "next";
import { PeopleView } from "@/components/entities/PeopleView";

export const metadata: Metadata = {
  title: "Teach a New Entity – Brisky",
  description: "Define a new person, object, or place for Brisky to ground and index in your video archive.",
};

export default function NewEntitiesPage() {
  return <PeopleView createInitially />;
}

