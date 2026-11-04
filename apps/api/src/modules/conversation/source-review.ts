import { SpaceEvidence } from '../pipeline/space-conversation';

/** Broader source context is needed for lessons/comparisons, not just clip finding. */
export function requestsSourceReview(text:string):boolean {
  if(isTemporalFollowup(text))return true;
  const task=/\b(narrate|describe|summari[sz]e|happened|details?|explain|review|compare|brainstorm|questions?|quiz|outline|recap|steps?)\b/i.test(text);
  const whole=/\b(whole|full|entire)\b.*\b(clips?|videos?|recordings?)\b|\b(clips?|videos?|recordings?)\b.*\b(whole|full|entire)\b/i.test(text);
  if(!whole&&/\b(?:this|that|selected|saved) (?:(?:tutorial|video|lesson) )?(?:moment|excerpt|segment|part)\b/i.test(text))return false;
  const lesson=/\b(tutorials?|lessons?|lectures?|courses?)\b/i.test(text);
  const comparison=/\bcompare\b/i.test(text)&&/\b(these|those|both|two|videos|recordings|sources)\b/i.test(text);
  return task&&(whole||lesson||comparison);
}

export function isTemporalFollowup(text:string):boolean {
  return /\b(?:what (?:happened|happens|came|comes) next|what (?:happened|happens) (?:before|after) (?:that|this)|what led (?:up )?to (?:that|this))\b/i.test(text);
}

export function referencesSelectedSources(text:string):boolean {
  if(isTemporalFollowup(text))return true;
  if(/\b(?:this|that|these|those|both|selected|saved) (?:(?:two|three|selected|saved) )?(?:clips?|videos?|recordings?|tutorials?|lessons?|lectures?|courses?|sources?)\b/i.test(text))return true;
  if(/\b(?:a|an|another|some) (?:(?:whole|full|entire) )?(?:tutorial|lesson|clip|video|recording)\b/i.test(text))return false;
  return /\b(?:whole|full|entire) (?:clips?|videos?|recordings?)\b/i.test(text);
}

export function reviewScopeIsClear(text:string,sourceCount:number):boolean {
  return sourceCount===1||sourceCount>1&&/\b(tutorials|lessons|lectures|courses|clips|videos|recordings|sources|both|these|those|two|all)\b/i.test(text);
}

/** Keep later sources represented instead of filling the context with source one. */
export function fairReviewEvidence(groups:SpaceEvidence[][],limit=20):SpaceEvidence[]{
  const output:SpaceEvidence[]=[];
  for(let row=0;output.length<limit&&groups.some(group=>row<group.length);row++){
    for(const group of groups){if(group[row])output.push({...group[row],id:`e${output.length+1}`});if(output.length===limit)break;}
  }
  return output;
}
