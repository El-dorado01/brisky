"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FactoryReload as RotateCcw,FactoryPlug as PlugZap,FactoryDatabase } from "./FactoryIcons";
import { FactoryOverview } from './FactoryOverview';
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

import { ConnectorsModal } from "@/components/connectors/ConnectorsModal";
import { DetailPanel, type Selection } from "@/components/connectors/DetailPanel";
import { SourceNode } from "@/components/connectors/SourceNode";
import { StageNode } from "@/components/connectors/StageNode";
import { FactoryProvider,useFactory } from "@/lib/factory-context";


const nodeTypes = { stage: StageNode, source: SourceNode };

const SOURCE_GAP = 140;
const STAGE_X = 340;
const STAGE_GAP = 310;
// Audio and visual understanding are independent dependencies, not consecutive steps.
const stageLayout:Record<string,{column:number;y:number}>={fetch:{column:0,y:260},scenes:{column:1,y:260},understand:{column:2,y:0},transcribe:{column:2,y:520},index:{column:3,y:260},purge:{column:4,y:260}};
const stageLinks=[['fetch','scenes'],['scenes','understand'],['scenes','transcribe'],['understand','index'],['transcribe','index'],['index','purge']];
const FIT = { padding: 0.2, duration: 500 };

// Fine violet grain under the canvas, so the page has texture without noise in the way.
const grain = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .45 0 0 0 0 .39 0 0 0 0 .87 0 0 0 .22 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

function Canvas() {
  const {sources:connectedSources,stages:pipelineStages,loading,error,refresh}=useFactory();
  const initialNodes=useMemo<Node[]>(()=>[...connectedSources.map((source,index)=>({id:source.id,type:"source",position:{x:0,y:300+index*SOURCE_GAP},data:{source,index}})),...pipelineStages.map((stage,index)=>({id:stage.id,type:"stage",position:{x:STAGE_X+stageLayout[stage.id].column*STAGE_GAP,y:stageLayout[stage.id].y},data:{stage,index}}))],[connectedSources,pipelineStages]);
  const initialEdges=useMemo<Edge[]>(()=>[...connectedSources.map(source=>({id:source.id+"-fetch",source:source.id,target:"fetch",type:'smoothstep',animated:source.syncing})),...stageLinks.map(([source,target])=>({id:source+"-"+target,source,target,type:'smoothstep',animated:!!pipelineStages.find(stage=>stage.id===source)?.files.length}))],[connectedSources,pipelineStages]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  useEffect(()=>{setNodes(old=>initialNodes.map(node=>({...node,position:old.find(n=>n.id===node.id)?.position??node.position})));setEdges(initialEdges);},[initialNodes,initialEdges,setNodes,setEdges]);
  const [open, setOpen] = useState(false);
  const [overviewOpen,setOverviewOpen]=useState(false);
  const [driveNotice,setDriveNotice]=useState('');
  useEffect(()=>{const outcome=new URL(window.location.href).searchParams.get('drive');if(outcome)queueMicrotask(()=>{setOpen(true);setDriveNotice(outcome==='connected'?'Google Drive connected. Choose folders to include.':outcome==='denied'?'Google Drive connection was cancelled.':'Google Drive was not connected. Try adding it again.');});},[]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { fitView } = useReactFlow();
  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  const connectorsButton=<AnimateIcon animateOnHover asChild><button type="button" onClick={()=>setOpen(true)} aria-label="Connectors" className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-action px-3 text-xs font-semibold text-white transition hover:bg-brand-action-hover md:h-10 md:px-4 md:text-sm"><PlugZap size={16} strokeWidth={1.8}/><span>Connectors</span></button></AnimateIcon>;

  const selection: Selection = useMemo(() => {
    const stage = pipelineStages.find((s) => s.id === selectedId);
    if (stage) return { kind: "stage", stage };
    const source = connectedSources.find((s) => s.id === selectedId);
    return source ? { kind: "source", source } : null;
  }, [selectedId,pipelineStages,connectedSources]);

  const reset = useCallback(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, position: initialNodes.find((i) => i.id === n.id)!.position })));
    setTimeout(() => fitView(FIT), 30);
  }, [setNodes, fitView,initialNodes]);

  return (
    <div className="relative h-dvh min-w-0 flex-1 overflow-hidden bg-brand-canvas">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: grain }} />
      {driveNotice&&<p role="status" className="absolute bottom-20 right-4 z-20 max-w-xs rounded-xl border border-brand-line bg-brand-surface p-3 text-sm">{driveNotice}</p>}
      {(loading||error)&&<div role="status" className="absolute bottom-20 left-4 z-20 max-w-xs rounded-xl border border-brand-line bg-brand-surface p-3 text-sm">{loading?"Loading your sources?":error}{error&&<button onClick={()=>void refresh()} className="ml-2 text-brand-violet">Retry</button>}</div>}
      <ReactFlow
        className="!bg-transparent"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => setSelectedId(node.id)}
        onPaneClick={() => setSelectedId(null)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={FIT}
        minZoom={0.3}
        maxZoom={1.5}
        nodesConnectable={false}
        proOptions={proOptions}
      >
        <Background id="fine" variant={BackgroundVariant.Dots} gap={14} size={0.9} color="#cfc9f2" />
        <Background id="sparse" variant={BackgroundVariant.Dots} gap={84} size={2.4} color="#bdb5ee" />
        <Controls
          showInteractive={false}
          position="bottom-left"
          className="factory-controls !m-4 !mb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] overflow-hidden rounded-xl border border-brand-line bg-brand-surface shadow-sm sm:!m-6"
        />

        <Panel position="top-left" className="!mx-4 !my-6 sm:!m-6">
          <div className="hidden min-h-8 items-center md:flex sm:min-h-10">
            <h1 className="text-2xl font-semibold leading-none tracking-tight sm:text-[28px]">
              Factory
            </h1>
          </div>
          <p className="mt-1 hidden max-w-sm text-sm text-brand-muted sm:block">
            {connectedSources.length} connected sources · Audio and visuals join at Index.
          </p>
        </Panel>

        <Panel position="top-right" className="!mx-4 !my-4 flex min-h-10 items-center gap-2 md:!m-6">
          <AnimateIcon animateOnHover asChild><button type="button" onClick={()=>setOverviewOpen(true)} aria-haspopup="dialog" aria-expanded={overviewOpen} className="flex h-9 items-center gap-1.5 rounded-xl border border-brand-line bg-brand-surface/90 px-3 text-xs font-semibold text-brand-ink shadow-sm transition hover:border-brand-violet/40 md:h-10 md:px-4 md:text-sm"><FactoryDatabase size={16}/><span>Overview</span></button></AnimateIcon>
          {connectorsButton}
        </Panel>

        <Panel
          position="bottom-right"
          className="!m-4 !mb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] flex items-center sm:!m-6"
        >
          <AnimateIcon animateOnHover asChild><button
            type="button"
            onClick={reset}
            aria-label="Reset canvas"
            className="flex h-9 items-center gap-2 rounded-xl border border-brand-line bg-brand-surface px-3 text-xs sm:text-sm font-medium text-brand-ink shadow-sm transition hover:border-brand-violet/40 hover:text-brand-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet sm:h-10 sm:px-4"
          >
            <RotateCcw className="size-4" strokeWidth={1.8} />
            <span>Reset canvas</span>
          </button></AnimateIcon>
        </Panel>
      </ReactFlow>

      <DetailPanel selection={selection} onClose={() => setSelectedId(null)} />
      <ConnectorsModal open={open} onClose={() => setOpen(false)} />
      <FactoryOverview open={overviewOpen} onClose={()=>setOverviewOpen(false)}/>
    </div>
  );
}

export function PipelineCanvas() {
  return (
    <FactoryProvider><ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider></FactoryProvider>
  );
}
