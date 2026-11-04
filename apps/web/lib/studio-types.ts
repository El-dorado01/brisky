export type StudioFormat='brief'|'storyline';
export type StudioDocument={title:string;summary:string;sections:{heading:string;body:string;evidenceIds:string[]}[];suggestions:string[]};
export type StudioSource={available?:boolean;id:string;momentId:string;assetId:string;startS:number;endS:number;title:string;filename:string};
export type StudioOutput={id:string;spaceId:string;spaceTitle:string;format:StudioFormat;goal:string;status:'generating'|'ready'|'failed';title:string;createdAt:string;document:StudioDocument|null;sources:StudioSource[]};
export type StudioList={items:StudioOutput[];nextCursor:string|null};

export function studioClock(seconds:number){const value=Math.max(0,Math.floor(seconds));return [Math.floor(value/3600),Math.floor(value/60)%60,value%60].map(n=>String(n).padStart(2,'0')).join(':');}
function escape(text:string){return text.replace(/[\\`*_{}\[\]<>#!|]/g,'\\$&');}
/** Plain model text stays plain; only application-owned source links become Markdown. */
export function studioMarkdown(output:StudioOutput,origin:string){
  if(!output.document)return '';
  const doc=output.document,source=(id:string)=>output.sources.find(s=>s.id===id);
  const reference=(id:string)=>{const s=source(id);return s?`[${escape(s.filename)} · ${studioClock(s.startS)}–${studioClock(s.endS)}](${origin}/studio?output=${output.id}&source=${s.id})`:'';};
  return [`# ${escape(doc.title)}`,escape(doc.summary),...doc.sections.flatMap(section=>[`## ${escape(section.heading)}`,escape(section.body),`Sources: ${section.evidenceIds.map(reference).filter(Boolean).join(' · ')}`]),...(doc.suggestions.length?['## Ideas to explore',...doc.suggestions.map(idea=>`- ${escape(idea)}`)]:[]),'---',`Created from shortlisted moments in ${escape(output.spaceTitle)}. Source links require access to Brisky.`].join('\n\n');
}
