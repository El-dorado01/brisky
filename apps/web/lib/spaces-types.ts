export type SpaceSession = {
  id: string; title: string; query: string; pinned: boolean;
  momentsCount: number; createdAt: string; updatedAt: string;
};
export type SpaceCitation = { momentId:string;assetId:string;startS:number;endS:number;title:string;filename:string };
export type SpaceMessage = { id: string; role: 'user' | 'assistant'; content: string; sequence: number; createdAt: string; citations?:SpaceCitation[] };
export type SavedMoment = { id: string; assetId: string; title: string; notes: string; startS: number; endS: number; filename: string; source: string;transcript?:string;description?:string;evidenceStatus?:'saved'|'indexed'|'matched' };
export type SpaceDetail = { space: SpaceSession; messages: SpaceMessage[]; moments: SavedMoment[]; shortlist: string[];replyState?:'processing'|'complete'|'failed'|null };
