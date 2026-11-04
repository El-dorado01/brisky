'use client';

import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type Minimize2Props = IconProps<keyof typeof animations>;

const animations = {
  default: {
    topRight: {
      initial: { x: 0, y: 0 },
      animate: {
        x: -1.5,
        y: 1.5,
        transition: { type: 'spring', damping: 16, stiffness: 220 },
      },
    },
    bottomLeft: {
      initial: { x: 0, y: 0 },
      animate: {
        x: 1.5,
        y: -1.5,
        transition: { type: 'spring', damping: 16, stiffness: 220 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: Minimize2Props) {
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
        <polyline points="4 14 10 14 10 20" />
        <line x1={3} y1={21} x2={10} y2={14} />
      </motion.g>
      <motion.g variants={variants.bottomLeft} initial="initial" animate={controls}>
        <polyline points="20 10 14 10 14 4" />
        <line x1={14} y1={10} x2={21} y2={3} />
      </motion.g>
    </motion.svg>
  );
}

function Minimize2(props: Minimize2Props) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Minimize2,
  Minimize2 as Minimize2Icon,
  type Minimize2Props,
  type Minimize2Props as Minimize2IconProps,
};

