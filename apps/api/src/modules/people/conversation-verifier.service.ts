import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseService } from '../database/database.service';
import { AiIntelligenceService } from '../pipeline/ai-intelligence.service';
import { FfmpegPipelineService } from '../pipeline/ffmpeg-pipeline.service';
import { SearchEvidence } from '../pipeline/search-evidence.service';
import { ConversationEvidence, conversationUnavailable, ConversationVerification, parseConversation } from '../pipeline/conversation-evidence';
import { SearchResponse, SearchResult } from '../media/media.types';
import { assertSearchActive, SearchDeadlineError } from '../../common/search-deadline';
import { publishSearchResults } from '../../common/search-progress';
import { ownerId } from './people.validation';

export const wantsConversation = (query: string) => /\b(?:talking|speaking|talked|spoke|conversation|conversing|chatting|chat)\b/i.test(query);
export const conversationAnchorsSql = `SELECT DISTINCT ON (a.person_id) a.id,a.person_id,p.name,a.frame_s,a.start_s,a.end_s,a.box,
  a.updated_at::text AS tag_version,p.updated_at::text AS person_version,m.duration
  FROM person_appearances a JOIN people p ON p.id=a.person_id AND p.user_id=a.user_id
  JOIN media_assets m ON m.id=a.asset_id AND m.user_id=a.user_id
  WHERE a.user_id=$1 AND a.asset_id=$2 AND a.person_id=ANY($3::uuid[]) AND a.status='confirmed' AND a.origin IN ('manual','face_match')
    AND a.start_s<$5 AND a.end_s>$4 AND a.end_s<=m.duration AND (m.availability IS NULL OR m.availability!='offline')
  ORDER BY a.person_id,(LEAST(a.end_s,$5)-GREATEST(a.start_s,$4)) DESC,abs(a.frame_s-(($4+$5)/2)),a.id`;
export const conversationCuesSql = `SELECT id,timestamp_start AS "start",timestamp_end AS "end",raw_data->>'text' AS text
  FROM media_observations WHERE user_id=$1 AND asset_id=$2 AND observation_type='transcript'
    AND timestamp_start>=$3 AND timestamp_end<=$4 AND timestamp_end>timestamp_start
    AND length(btrim(raw_data->>'text'))>0 AND length(raw_data->>'text')<=4000
  ORDER BY timestamp_start,id LIMIT 101`;

/** Orchestration only. The supplied preparation callback reuses owner-scoped media decoding. */
@Injectable()
export class ConversationVerifierService {
  constructor(private readonly db: DatabaseService, private readonly ai: AiIntelligenceService,
    private readonly ffmpeg: FfmpegPipelineService, private readonly config: ConfigService) {}

  async verify(response: SearchResponse, owner: string,
    prepare: (candidate: SearchResult)=>Promise<SearchEvidence|null>): Promise<SearchResponse> {
    ownerId(owner);
    if (response.identitySearch?.status!=='resolved') return response;
    const ids=[...new Set(response.identitySearch.references.map(r=>r.personId).filter((id):id is string=>!!id))];
    if (ids.length!==2) return {...response,explanation:'Conversation verification requires exactly two distinct, confirmed people.'};
    const limit=Number(this.config.get('PEOPLE_CONVERSATION_MAX_CANDIDATES',3));
    if (!Number.isInteger(limit) || limit<1 || limit>5) throw new Error('Invalid conversation candidate limit');
    const results=[...response.results];
    let budgetBlocked=false;
    publishSearchResults(results);
    for (let index=0; index<results.length; index++) {
      assertSearchActive();
      const result=results[index];
      const verification=budgetBlocked ? conversationUnavailable('AI checking is paused by budget admission','budget') : index<limit ? await this.verifyOne(result,owner,ids,prepare) :
        conversationUnavailable('Candidate inspection limit reached; narrow the search to check this moment');
      if (verification.issue==='budget') budgetBlocked=true;
      results[index]={...result,conversationVerification:verification};
      publishSearchResults(results);
    }
    return {...response,results,canContinue:false,
      searchStatus:results.some(r=>['error','uncertain','insufficient_evidence'].includes(r.conversationVerification?.status||''))?'incomplete':'complete',
      explanation:'Conversation assessments are scoped to the tagged people and supplied clip. Other query conditions remain unverified; manual appearance results are retained.'};
  }
  private async context(candidate: SearchResult, owner: string, ids: string[]) {
    const anchors=(await this.db.query(conversationAnchorsSql,[owner,candidate.assetId,ids,candidate.startTime,candidate.endTime])).rows;
    if (anchors.length!==2 || !Number.isFinite(anchors[0].duration) || anchors[0].duration<=0) return null;
    const max=Number(this.config.get('SEARCH_INSPECTION_MAX_SECONDS',20));
    if (!Number.isFinite(max) || max<=0 || max>60) return null;
    const start=Math.max(0,Math.min(candidate.startTime,...anchors.map(a=>a.frame_s))-2);
    const end=Math.min(anchors[0].duration,Math.max(candidate.endTime,...anchors.map(a=>a.frame_s))+2);
    if (end<=start || end-start>max) return null;
    const cues=(await this.db.query(conversationCuesSql,[owner,candidate.assetId,start,end])).rows;
    if (cues.length<2 || cues.length>100) return null;
    return {anchors,cues,start,end};
  }
  private async verifyOne(candidate: SearchResult, owner: string, ids: string[],
    prepare: (candidate: SearchResult)=>Promise<SearchEvidence|null>): Promise<ConversationVerification> {
    if (!this.ai.isConfigured()) return conversationUnavailable('Conversation model is not configured');
    let prepared: SearchEvidence|null=null;
    try {
      const context=await this.context(candidate,owner,ids);
      if (!context) return conversationUnavailable('Confirmed face anchors and timed speech context do not fit a bounded inspection window');
      prepared=await prepare({...candidate,startTime:context.start,endTime:context.end});
      if (!prepared?.clipPath || prepared.kind!=='original') return conversationUnavailable('Original moving footage is required for participant grounding','source');
      const metadata=await this.ffmpeg.probeMetadata(prepared.clipPath);
      if (!metadata.hasAudio || !Number.isFinite(metadata.duration) || Math.abs(metadata.duration-(context.end-context.start))>0.5) {
        return conversationUnavailable('Clip audio or source timestamp alignment is unavailable','source');
      }
      const anchors: ConversationEvidence['anchors']=[];
      for (let index=0; index<context.anchors.length; index++) {
        assertSearchActive();
        const a=context.anchors[index];
        const framePath=path.join(path.dirname(prepared.clipPath),`person-anchor-${index}.jpg`);
        await this.ffmpeg.extractInspectionFrame(prepared.clipPath,framePath,a.frame_s-context.start);
        if (!fs.existsSync(framePath) || fs.statSync(framePath).size<=0 || fs.statSync(framePath).size>4*1024*1024) {
          return conversationUnavailable('Labelled participant frame unavailable','source');
        }
        anchors.push({anchorId:a.id,personId:a.person_id,name:a.name,frameTime:a.frame_s,framePath,
          start:a.start_s,end:a.end_s,box:a.box});
      }
      const evidence: ConversationEvidence={clipPath:prepared.clipPath,start:context.start,end:context.end,
        candidateStart:candidate.startTime,candidateEnd:candidate.endTime,hasAudio:true,anchors,cues:context.cues};
      const assessment=await this.ai.verifyConversation(evidence);
      assertSearchActive();
      const current=await this.context(candidate,owner,ids);
      if (!current || JSON.stringify(current)!==JSON.stringify(context)) return conversationUnavailable('People labels or transcript evidence changed during verification; retry with current evidence');
      try {
        if (assessment.scope!=='conversation_between_tagged_people') throw new Error('Invalid scope');
        if (assessment.status==='error') {
          if (assessment.turns.length || typeof assessment.explanation!=='string' || !assessment.explanation.trim()) throw new Error('Invalid failure');
          return assessment;
        }
        return {...parseConversation(assessment,evidence,true),usage:assessment.usage};
      } catch {
        return {status:'error',scope:'conversation_between_tagged_people',turns:[],issue:'invalid_response',
          explanation:'Provider assessment did not establish grounded participant turns'};
      }
    } catch (error) {
      if (error instanceof SearchDeadlineError) throw error;
      return conversationUnavailable('Conversation source could not be inspected; no conclusion available','source');
    } finally { prepared?.cleanup(); }
  }
}
