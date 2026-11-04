"use client";

import { useCallback,useSyncExternalStore, type PointerEvent } from 'react';
import { useDragControls, useReducedMotion, type HTMLMotionProps, type PanInfo } from 'framer-motion';

/** Drag only the handle, leaving forms and vertical content scrolling native. */
export function useBottomSheet(onClose:()=>void,desktopMinWidth=640) {
  const subscribe=useCallback((callback:()=>void)=>{const media=window.matchMedia(`(min-width: ${desktopMinWidth}px)`);media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback);},[desktopMinWidth]);
  const isDesktop=useSyncExternalStore(subscribe,()=>window.matchMedia(`(min-width: ${desktopMinWidth}px)`).matches,()=>false);
  const reduceMotion=useReducedMotion();
  const controls=useDragControls();
  const panelProps:HTMLMotionProps<'div'>={
    role:'dialog', 'aria-modal':true,
    initial:reduceMotion ? {opacity:0} : isDesktop ? {y:12,opacity:0,scale:.98} : {y:'100%'},
    animate:{y:0,opacity:1,scale:1},
    exit:reduceMotion ? {opacity:0} : isDesktop ? {y:8,opacity:0,scale:.98} : {y:'100%'},
    transition:reduceMotion ? {duration:.1} : isDesktop ? {duration:.18,ease:'easeOut'} :
      {type:'spring',stiffness:380,damping:38,mass:1},
    drag:isDesktop ? false:'y',dragControls:controls,dragListener:false,
    dragConstraints:{top:0,bottom:0},dragElastic:{top:0,bottom:.65},
    dragMomentum:false,dragSnapToOrigin:true,
    dragTransition:{bounceStiffness:500,bounceDamping:40},
    onDragEnd:(_event,info:PanInfo)=>{
      if(info.offset.y>90 || (info.offset.y>18 && info.velocity.y>650))onClose();
    },
  };
  return {panelProps,handleProps:{
    onPointerDown:(event:PointerEvent<HTMLDivElement>)=>controls.start(event),
    style:{touchAction:'none',userSelect:'none'} as const,
    'aria-hidden':true as const,
    className:'-mx-5 flex h-8 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing sm:hidden',
  }};
}
