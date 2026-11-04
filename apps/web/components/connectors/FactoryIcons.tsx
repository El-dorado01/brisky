"use client";
import { Cancel01Icon,ReloadIcon,Loading03Icon,Plug01Icon,Database01Icon,HardDriveIcon,CloudIcon,CubeIcon,AudioWave01Icon,SparklesIcon } from 'hugeicons-react';
import type { IconProps } from '@/components/animate-ui/icons/icon';
import { createAnimatedHugeicon as animated } from '@/components/animate-ui/icons/hugeicons/create-animated';

export const FactoryClose=animated(Cancel01Icon);
export const FactoryReload=animated(ReloadIcon);
// A continuous spinner needs no JavaScript animation loop; keep async controls responsive.
export function FactoryLoading({size=24,strokeWidth=1.8,className}:IconProps<'default'>){
  return <Loading03Icon size={Number(size)} strokeWidth={Number(strokeWidth)} aria-hidden className={`animate-spin motion-reduce:animate-none ${className||''}`}/>;
}
export const FactoryPlug=animated(Plug01Icon);
export const FactoryDatabase=animated(Database01Icon);
export const FactoryHardDrive=animated(HardDriveIcon);
export const FactoryCloud=animated(CloudIcon);
export const FactoryCube=animated(CubeIcon);
export const FactoryAudio=animated(AudioWave01Icon);
export const FactorySparkles=animated(SparklesIcon);
