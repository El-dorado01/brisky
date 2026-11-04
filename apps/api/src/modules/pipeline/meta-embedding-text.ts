import {createHash} from 'node:crypto';
export function metaEmbeddingText(row:{title?:string;description?:string;visual_objects?:string[];actions?:string[];transcript_text?:string;on_screen_text?:string[]}){return [row.title,row.description,(row.visual_objects||[]).join(', '),(row.actions||[]).join(', '),row.transcript_text,(row.on_screen_text||[]).join(' ')].filter(Boolean).join('. ');}
export const metaEmbeddingHash=(text:string)=>createHash('md5').update(text).digest('hex'); // Content fingerprint, not a security primitive.
