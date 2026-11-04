"use client";
import type { ComponentType } from 'react';
import { motion,useReducedMotion } from 'framer-motion';
import { IconWrapper,useAnimateIconContext,type IconProps } from '../icon';

/** Inherits its containing control's AnimateIcon trigger; never owns a hover target. */
export function createAnimatedHugeicon(Glyph:ComponentType<{size?:number;strokeWidth?:number}>,spin=false){
  function GlyphMotion({size=24,strokeWidth=1.8,...props}:IconProps<'default'>){
    const {controls}=useAnimateIconContext(),reduced=useReducedMotion();
    return <motion.svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <motion.g initial="initial" animate={controls} style={{transformOrigin:'center',transformBox:'fill-box'}} variants={{initial:{rotate:0,scale:1},animate:reduced?{rotate:0,scale:1}:spin?{rotate:360,transition:{duration:.8,ease:'linear'}}:{rotate:[0,-8,0],scale:[1,1.08,1],transition:{duration:.35}}}}><Glyph size={24} strokeWidth={Number(strokeWidth)}/></motion.g>
    </motion.svg>;
  }
  return function AnimatedHugeicon(props:IconProps<'default'>){return <IconWrapper icon={GlyphMotion} {...props}/>;};
}
