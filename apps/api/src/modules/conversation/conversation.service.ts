import { BadRequestException,Injectable,NotFoundException,ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { MediaService } from '../media/media.service';
import { AiIntelligenceService } from '../pipeline/ai-intelligence.service';
import { SpaceAiInput,SpaceEvidence,SpaceHistory,contextualSpaceEvidence } from '../pipeline/space-conversation';
import { StudioFormat } from '../pipeline/studio-document';
import { withSearchDeadline } from '../../common/search-deadline';
import {requestsSourceReview,reviewScopeIsClear,fairReviewEvidence,isTemporalFollowup,referencesSelectedSources} from './source-review';

type Selection={assetId:string;startS:number;endS:number;title?:string;notes?:string};
export type ConversationRequest={history:SpaceHistory[];selection:Selection[]};
export function validateConversation(raw:unknown):ConversationRequest {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Invalid conversation');
  const r=raw as Record<string,unknown>;
  if(Object.keys(r).some(k=>!['history','selection'].includes(k))||!Array.isArray(r.history)||r.history.length<1||r.history.length>20||!Array.isArray(r.selection)||r.selection.length>20)throw new BadRequestException('Invalid conversation context');
  let chars=0;
  for(const m of r.history){if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>12000||Object.keys(m).some(k=>!['role','content'].includes(k)))throw new BadRequestException('Invalid message');chars+=m.content.length;}
  if(chars>32000||r.history.at(-1).role!=='user')throw new BadRequestException('Conversation must end with a user message');
  for(const s of r.selection)if(!s||typeof s.assetId!=='string'||s.assetId.length<1||s.assetId.length>64||!Number.isFinite(s.startS)||!Number.isFinite(s.endS)||s.startS<0||s.endS<=s.startS||Object.keys(s).some(k=>!['assetId','startS','endS','title','notes'].includes(k))||
    (s.title!==undefined&&(typeof s.title!=='string'||s.title.length>500))||(s.notes!==undefined&&(typeof s.notes!=='string'||s.notes.length>2000)))throw new BadRequestException('Invalid selected source range');
  return r as unknown as ConversationRequest;
}

/** Referential follow-ups search the original asset, never only a prior result range. */
export function followupSource(input:ConversationRequest):string|undefined {
  const latest=input.history.at(-1)!.content;
  const ids=[...new Set(input.selection.map(s=>s.assetId))];
  if(input.history.length<3||ids.length!==1)return undefined;
  // "Another hug in this clip" is explicitly scoped despite the word another.
  if(/\b(?:in|within|from|throughout) (?:this|that|the same|the selected|the current) (?:video|clip|recording|scene)\b/i.test(latest))return ids[0];
  if(requestsNewLibraryMoment(latest)||/\b(other|another|elsewhere|library|archive|collection|across|all (?:my )?(?:videos|clips|recordings))\b/i.test(latest))return undefined;
  // A relative clause ("a lady that throws...") does not refer to the old clip.
  // Require an actual anaphor or an explicitly referenced source, not bare "that".
  return isTemporalFollowup(latest)||/\b(the two|those two|they|them|it|(?:this|that|same) (?:video|clip|recording|scene)|(?:before|after|around|following) (?:this|that))\b/i.test(latest)?ids[0]:undefined;
}
/** A new described/quoted moment is not implicitly restricted to a previous result. */
export function requestsNewLibraryMoment(text:string):boolean {
  const described=/\b(?:a|another|some) (?:moment|clip|video|recording|scene) (?:that|where|when|with|of)\b/i.test(text);
  const quoted=/\b(?:moment|clip|video|recording|scene)\b.{0,40}\b(?:says?|said|hear|quote|line)\b/i.test(text);
  const scoped=/\b(?:in|within|from) (?:this|that|the same) (?:clip|video|recording|scene)\b/i.test(text);
  return (described||quoted)&&!scoped&&(quoted||!/\b(the two|those two|they|them)\b/i.test(text));
}
export function isAnswerTransformation(text:string):boolean {
  const rewrite=/^(?:please )?(?:rewrite|rephrase|translate|shorten|simplify|reformat|summari[sz]e)\b/i.test(text.trim())&&
    /\b(?:your|the) (?:last |previous )?(?:answer|response|reply)\b|["'\u201c]/i.test(text);
  return rewrite&&!/\b(?:and|also|then|but)\s+(?:please\s+)?(?:find|search|locate|show)\b/i.test(text);
}
export function requestsFootageSearch(text:string):boolean {
  if(isAnswerTransformation(text))return false;
  // Whole utterances only: a usage question or thanks must not force a lookup
  // merely because it contains "search"/"find". Mixed requests still search.
  if(/^(?:how does (?:(?:brisky|your|the) )?search(?:ing)? work|what can (?:you|brisky) (?:find|search for)|(?:thank you|thanks) for (?:helping me )?(?:find|finding) (?:this|that|the) (?:clip|moment|video))[?!.\s]*$/i.test(text.trim()))return false;
  return requestsNewLibraryMoment(text)||/\b(find|search|locate)\b/i.test(text)||/\b(exact )?timestamps?\b/i.test(text)||/\b(?:moment|clip|video|recording|scene)\b.{0,40}\b(?:says?|said|hear|quote|line)\b/i.test(text);
}

@Injectable()
export class ConversationService {
  constructor(private readonly db:DatabaseService,private readonly media:MediaService,private readonly ai:AiIntelligenceService,private readonly config:ConfigService){}
  async reply(userId:string,raw:unknown,signal?:AbortSignal){
    const input=validateConversation(raw);
    if(this.config.get('SPACE_REPLIES_ENABLED','false')!=='true'||!this.ai.isConfigured())throw new ServiceUnavailableException('Brisky replies are not enabled yet. Your messages are saved.');
    return withSearchDeadline(110000,async()=>{
      // Never accept client-supplied transcripts, ownership or model instructions.
      let sourceMetadata:{assetId:string;durationS:number;filename:string}[]=[];
      if(input.selection.length){
        const valid=await this.db.query(`SELECT a.id,a.duration,a.original_filename FROM jsonb_to_recordset($2::jsonb) AS r("assetId" text,"startS" float8,"endS" float8)
          JOIN public.media_assets a ON a.id=r."assetId" AND a.user_id=$1 AND a.duration>0 AND r."endS"<=a.duration`,[userId,JSON.stringify(input.selection)]);
        if(valid.rowCount!==input.selection.length)throw new NotFoundException('Selected source range is unavailable');
        sourceMetadata=valid.rows.filter(row=>Number.isFinite(Number(row.duration))&&Number(row.duration)>0).map(row=>({assetId:row.id,durationS:Number(row.duration),filename:row.original_filename}));
      }
      let evidence=await this.evidence(userId,input.selection);
      const context:SpaceAiInput={sourceMetadata,selectedRanges:input.selection.map(({assetId,startS,endS})=>({assetId,startS,endS})),phase:'plan',history:input.history,evidence,selectionNotes:input.selection.map(s=>({title:s.title||'',notes:s.notes||''})),searchStatus:'not_requested'};
      const latest=input.history.at(-1)!.content,sourceIds=[...new Set(input.selection.map(s=>s.assetId))];
      const sourceReview=!isAnswerTransformation(latest)&&requestsSourceReview(latest);
      if(sourceReview&&referencesSelectedSources(latest)&&reviewScopeIsClear(latest,sourceIds.length)&&!requestsFootageSearch(latest)){
        const reviewed=await this.reviewSources(userId,sourceMetadata);
        context.phase='answer';context.evidence=reviewed.evidence;context.sourceOverviews=reviewed.overviews;
        context.sourceOverview=reviewed.overviews.length===1?reviewed.overviews[0]:undefined;
        context.searchStatus=reviewed.overviews.length>0&&reviewed.overviews.every(source=>source.complete)?'complete':'incomplete';
        const answer=await this.ai.spaceConversation(context);
        if(answer.action!=='reply')throw new ServiceUnavailableException('Brisky could not finish reviewing this video');
        const citations=answer.citedEvidenceIds.map(id=>reviewed.evidence.find(e=>e.id===id)!);
        return {text:answer.text,citations,evidence:citations,searchStatus:context.searchStatus,usage:answer.usage?[answer.usage]:[]};
      }
      const plan=await this.ai.spaceConversation(context);
      // A media lookup must not become a negative answer from an old excerpt.
      if(isAnswerTransformation(latest)&&plan.action==='search')plan.action='answer';
      if(requestsFootageSearch(latest)&&(requestsNewLibraryMoment(latest)||plan.action!=='search')){
        plan.action='search';plan.searchQuery=input.history.at(-1)!.content;
      }
      const usages=plan.usage?[plan.usage]:[];
      if(plan.action==='reply')return {text:plan.text,citations:[],evidence:[],searchStatus:'not_requested',usage:usages};
      if(plan.action==='search'){
        const search=await this.media.searchDetailed(plan.searchQuery,followupSource(input),12,userId,'verify',signal,undefined,latest);
        // Search results may contain synthetic segment IDs. Re-read actual owned index rows
        // within their source ranges rather than persisting fabricated segment references.
        // Keep assessments attached, including negative ones. A rejected exact
        // description can still contain a useful, explicitly qualified near match.
        // The grounded answer selects citations; these are not automatic matches.
        const ranges=search.results.slice(0,12).map(r=>({assetId:r.assetId,startS:r.startTime,endS:r.endTime}));
        const retrieved=contextualSpaceEvidence(await this.evidence(userId,ranges),search.results);
        // Old selected excerpts are planning context, not results of the new search.
        // Keeping them here lets an empty search turn into an unrelated citation.
        evidence=retrieved.filter((e,i)=>retrieved.findIndex(other=>other.assetId===e.assetId&&other.startS===e.startS&&other.endS===e.endS)===i).slice(0,20).map((e,i)=>({...e,id:`e${i+1}`}));
        const resultIds=[...new Set(evidence.map(e=>e.assetId))];
        const resultSources=resultIds.length?await this.db.query(
          'SELECT id,duration,original_filename FROM public.media_assets WHERE user_id=$1 AND id=ANY($2::varchar[]) AND duration>0',
          [userId,resultIds]):{rows:[]};
        context.sourceMetadata=resultSources.rows.filter(row=>resultIds.includes(row.id)&&Number.isFinite(Number(row.duration))&&Number(row.duration)>0)
          .map(row=>({assetId:row.id,durationS:Number(row.duration),filename:row.original_filename}));
        context.searchStatus=search.searchStatus==='incomplete'||search.searchStatus==='refining'||search.identitySearch?.status==='needs_clarification'?'incomplete':'complete';
        if(sourceReview&&reviewScopeIsClear(latest,resultIds.length)){
          const reviewed=await this.reviewSources(userId,context.sourceMetadata);
          evidence=contextualSpaceEvidence(reviewed.evidence,search.results);context.sourceOverviews=reviewed.overviews;
          context.sourceOverview=reviewed.overviews.length===1?reviewed.overviews[0]:undefined;
          if(!reviewed.overviews.length||reviewed.overviews.some(source=>!source.complete))context.searchStatus='incomplete';
        }
      }
      context.phase='answer';context.evidence=evidence;
      const answer=await this.ai.spaceConversation(context);
      if(answer.action!=='reply')throw new ServiceUnavailableException('Brisky could not finish this reply. Please retry.');
      if(answer.usage)usages.push(answer.usage);
      // Retrieval supplies candidates, not saved search matches. The answer model
      // selects relevant evidence; do not persist every loose retrieval hit as a card.
      const citations=answer.citedEvidenceIds.map(id=>evidence.find(e=>e.id===id)!);
      return {text:answer.text,citations,evidence:citations,searchStatus:context.searchStatus,usage:usages};
    },signal);
  }
  private async reviewSources(userId:string,sources:NonNullable<SpaceAiInput['sourceMetadata']>){
    const unique=sources.filter((source,i)=>sources.findIndex(other=>other.assetId===source.assetId)===i).slice(0,20);
    const groups=await Promise.all(unique.map(source=>this.evidence(userId,[{assetId:source.assetId,startS:0,endS:source.durationS}],true)));
    const evidence=fairReviewEvidence(groups);
    const overviews=unique.map(source=>{
      const ranges=evidence.filter(item=>item.assetId===source.assetId).sort((a,b)=>a.startS-b.startS);
      let covered=0;for(const item of ranges){if(item.startS>covered+.05)break;covered=Math.max(covered,item.endS);}
      return {kind:'indexed' as const,assetId:source.assetId,durationS:source.durationS,
        inspectedRanges:ranges.map(item=>({startS:item.startS,endS:item.endS})),complete:covered>=source.durationS-.05};
    });
    return {evidence,overviews};
  }
  async studio(userId:string,raw:unknown,signal?:AbortSignal){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Invalid Studio request');
    const value=raw as Record<string,unknown>;
    if(Object.keys(value).some(key=>!['format','goal','selection'].includes(key))||!['brief','storyline'].includes(String(value.format))||typeof value.goal!=='string'||value.goal.length>2000||!Array.isArray(value.selection)||!value.selection.length)throw new BadRequestException('Choose up to 20 source moments and a supported format');
    const checked=validateConversation({history:[{role:'user',content:value.goal.trim()||'Create a source-grounded document'}],selection:value.selection});
    if(this.config.get('SPACE_REPLIES_ENABLED','false')!=='true'||!this.ai.isConfigured())throw new ServiceUnavailableException('Studio generation is not configured');
    return withSearchDeadline(90000,async()=>{
      const valid=await this.db.query(`SELECT a.id FROM jsonb_to_recordset($2::jsonb) r("assetId" text,"startS" float8,"endS" float8) JOIN media_assets a ON a.id=r."assetId" AND a.user_id=$1 AND a.status='indexed' AND a.duration>=r."endS" AND (a.availability IS NULL OR a.availability!='offline')`,[userId,JSON.stringify(checked.selection)]);
      if(valid.rowCount!==checked.selection.length)throw new NotFoundException('A shortlisted source is unavailable');
      const evidence=(await this.evidence(userId,checked.selection)).map(item=>({...item,description:`Broader indexed scene context; events described here may occur outside the selected ${item.startS}-${item.endS}s range. Do not assert these events occur within that range without range-specific evidence.\n${item.description.slice(0,1800)}`,transcript:item.transcript.slice(0,2200)}));
      if(!evidence.length)throw new NotFoundException('No indexed evidence is available for these moments');
      const result=await this.ai.studioDocument({format:value.format as StudioFormat,goal:(value.goal as string).trim(),evidence});
      return {...result,evidence};
    },signal);
  }
  private async evidence(userId:string,ranges:Selection[],whole=false):Promise<SpaceEvidence[]>{
    if(!ranges.length)return [];
    // All inputs are bounded; every source row is joined to its authenticated owner.
    const found=await this.db.query(`SELECT chosen.*,greatest(chosen.start_time,(r.value->>'startS')::float8) AS evidence_start,
      least(chosen.end_time,(r.value->>'endS')::float8) AS evidence_end,
      COALESCE((SELECT string_agg(o.raw_data->>'text',' ' ORDER BY o.timestamp_start)
        FROM public.media_observations o WHERE o.asset_id=chosen.asset_id AND o.user_id=$1 AND o.observation_type='transcript'
        AND o.timestamp_start<least(chosen.end_time,(r.value->>'endS')::float8)
        AND o.timestamp_end>greatest(chosen.start_time,(r.value->>'startS')::float8)), '') AS range_transcript,
      ${whole?`(SELECT jsonb_agg(f) FROM (SELECT timestamp_start AS time,left(raw_data->>'description',450) AS description FROM public.media_observations WHERE asset_id=chosen.asset_id AND user_id=$1 AND observation_type='frame' AND timestamp_start>=chosen.start_time AND timestamp_start<chosen.end_time ORDER BY timestamp_start LIMIT 100) f)`:'NULL'} AS range_frames
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS r(value,priority)
      JOIN LATERAL (SELECT s.id,s.asset_id,s.start_time,s.end_time,s.title,s.description,s.transcript_text,a.original_filename,
        row_number() OVER(ORDER BY least(s.end_time,(r.value->>'endS')::float8)-greatest(s.start_time,(r.value->>'startS')::float8) DESC,s.id) AS choice
        FROM public.media_assets a JOIN public.media_segments s ON s.asset_id=a.id AND s.user_id=$1
        WHERE a.id=r.value->>'assetId' AND a.user_id=$1 AND s.start_time<(r.value->>'endS')::float8 AND s.end_time>(r.value->>'startS')::float8
          AND s.start_time>=0 AND s.end_time>s.start_time AND a.duration>0 AND s.end_time<=a.duration AND s.end_time<'Infinity'::float8
        ORDER BY ${whole?'s.start_time,s.id':'choice'} LIMIT ${whole?20:1}) chosen ON true ORDER BY r.priority,chosen.choice LIMIT 20`,[userId,JSON.stringify(ranges)]);
    const distinct=found.rows.filter((r,i,rows)=>rows.findIndex(other=>other.asset_id===r.asset_id&&(other.evidence_start??other.start_time)===(r.evidence_start??r.start_time)&&(other.evidence_end??other.end_time)===(r.evidence_end??r.end_time))===i).slice(0,20);
    return distinct.map((r,i)=>({id:`e${i+1}`,assetId:r.asset_id,startS:Number(r.evidence_start??r.start_time),endS:Number(r.evidence_end??r.end_time),title:(r.title||r.original_filename).slice(0,500),filename:r.original_filename,
      transcript:(r.range_transcript??r.transcript_text??'').slice(0,6000),description:whole?[String(r.description||'').slice(0,1800),...(Array.isArray(r.range_frames)?r.range_frames:[]).filter((_:unknown,index:number,frames:unknown[])=>frames.length<=12||index===frames.length-1||index%Math.ceil(frames.length/11)===0).map((frame:{time:number;description:string})=>`${frame.time}s: ${String(frame.description||'').slice(0,320)}`)].join('\n').slice(0,6000):(r.description||'').slice(0,3000),status:'indexed'}));
  }
}
