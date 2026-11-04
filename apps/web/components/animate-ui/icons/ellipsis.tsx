'use client';

import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type EllipsisProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    dot1: {
      initial: { y: 0 },
      animate: {
        y: [0, -2.5, 0],
        transition: { duration: 0.35, ease: 'easeInOut' },
      },
    },
    dot2: {
      initial: { y: 0 },
      animate: {
        y: [0, -2.5, 0],
        transition: { duration: 0.35, delay: 0.08, ease: 'easeInOut' },
      },
    },
    dot3: {
      initial: { y: 0 },
      animate: {
        y: [0, -2.5, 0],
        transition: { duration: 0.35, delay: 0.16, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: EllipsisProps) {
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
      <motion.circle
        cx={12}
        cy={12}
        r={1}
        variants={variants.dot2}
        initial="initial"
        animate={controls}
      />
      <motion.circle
        cx={19}
        cy={12}
        r={1}
        variants={variants.dot3}
        initial="initial"
        animate={controls}
      />
      <motion.circle
        cx={5}
        cy={12}
        r={1}
        variants={variants.dot1}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Ellipsis(props: EllipsisProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Ellipsis,
  Ellipsis as EllipsisIcon,
  type EllipsisProps,
  type EllipsisProps as EllipsisIconProps,
};

