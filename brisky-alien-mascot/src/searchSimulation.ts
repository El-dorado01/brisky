export type SearchOutcome='success'|'empty'|'error';
export type SearchSimulation={requestId:number;status:'idle'|'pending'|SearchOutcome;query:string};
export type SearchSimulationEvent={type:'start';requestId:number;query:string}|{type:'complete';requestId:number;outcome:SearchOutcome}|{type:'reset'};
export const initialSearch:SearchSimulation={requestId:0,status:'idle',query:''};
export function searchSimulationReducer(state:SearchSimulation,event:SearchSimulationEvent):SearchSimulation {
  if(event.type==='reset')return initialSearch;
  if(event.type==='start')return {requestId:event.requestId,status:'pending',query:event.query};
  if(state.status!=='pending'||state.requestId!==event.requestId)return state;
  return {...state,status:event.outcome};
}
