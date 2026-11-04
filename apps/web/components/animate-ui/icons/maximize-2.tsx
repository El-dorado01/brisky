'use client';

import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type Maximize2Props = IconProps<keyof typeof animations>;

const animations = {
  default: {
    topRight: {
      initial: { x: 0, y: 0 },
      animate: {
        x: 1.5,
        y: -1.5,
        transition: { type: 'spring', damping: 16, stiffness: 220 },
      },
    },
    bottomLeft: {
      initial: { x: 0, y: 0 },
      animate: {
        x: -1.5,
        y: 1.5,
        transition: { type: 'spring', damping: 16, stiffness: 220 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: Maximize2Props) {
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
      <motion.g variants={variants.topRight} initial="initial" animate={controls}>
        <polyline points="15 3 21 3 21 9" />
        <line x1={21} y1={3} x2={14} y2={10} />
      </motion.g>
      <motion.g variants={variants.bottomLeft} initial="initial" animate={controls}>
        <polyline points="9 21 3 21 3 15" />
        <line x1={3} y1={21} x2={10} y2={14} />
      </motion.g>
    </motion.svg>
  );
}

function Maximize2(props: Maximize2Props) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Maximize2,
  Maximize2 as Maximize2Icon,
  type Maximize2Props,
  type Maximize2Props as Maximize2IconProps,
};

