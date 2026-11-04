import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Overlapping procedural extension with smooth Frenet-like tube framing, rounded paw tip, and original vertex colors.
export function BriskyGreetingArm({
  active,
  motion,
  mode = 'wave',
  onGrowth,
}: {
  active: boolean;
  motion: boolean;
  mode?: 'wave' | 'think' | 'sleep';
  onGrowth?: (value: number) => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const growth = useRef(active ? 1 : 0);
  const phase = useRef(0);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const rings = 30;
    const sides = 22;
    const positions = new Float32Array((rings + 1) * (sides + 1) * 3);
    const colors = new Float32Array(positions.length);
    const indices: number[] = [];
    const blue = new THREE.Color('#2445df');
    const cyan = new THREE.Color('#65dff5');
    const pink = new THREE.Color('#c39df6');
    const c = new THREE.Color();

    for (let i = 0; i <= rings; i++) {
      for (let j = 0; j <= sides; j++) {
        c.copy(blue)
          .lerp(cyan, (i / rings) * 0.75)
          .lerp(pink, Math.max(0, Math.cos((j / sides) * Math.PI * 2)) * 0.27);
        c.toArray(colors, (i * (sides + 1) + j) * 3);
        if (i < rings && j < sides) {
          const a = i * (sides + 1) + j;
          const b = a + sides + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setIndex(indices);
    return g;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (!mesh.current) return;
    const dt = Math.min(delta, 0.1);
    growth.current = motion ? THREE.MathUtils.damp(growth.current, active ? 1 : 0, active ? 5 : 7, dt) : active ? 1 : 0;
    phase.current += motion && active ? dt : 0;
    const g = growth.current;
    onGrowth?.(g);
    mesh.current.visible = g > 0.008;
    mesh.current.userData.growth = g;
    if (!mesh.current.visible) return;

    const positions = geometry.attributes.position;
    const rings = 30;
    const sides = 22;

    if (mode === 'think' || mode === 'sleep') {
      // Thoughtful hand or cozy cheek-pillow sleeping paw tucked right under the tilted left cheek
      const isSleep = mode === 'sleep';
      const bob = motion ? Math.sin(phase.current * (isSleep ? 1.0 : 2.2)) * (isSleep ? 0.012 : 0.022) : 0;
      const p0 = isSleep ? new THREE.Vector3(-0.82, -0.26, 0.16) : new THREE.Vector3(-0.78, -0.42, 0.18);
      const p1 = isSleep ? new THREE.Vector3(-0.96, -0.34, 0.48) : new THREE.Vector3(-0.82, -0.66, 0.52);
      const p2 = isSleep ? new THREE.Vector3(-0.78, -0.25 + bob * 0.5, 0.74) : new THREE.Vector3(-0.52, -0.62 + bob * 0.5, 0.78);
      const p3 = isSleep ? new THREE.Vector3(-0.54, -0.14 + bob, 0.84) : new THREE.Vector3(-0.26, -0.32 + bob, 0.88);
      const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
      const up = new THREE.Vector3(0, 0, 1);
      const n1 = new THREE.Vector3();
      const n2 = new THREE.Vector3();

      for (let i = 0; i <= rings; i++) {
        const s = i / rings;
        const u = Math.min(1, s * g);
        const pt = curve.getPoint(u);
        const tan = curve.getTangent(u).normalize();
        n1.crossVectors(tan, up).normalize();
        if (n1.lengthSq() < 0.001) n1.set(1, 0, 0);
        n2.crossVectors(tan, n1).normalize();

        const collar = 0.06 * Math.exp(-s * 5.5);
        const tipCap = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (s - 0.68) / 0.32), 2)));
        const pawBulb = 0.052 * Math.exp(-Math.pow((s - 0.74) * 4.2, 2));
        const radius = (0.135 + collar + pawBulb) * tipCap * Math.min(1, g * 3);

        for (let j = 0; j <= sides; j++) {
          const angle = (j / sides) * Math.PI * 2;
          const ca = Math.cos(angle) * radius;
          const sa = Math.sin(angle) * radius * 0.88;
          positions.setXYZ(
            i * (sides + 1) + j,
            pt.x + n1.x * ca + n2.x * sa,
            pt.y + n1.y * ca + n2.y * sa,
            pt.z + n1.z * ca + n2.z * sa,
          );
        }
      }
    } else {
      // Friendly, expressive waving jelly arm extending clearly outside the rounded body silhouette
      const wave = motion ? Math.sin(phase.current * 5) * 0.19 * Math.sin(Math.min(phase.current, Math.PI / 2)) : 0;
      for (let i = 0; i <= rings; i++) {
        const s = i / rings;
        const p = s * g;
        const x = -0.92 - 0.62 * Math.sin(p * Math.PI * 0.52) + wave * p * p;
        const y = -0.02 + 0.88 * Math.pow(p, 1.3) - Math.abs(wave) * 0.06 * p;
        const z = 0.08;

        const dx = -0.62 * Math.PI * 0.52 * Math.cos(p * Math.PI * 0.52) + wave * 2 * p;
        const dy = 1.144 * Math.pow(Math.max(p, 0.001), 0.3);
        const length = Math.hypot(dx, dy) || 1;

        const collar = 0.08 * Math.exp(-s * 6);
        const paw = 0.068 * Math.exp(-Math.pow((s - 0.74) * 4.5, 2));
        const cap = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (s - 0.68) / 0.32), 2)));
        const radius = (0.165 + collar + paw) * cap * Math.min(1, g * 3);

        for (let j = 0; j <= sides; j++) {
          const angle = (j / sides) * Math.PI * 2;
          const r = radius * Math.cos(angle);
          positions.setXYZ(
            i * (sides + 1) + j,
            x + (dy / length) * r,
            y - (dx / length) * r,
            z + Math.sin(angle) * radius * 0.88,
          );
        }
      }
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });

  return (
    <mesh ref={mesh} geometry={geometry} visible={active}>
      <meshPhysicalMaterial
        vertexColors
        roughness={0.17}
        metalness={0.24}
        clearcoat={1}
        clearcoatRoughness={0.08}
        iridescence={1}
        iridescenceIOR={1.4}
        iridescenceThicknessRange={[180, 480]}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
