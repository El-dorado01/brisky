'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Trumpet-flared stalk + base ripple ring + plump scanning bulb rising clearly above the crown.
export function BriskySearchAntenna({
  active,
  motion,
  onGrowth,
}: {
  active: boolean;
  motion: boolean;
  onGrowth?: (v: number) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const bulb = useRef<THREE.MeshPhysicalMaterial>(null);
  const growth = useRef(active ? 1 : 0);
  const phase = useRef(0);

  const stem = useMemo(() => {
    const profile: THREE.Vector2[] = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const baseFlare = 0.13 * Math.exp(-t * 6.5);
      const topFlare = 0.048 * Math.exp(-(1 - t) * 7.5);
      const r = 0.046 + baseFlare + topFlare;
      profile.push(new THREE.Vector2(r, -0.06 + t * 0.44));
    }
    return new THREE.LatheGeometry(profile, 28);
  }, []);

  const collarRing = useMemo(() => new THREE.TorusGeometry(0.18, 0.024, 16, 36), []);

  useEffect(
    () => () => {
      stem.dispose();
      collarRing.dispose();
    },
    [stem, collarRing],
  );

  useFrame((_, delta) => {
    if (!root.current) return;
    const dt = Math.min(delta, 0.1);
    growth.current = motion ? THREE.MathUtils.damp(growth.current, active ? 1 : 0, active ? 5 : 7, dt) : active ? 1 : 0;
    phase.current += motion && active ? dt : 0;
    const g = growth.current;
    onGrowth?.(g);
    root.current.visible = g > 0.008;
    root.current.scale.setScalar(Math.max(g, 0.001));
    root.current.rotation.z = -0.1 + (motion ? Math.sin(phase.current * 2.4) * 0.18 * g : 0);
    if (bulb.current) {
      bulb.current.emissiveIntensity = 0.32 + (motion ? Math.sin(phase.current * 2.4) * 0.1 : 0);
    }
  });

  return (
    <group ref={root} position={[0.08, 0.84, -0.025]} visible={active}>
      <mesh geometry={collarRing} position={[0, -0.01, 0]} rotation={[Math.PI * 0.47, 0.06, 0]} scale={[1, 1, 0.55]}>
        <meshPhysicalMaterial color="#3c91f1" roughness={0.17} metalness={0.24} clearcoat={1} iridescence={1} />
      </mesh>
      <mesh geometry={stem}>
        <meshPhysicalMaterial color="#3c91f1" roughness={0.17} metalness={0.24} clearcoat={1} iridescence={1} />
      </mesh>
      <mesh position={[0, 0.48, 0]} scale={[0.21, 0.19, 0.195]}>
        <sphereGeometry args={[1, 36, 28]} />
        <meshPhysicalMaterial
          ref={bulb}
          color="#8edaf9"
          emissive="#276bb0"
          emissiveIntensity={0.32}
          roughness={0.12}
          metalness={0.25}
          clearcoat={1}
          iridescence={1}
          iridescenceThicknessRange={[180, 480]}
        />
      </mesh>
    </group>
  );
}
