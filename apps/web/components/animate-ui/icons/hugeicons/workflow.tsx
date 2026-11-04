'use client';

import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type WorkflowProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    node1: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 1.25, 0.9, 1],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
    node2: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 1.25, 0.9, 1],
        transition: { duration: 0.6, ease: 'easeInOut', delay: 0.15 },
      },
    },
    node3: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 1.25, 0.9, 1],
        transition: { duration: 0.6, ease: 'easeInOut', delay: 0.3 },
      },
    },
    branches: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0.2, 1],
        opacity: [0.5, 1],
        transition: { duration: 0.7, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: WorkflowProps) {
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
      {/* Top Left Node */}
      <motion.circle
        cx={6}
        cy={5}
        r={2.5}
        variants={variants.node1}
        initial="initial"
        animate={controls}
      />
      {/* Top Right Node */}
      <motion.circle
        cx={18}
        cy={5}
        r={2.5}
        variants={variants.node2}
        initial="initial"
        animate={controls}
      />
      {/* Connecting branches */}
      <motion.path
        d="M6 7.5v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.5M12 12.5v4"
        variants={variants.branches}
        initial="initial"
        animate={controls}
      />
      {/* Bottom Center Node */}
      <motion.circle
        cx={12}
        cy={19}
        r={2.5}
        variants={variants.node3}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Workflow(props: WorkflowProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Workflow,
  Workflow as WorkflowIcon,
  type WorkflowProps,
  type WorkflowProps as WorkflowIconProps,
};

