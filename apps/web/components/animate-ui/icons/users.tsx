'use client';

import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type UsersProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    primary: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 1.08, 1],
        transition: { duration: 0.45, ease: 'easeInOut' },
      },
    },
    secondary: {
      initial: { x: 0, opacity: 0.9 },
      animate: {
        x: [0, 2, 0],
        opacity: [0.9, 1, 0.9],
        transition: { duration: 0.5, ease: 'easeInOut', delay: 0.08 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: UsersProps) {
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
      {/* Primary Person */}
      <motion.g
        variants={variants.primary}
        initial="initial"
        animate={controls}
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </motion.g>

      {/* Secondary Person */}
      <motion.g
        variants={variants.secondary}
        initial="initial"
        animate={controls}
      >
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </motion.g>
    </motion.svg>
  );
}

function Users(props: UsersProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { Users, type UsersProps };

