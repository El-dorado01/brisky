import {endsVoiceSession} from './brisky-voices';
// Public, generated speech only. These acknowledge receipt, not a search result.
export const voiceAcknowledgements=[
  "I'm with you. One moment.",
  "I've got you, give me a moment.",
  "Okay, let me think about that.",
  "I'm on it, just a moment.",
  "Sure, give me a second to work through that.",
  "I hear you, let me take a look.",
  "Alright, let me work on that.",
  "Got it, I'm taking a look now.",
  "Okay, I'm with you on that.",
  "Let me give that a little thought.",
  "Sure, I'm taking a moment with that.",
  "Alright, give me a moment to check.",
  "I hear what you're asking, one moment.",
  "Okay, let me work that out.",
  "I'm here, let me take care of that.",
  "Got you, let me think it through.",
  "Alright, I'm giving that a look.",
];
export function acknowledgementPath(voice:string,index:number){return '/audio/brisky/'+voice+'-ack'+(index?'-'+index:'')+'.wav';}
export function acknowledgementOrder(){const order=voiceAcknowledgements.map((_,index)=>index);for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}return order;}

/** A processing acknowledgement is appropriate only after a recognizable work request. */
export function shouldAcknowledgeVoice(text:string){
 if(endsVoiceSession(text))return false;
 const value=text.toLowerCase().replace(/[\u2019]/g,"'").replace(/[.!?,]/g,' ').replace(/\s+/g,' ').trim();
 const social=value.replace(/^(?:(?:hi|hey|hello|brisky|please|okay|ok)\s+)*/,'').replace(/\s+brisky$/,'');
 if(/^(?:hi|hey|hello|good (?:morning|afternoon|evening|night)|how are you(?: doing)?|how's it going|what'?s up|(?:can|could) you hear me|(?:can you )?hear me(?: now)?|thank you(?: so much)?|thanks(?: a lot)?|you'?re welcome|nice to meet you|who are you|what'?s your name)$/.test(social))return false;
 return /\b(find|search|locate|explore|compare|summari[sz]e|narrate|describe|explain|create|make|write|help|check|review|analyse|analyze|translate|calculate|count|show|look for|tell me|what happened)\b/.test(value)||/\b(?:a|the|another|some) (?:moment|clip|video|recording|scene) (?:that|where|when|with|of)\b/.test(value)||/\b(?:where|when|which)\b.*\b(?:moment|clip|video|recording|scene|said|says|they|he|she)\b/.test(value);
}
