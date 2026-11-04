import type { ComponentType } from "react";
import { FactoryAudio as AudioLines,FactorySparkles as Sparkles } from "@/components/connectors/FactoryIcons";
import { Clapperboard } from "@/components/animate-ui/icons/hugeicons/clapperboard";
import { Download01Icon as Download } from "@/components/animate-ui/icons/hugeicons/download-01";
import { Layers01Icon as Layers } from "@/components/animate-ui/icons/hugeicons/layers-01";

import { Trash } from "@/components/animate-ui/icons/hugeicons/trash";

export type StageIcon = ComponentType<{ size?: number; strokeWidth?: number; animate?: boolean; delay?: number }>;

export type FileInFlight = { id?:string;name: string; progress: number|null; note: string };
export type ActivityItem = { time: string; text: string; tone?: "warn";steps?:{id:string;text:string;time:string}[] };

export type PipelineStage = {
  id: string;
  title: string;
  description: string;
  Icon: StageIcon;
  /** Files being processed in this stage right now. */
  files: FileInFlight[];
  /** Files that already finished this stage today. */
  doneToday: number|null;
  avgTime: string;
  successRate: string;
  failedToday: number|null;
  activity: ActivityItem[];
  recentFiles?:{id:string;name:string;status:string;at:string;reused?:boolean}[];
};

// Stage definitions; FactoryProvider supplies live files and available metrics.
export const pipelineStages: PipelineStage[] = [
  {id:"fetch",title:"Fetch",description:"Opens the source and prepares temporary media for analysis.",Icon:Download,files:[],doneToday:null,failedToday:null,avgTime:"Not available",successRate:"Not available",activity:[]},
  {id:"scenes",title:"Scenes",description:"Finds scene changes and saves keyframes so visuals can be searched.",Icon:Clapperboard,files:[],doneToday:null,failedToday:null,avgTime:"Not available",successRate:"Not available",activity:[]},
  {id:"transcribe",title:"Transcribe",description:"Turns speech into searchable text with timestamps.",Icon:AudioLines,files:[],doneToday:null,failedToday:null,avgTime:"Not available",successRate:"Not available",activity:[]},
  {id:"understand",title:"Understand",description:"Analyses frames and video. Can finish before or after transcription.",Icon:Sparkles,files:[],doneToday:null,failedToday:null,avgTime:"Not available",successRate:"Not available",activity:[]},
  {id:"index",title:"Index",description:"Combines available speech and visual results into searchable knowledge.",Icon:Layers,files:[],doneToday:null,failedToday:null,avgTime:"Not available",successRate:"Not available",activity:[]},
  {id:"purge",title:"Purge",description:"Cleans temporary working media after each job; previews and search knowledge remain.",Icon:Trash,files:[],doneToday:null,failedToday:null,avgTime:"Not available",successRate:"Not available",activity:[]}
];
