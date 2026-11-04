import type { ComponentType } from "react";
import { FactoryCube as Box,FactoryCloud as Cloud,FactoryDatabase as Database,FactoryHardDrive as HardDrive } from "@/components/connectors/FactoryIcons";
import { GoogleDriveIcon } from "@/components/connectors/GoogleDriveIcon";

type IconType = ComponentType<{ className?: string }>;

export type Connector = {
  id: string;
  name: string;
  description: string;
  Icon: IconType;
  status: "available" | "soon";
};

/** A connected source: one account or folder of a connector. Placeholder data. */
export type ConnectedSource = {
  id: string;
  connectorId: string;
  label: string;
  files: number;
  syncing: boolean;
  statusText?: string;
  lastSync: string;
  folders: string[];
  activity: { time: string; text: string; tone?: "warn" }[];
};

export const connectors: Connector[] = [
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Index videos and audio from your Drive folders.",
    Icon: GoogleDriveIcon,
    status: "available",
  },
  { id: "dropbox", name: "Dropbox", description: "Bring in footage stored in Dropbox.", Icon: Box, status: "soon" },
  { id: "onedrive", name: "OneDrive", description: "Connect Microsoft OneDrive and SharePoint.", Icon: Cloud, status: "soon" },
  { id: "s3", name: "Amazon S3", description: "Index media from your S3 buckets.", Icon: Database, status: "soon" },
  { id: "local", name: "Local upload", description: "Upload files straight from your device.", Icon: HardDrive, status: "soon" },
];

export const connectedSources: ConnectedSource[] = [];
export const connectorById = (id: string) => connectors.find((c) => c.id === id)!;
