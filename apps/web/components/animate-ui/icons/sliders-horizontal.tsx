'use client';

import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type SlidersHorizontalProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    line1: {
      initial: { x2: 14 },
      animate: {
        x2: [14, 8, 14],
        transition: { duration: 0.55, ease: 'easeInOut' },
      },
    },
    knob1: {
      initial: { x: 0 },
      animate: {
        x: [0, -6, 0],
        transition: { duration: 0.55, ease: 'easeInOut' },
      },
    },
    knob2: {
      initial: { x: 0 },
      animate: {
        x: [0, 6, 0],
        transition: { duration: 0.55, ease: 'easeInOut', delay: 0.05 },
      },
    },
    knob3: {
      initial: { x: 0 },
      animate: {
        x: [0, -5, 0],
        transition: { duration: 0.55, ease: 'easeInOut', delay: 0.1 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: SlidersHorizontalProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.line
        x1={21}
        x2={14}
        y1={4}
        y2={4}
        variants={variants.line1}
        initial="initial"
        animate={controls}
      />
      <line x1={10} x2={3} y1={4} y2={4} />
      <line x1={21} x2={12} y1={12} y2={12} />
      <line x1={8} x2={3} y1={12} y2={12} />
      <line x1={21} x2={16} y1={20} y2={20} />
      <line x1={12} x2={3} y1={20} y2={20} />
      <motion.line
        x1={14}
        x2={14}
        y1={2}
        y2={6}
        variants={variants.knob1}
        initial="initial"
        animate={controls}
      />
      <motion.line
        x1={8}
        x2={8}
        y1={10}
        y2={14}
        variants={variants.knob2}
        initial="initial"
        animate={controls}
      />
      <motion.line
        x1={16}
        x2={16}
        y1={18}
        y2={22}
        variants={variants.knob3}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function SlidersHorizontal(props: SlidersHorizontalProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  SlidersHorizontal,
  SlidersHorizontal as SlidersHorizontalIcon,
  type SlidersHorizontalProps,
  type SlidersHorizontalProps as SlidersHorizontalIconProps,
};
