'use client';

import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

type UserAdd01Props = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path1: {
      initial: { y: 0 },
      animate: {
        y: [0, 2, -2, 0],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
    circle: {
      initial: { y: 0 },
      animate: {
        y: [0, 4, -2, 0],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
    plus: {
      initial: { scale: 1, rotate: 0 },
      animate: {
        scale: [1, 1.25, 1],
        rotate: [0, 90, 0],
        transition: { duration: 0.6, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: UserAdd01Props) {
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
      <motion.path
        d="M17 21C16.713 17.269 13.729 14.315 10 14.066L9 14C8.645 14.01 8.313 14.023 8 14.038C4.3 14.219 1.284 17.306 1 21"
        variants={variants.path1}
        initial="initial"
        animate={controls}
      />
      <motion.circle
        cx={9}
        cy={7}
        r={4}
        variants={variants.circle}
        initial="initial"
        animate={controls}
      />
      <motion.g
        variants={variants.plus}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '19px 11px' }}
      >
        <path d="M19 8v6M16 11h6" />
      </motion.g>
    </motion.svg>
  );
}

function UserAdd01(props: UserAdd01Props) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  UserAdd01,
  UserAdd01 as UserAdd01Icon,
  type UserAdd01Props,
  type UserAdd01Props as UserAdd01IconProps,
};

