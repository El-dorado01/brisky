"use client";
import { createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode } from 'react';
import type { ConnectedSource } from './connectors';
import { pipelineStages,type PipelineStage } from './pipeline-stages';

export type DriveAccount={id:string;provider:string;email:string;accountName:string;selectedFolders:{id:string;name:string}[];status:string;lastError?:string;lastSyncedAt?:string;files:number;processing:number;queued?:number;failed?:number;syncEnabled?:boolean};
type IndexFile={id:string;name:string;status:string;stage:string;progress:number;connector_account_id:string|null};
const stepLabel=(step:string)=>step.replace(/gemini[_ ]video/gi,'Video analysis').replace(/reused[_ ]index/gi,'Reused existing index').replaceAll('_',' ');

type StageMetrics={id:string;doneToday:number;failedToday:number;avgDurationMs:number|null;successRate:number|null;files:{id:string;name:string;progress:number|null;note:string}[];activity:{id:string;assetId:string;name:string;status:string;step:string;at:string;attempt?:number;currentStage?:string;steps?:{id:string;step:string;status:string;at:string;attempt?:number}[]}[]};
export async function factoryFetch<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch('/api/'+path,{method,cache:'no-store',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await response.json();}catch{throw new Error('The source service returned an incomplete response.');}
  if(!response.ok)throw new Error(data.error||'Unable to update your sources.');return data;
}
type FactoryValue={accounts:DriveAccount[];sources:ConnectedSource[];stages:PipelineStage[];files:IndexFile[];counts:{status:string;count:number}[];loading:boolean;error:string;refresh:()=>Promise<void>};
const Context=createContext<FactoryValue|null>(null);
export function FactoryProvider({children}:{children:ReactNode}){
  const [accounts,setAccounts]=useState<DriveAccount[]>([]),[files,setFiles]=useState<IndexFile[]>([]),[counts,setCounts]=useState<{status:string;count:number}[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [metrics,setMetrics]=useState<StageMetrics[]>([]);
  const refresh=useCallback(async()=>{
    try{const [connections,indexing]=await Promise.all([factoryFetch<{accounts:DriveAccount[]}>('connectors'),factoryFetch<{files:IndexFile[];counts:{status:string;count:number}[];stages?:StageMetrics[]}>('indexing')]);setAccounts(connections.accounts);setFiles(indexing.files);setCounts(indexing.counts);setMetrics(indexing.stages||[]);setError('');}
    catch(error){setError(error instanceof Error?error.message:'Unable to load sources.');}finally{setLoading(false);}
  },[]);
  useEffect(()=>{let busy=false;const update=async()=>{if(busy)return;busy=true;try{await refresh();}finally{busy=false;}};void update();const timer=setInterval(()=>{if(!document.hidden)void update();},2500);return()=>clearInterval(timer);},[refresh]);
  const sources=useMemo<ConnectedSource[]>(()=>accounts.filter(a=>a.provider==='google_drive').map(a=>({id:a.id,connectorId:'google-drive',label:a.accountName||a.email,files:a.files,syncing:a.processing>0,lastSync:a.lastSyncedAt?new Date(a.lastSyncedAt).toLocaleString():'Never synced',folders:a.selectedFolders.map(f=>f.name),activity:[...(a.lastError?[{time:'',text:a.lastError,tone:'warn' as const}]:[]),...(a.failed?[{time:'',text:`${a.failed} file(s) need indexing attention.`,tone:'warn' as const}]:[])],statusText:a.processing?'Processing':a.queued?`${a.queued} queued`:a.failed?'Needs attention':a.syncEnabled===false?'Sync paused':a.status==='connected'?'Connected':'Needs attention'})),[accounts]);
  const stages=useMemo(()=>pipelineStages.map(stage=>{const metric=metrics.find(m=>m.id===stage.id);return {...stage,doneToday:metric?.doneToday??null,failedToday:metric?.failedToday??null,
    avgTime:metric?.avgDurationMs==null?'No completed runs':metric.avgDurationMs<1000?'<1s':`${Math.round(metric.avgDurationMs/1000)}s`,successRate:metric?.successRate==null?'No finished runs':`${Math.round(metric.successRate)}%`,
    activity:(metric?.activity||[]).map(a=>({time:new Date(a.at).toLocaleString(),text:`${a.name} · ${a.status}${a.attempt?` (attempt ${a.attempt})`:""}${a.currentStage?` - file: ${stepLabel(a.currentStage)}`:""}`,tone:a.status==='failed'||a.status==='interrupted'?'warn' as const:undefined,
      steps:a.steps?.map(s=>({id:s.id,text:`${stepLabel(s.step)} · ${s.status}${s.attempt?` (attempt ${s.attempt})`:""}`,time:new Date(s.at).toLocaleString()}))})),
    recentFiles:(metric?.activity||[]).filter(a=>a.status!=='running').filter((a,i,all)=>all.findIndex(other=>other.assetId===a.assetId)===i).map(a=>({id:a.assetId,name:a.name,status:a.status,at:a.at,reused:a.status==='completed'&&(a.step==='reused_index'||!!a.steps?.some(s=>s.step==='reused_index'&&s.status==='completed'))})),
    files:metric?.files.length?metric.files.map(file=>({...file,note:stepLabel(file.note)})):files.filter(file=>file.status==='processing'&&stageFor(file.stage)===stage.id).map(file=>({id:file.id,name:file.name,progress:null,note:stepLabel(file.stage)||'Processing'}))};}),[files,metrics]);
  return <Context.Provider value={{accounts,sources,stages,files,counts,loading,error,refresh}}>{children}</Context.Provider>;
}
function stageFor(stage:string){if(/download|fetch|proxy|prepare/i.test(stage))return 'fetch';if(/transcri|whisper|audio/i.test(stage))return 'transcribe';if(/embed|vector/i.test(stage))return 'index';if(/clean|purge/i.test(stage))return 'purge';if(/scene|keyframe/i.test(stage))return 'scenes';if(/analy|visual|intelligence|gemini_video/i.test(stage))return 'understand';return '';}
export function useFactory(){const value=useContext(Context);if(!value)throw new Error('Factory provider is missing');return value;}
