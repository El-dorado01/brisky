export type StageStatus = "done" | "active" | "todo";

export interface PipelineStage {
  label: string;
  description: string;
  status: StageStatus;
}

export const pipelineStages: PipelineStage[] = [
  { label: "FETCH", description: "Copy into ephemeral scratch", status: "done" },
  { label: "TRANSCRIBE", description: "Speech and on-screen text", status: "done" },
  { label: "VISUAL", description: "Scenes, objects, people", status: "active" },
  { label: "REASON", description: "Cross-modal alignment", status: "todo" },
  { label: "EMBED", description: "Write to the registry", status: "todo" },
  { label: "PURGE", description: "Scratch cleared — 0 B held", status: "todo" },
];
