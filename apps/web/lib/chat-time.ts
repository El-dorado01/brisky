export function formatChatTime(value:string,now=new Date()):string {
  const date=new Date(value),minutes=Math.floor((now.getTime()-date.getTime())/60000);
  if(minutes>=0&&minutes<1)return 'Just now';
  if(minutes>=1&&minutes<60)return `${minutes} ${minutes===1?'minute':'minutes'} ago`;
  const time=date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  if(date.toDateString()===now.toDateString())return `Today at ${time}`;
  const yesterday=new Date(now);yesterday.setDate(yesterday.getDate()-1);
  if(date.toDateString()===yesterday.toDateString())return `Yesterday at ${time}`;
  return `${date.toLocaleDateString(undefined,{month:'short',day:'numeric',...(date.getFullYear()!==now.getFullYear()?{year:'numeric' as const}:{})})} at ${time}`;
}
