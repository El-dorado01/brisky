import { UnderstoodQuery } from '../../media/media.types';
import { FrameObservation, TranscriptCue, VideoAnalysis } from '../pipeline.types';
import { VerificationResult } from '../ai-provider';

export class MetaResponseError extends Error {
  constructor(public readonly issue: 'invalid_response' | 'temporary', message: string, public readonly retryable = false) { super(message); }
}
const string = { type: 'string' };
const number = { type: 'number' };
const strings = { type: 'array', items: string };
const array = (items: unknown) => ({ type: 'array', items });
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties,
  required: Object.keys(properties), additionalProperties: false });
const subQuery = object({ topic: string, searchPhrase: string });
export const metaSchemas = {
  query: object({ cleanSearchPhrase: string, coreSubject: string, targetEntity: {type:['string','null']},
    aspect: {type:['string','null']}, aliases: strings, isCompound: {type:'boolean'}, subQueries: array(subQuery) }),
  frames: object({ observations: array(object({frameId:{type:'integer'},timestamp:number,objects:strings,
    scene:string,activity:strings,onScreenText:strings,description:string})) }),
  video: object({video_summary:string,key_themes:strings,segments:array(object({start_time:number,end_time:number,
    title:string,description:string,visual_objects:strings,actions:strings,dialogue:string}))}),
  transcript: object({cues:array(object({start_time:number,end_time:number,text:string}))}),
  verification: object({outcome:{type:'string',enum:['matched','not_matched','uncertain','insufficient_evidence']},
    confidence:number,matchedTimestamp:{type:['number','null']},explanation:string}),
};
export function invalidMeta(): never { throw new MetaResponseError('invalid_response', 'Meta returned invalid or incomplete structured evidence'); }
function text(value: unknown, allowEmpty = true): string {
  if (typeof value !== 'string' || value.length > 32000 || (!allowEmpty && !value.trim())) invalidMeta();
  return value;
}
function list(value: unknown, max = 2000): any[] {
  if (!Array.isArray(value) || value.length > max) invalidMeta();
  return value;
}
function textList(value: unknown): string[] { return list(value, 100).map(v => text(v, false)); }
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalidMeta();
  return value;
}
function record(value: any): any { if (!value || typeof value !== 'object' || Array.isArray(value)) invalidMeta(); return value; }
export function parseMetaQuery(value: unknown, rawQuery: string): UnderstoodQuery {
  const v = record(value);
  const subQueries = list(v.subQueries, 8).map(item => ({topic:text(record(item).topic,false),searchPhrase:text(item.searchPhrase,false)}));
  if (!subQueries.length || typeof v.isCompound !== 'boolean' || v.isCompound !== (subQueries.length > 1)) invalidMeta();
  return { rawQuery, cleanSearchPhrase:text(v.cleanSearchPhrase,false),coreSubject:text(v.coreSubject,false),
    targetEntity:v.targetEntity === null ? undefined : text(v.targetEntity,false),
    aspect:v.aspect === null ? undefined : text(v.aspect), aliases:textList(v.aliases),isCompound:v.isCompound,subQueries };
}
export function rawMetaQuery(rawQuery: string): UnderstoodQuery {
  return {rawQuery,cleanSearchPhrase:rawQuery,coreSubject:rawQuery,aliases:[],isCompound:false,
    subQueries:[{topic:rawQuery,searchPhrase:rawQuery}]};
}
export function parseMetaFrames(value: unknown, frames: Array<{timestamp:number}>, model: string): FrameObservation[] {
  const observations = list(record(value).observations, 12);
  const seen = new Set<number>();
  if (observations.length !== frames.length) invalidMeta();
  return observations.map(item => {
    const v = record(item);
    if (!Number.isInteger(v.frameId) || !frames[v.frameId] || seen.has(v.frameId) ||
        Math.abs(finite(v.timestamp)-frames[v.frameId].timestamp) > 0.000001) invalidMeta();
    seen.add(v.frameId);
    return {timestamp:frames[v.frameId].timestamp,objects:textList(v.objects),scene:text(v.scene),
      activity:textList(v.activity),onScreenText:textList(v.onScreenText),description:text(v.description,false),provider:'meta',model};
  }).sort((a,b) => a.timestamp-b.timestamp);
}
export function parseMetaVideo(value: unknown, duration: number): VideoAnalysis {
  const v = record(value);
  let previousEnd = 0;
  const segments = list(v.segments).map(item => {
    const s = record(item), start = finite(s.start_time), end = finite(s.end_time);
    if (start < 0 || end <= start || end > duration || Math.abs(start-previousEnd) > 0.05) invalidMeta();
    previousEnd = end;
    return {start_time:start,end_time:end,title:text(s.title,false),description:text(s.description,false),
      visual_objects:textList(s.visual_objects),actions:textList(s.actions),dialogue:text(s.dialogue)};
  });
  if (!segments.length || Math.abs(previousEnd-duration) > 0.05) invalidMeta();
  return {video_summary:text(v.video_summary,false),key_themes:textList(v.key_themes),segments};
}
export function parseMetaTranscript(value: unknown, duration: number, offset: number): TranscriptCue[] {
  let previousStart = -1;
  return list(record(value).cues).map(item => {
    const c = record(item), start = finite(c.start_time), end = finite(c.end_time);
    if (start < 0 || start < previousStart || end <= start || end > duration) invalidMeta();
    previousStart = start;
    return {start_time:start+offset,end_time:end+offset,text:text(c.text,false)};
  });
}
export function parseMetaVerification(value: unknown, allowed: (t: number) => boolean,
  offset = 0): VerificationResult {
  const v = record(value), confidence = finite(v.confidence), explanation = text(v.explanation,false);
  if (confidence < 0 || confidence > 1 || !['matched','not_matched','uncertain','insufficient_evidence'].includes(v.outcome)) invalidMeta();
  if (v.outcome === 'matched') {
    const timestamp = finite(v.matchedTimestamp);
    if (!allowed(timestamp)) invalidMeta();
    return {status:'evaluated',matched:true,confidence,explanation,matchedTimestamp:timestamp+offset};
  }
  if (v.matchedTimestamp !== null) invalidMeta();
  return {status:v.outcome === 'not_matched' ? 'evaluated' : 'insufficient_evidence',matched:false,confidence,explanation};
}
