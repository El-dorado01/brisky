import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export type BriskyExpression =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'sleeping'
  | 'surprised'
  | 'playful'
  | 'dragged'
  | 'greeting'
  | 'searching'
  | 'success'
  | 'empty'
  | 'error'
  | 'spin';

function curve(points: number[][], radius: number) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...(p as [number, number, number])))),
    36,
    radius,
    12,
    false,
  );
}

// Sculpted happy D-shaped mouth geometry (smiling top lip, deep rounded bottom)
function useHappyMouthGeometry() {
  return useMemo(() => {
    const g = new THREE.SphereGeometry(1, 32, 24);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      let y = pos.getY(i);
      const z = pos.getZ(i);
      if (y > 0) {
        y = y * 0.25 + (1 - x * x) * 0.12;
      } else {
        y = y * 1.15;
      }
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }, []);
}

function ExpressiveEye({
  x,
  expression,
  motion,
  tracking,
}: {
  x: number;
  expression: BriskyExpression;
  motion: boolean;
  tracking: boolean;
}) {
  const isLeft = x < 0;
  const root = useRef<THREE.Group>(null);
  const open = useRef<THREE.Group>(null);
  const iris = useRef<THREE.Group>(null);
  const closed = useRef<THREE.Mesh>(null);
  const brow = useRef<THREE.Mesh>(null);

  const wink = (expression === 'playful' && x > 0) || (expression === 'empty' && isLeft);
  const asleep = expression === 'sleeping';
  const happy = expression === 'greeting' || expression === 'spin';
  const closure = useRef(asleep || wink || happy ? 1 : 0);

  const lid = useMemo(
    () =>
      curve(
        [
          [-0.22, 0.04, 0],
          [-0.125, -0.072, 0.026],
          [0, -0.098, 0.042],
          [0.125, -0.072, 0.026],
          [0.22, 0.04, 0],
        ],
        0.031,
      ),
    [],
  );

  const browGeo = useMemo(
    () =>
      curve(
        [
          [-0.12, -0.014, 0],
          [-0.052, 0.026, 0.015],
          [0.052, 0.026, 0.015],
          [0.12, -0.014, 0],
        ],
        0.02,
      ),
    [],
  );

  useEffect(
    () => () => {
      lid.dispose();
      browGeo.dispose();
    },
    [lid, browGeo],
  );

  useFrame(({ clock, pointer }, delta) => {
    if (!root.current || !open.current || !iris.current || !closed.current || !brow.current) return;
    const dt = Math.min(delta, 0.05);
    const target = asleep || wink || happy ? 1 : 0;
    closure.current = motion ? THREE.MathUtils.damp(closure.current, target, 14, dt) : target;

    const blink =
      motion &&
      (expression === 'idle' || expression === 'listening' || expression === 'thinking' || expression === 'error') &&
      Math.sin(clock.elapsedTime * 0.8) > 0.996;

    const widen =
      expression === 'surprised'
        ? 1.18
        : expression === 'dragged' || expression === 'success'
          ? 1.09
          : expression === 'empty' && !isLeft
            ? 1.08
            : expression === 'listening' || expression === 'searching'
              ? 1.05
              : expression === 'error'
                ? 0.94
                : 1;

    open.current.scale.set(widen, Math.max(0.001, (1 - closure.current) * (blink ? 0.06 : 1) * widen), 1);
    open.current.visible = closure.current < 0.96;

    closed.current.visible = closure.current > 0.04;
    const flipArc = happy || (expression === 'empty' && isLeft);
    closed.current.position.y = asleep ? 0.05 : 0;
    closed.current.scale.set(asleep ? 0.92 : 1, closure.current * (flipArc ? -1 : 1), 1);
    closed.current.rotation.z =
      expression === 'playful' && !isLeft
        ? -0.18
        : expression === 'empty' && isLeft
          ? 0.14
          : asleep
            ? x * 0.12
            : 0;

    const baseTilt = -x * 0.14;
    root.current.rotation.z =
      baseTilt +
      (expression === 'listening'
        ? x * 0.16
        : expression === 'thinking'
          ? 0.06
          : expression === 'error'
            ? -x * 0.12
            : 0);

    let targetX = tracking && !asleep ? pointer.x * 0.045 : 0;
    let targetY = tracking && !asleep ? pointer.y * 0.035 : 0;

    if (expression === 'listening') {
      targetY += 0.032;
    } else if (expression === 'thinking') {
      targetX += 0.036;
      targetY += 0.046;
    } else if (expression === 'empty') {
      targetX -= 0.032;
      targetY += 0.015;
    } else if (expression === 'error') {
      targetY -= 0.025;
    } else if (expression === 'searching') {
      targetX = -x * 0.035 + (motion ? Math.sin(clock.elapsedTime * 1.2) * 0.014 : 0);
      targetY = -0.08;
    }

    iris.current.position.x = motion ? THREE.MathUtils.damp(iris.current.position.x, targetX, 15, dt) : targetX;
    iris.current.position.y = motion ? THREE.MathUtils.damp(iris.current.position.y, targetY, 15, dt) : targetY;

    // Expressive eyebrow motion (kept visible and softly relaxed during sleep)
    brow.current.visible = true;
    const browX = -x * (expression === 'surprised' ? 0.22 : 0.08);
    let browY = 0.41;
    let browRot = isLeft ? 0.16 : -0.16;
    if (asleep) {
      browY = 0.175;
      browRot = isLeft ? 0.09 : -0.09;
    } else if (expression === 'surprised') {
      browY = 0.47;
      browRot = isLeft ? 0.22 : -0.22;
    } else if (expression === 'greeting' || expression === 'success' || expression === 'spin') {
      browY = 0.44;
      browRot = isLeft ? 0.22 : -0.22;
    } else if (expression === 'listening') {
      browY = isLeft ? 0.45 : 0.4;
      browRot = isLeft ? 0.26 : -0.1;
    } else if (expression === 'thinking') {
      browY = isLeft ? 0.38 : 0.45;
      browRot = isLeft ? -0.1 : -0.25;
    } else if (expression === 'empty') {
      // Confused: left brow lowered over squinting eye, right brow arched high
      browY = isLeft ? 0.36 : 0.46;
      browRot = isLeft ? -0.16 : -0.26;
    } else if (expression === 'error') {
      // Concerned: sympathetic worried brows (inner ends raised, outer ends drooped)
      browY = 0.43;
      browRot = isLeft ? 0.42 : -0.42;
    } else if (expression === 'playful') {
      browY = isLeft ? 0.44 : 0.38;
    }
    brow.current.position.x = motion ? THREE.MathUtils.damp(brow.current.position.x, browX, 12, dt) : browX;
    brow.current.position.y = motion ? THREE.MathUtils.damp(brow.current.position.y, browY, 12, dt) : browY;
    brow.current.rotation.z = motion ? THREE.MathUtils.damp(brow.current.rotation.z, browRot, 12, dt) : browRot;
  });

  return (
    <group ref={root} position={[x, 0.055, 0.77]} rotation={[0, x * 0.16, 0]}>
      <mesh ref={brow} geometry={browGeo} position={[-x * 0.08, 0.41, 0.04]}>
        <meshBasicMaterial color="#f4f5ff" />
      </mesh>
      <mesh ref={closed} geometry={lid} position={[0, 0, 0.105]}>
        <meshBasicMaterial color="#10134e" />
      </mesh>
      <group ref={open}>
        <mesh scale={[0.295, 0.345, 0.095]}>
          <sphereGeometry args={[1, 40, 32]} />
          <meshStandardMaterial color="#f4f5ff" roughness={0.2} />
        </mesh>
        <group ref={iris}>
          <mesh position={[0, -0.012, 0.082]} scale={[0.224, 0.27, 0.065]}>
            <sphereGeometry args={[1, 40, 32]} />
            <meshPhysicalMaterial color="#071038" roughness={0.12} clearcoat={1} />
          </mesh>
          <mesh position={[-0.062, 0.092, 0.145]} scale={[0.068, 0.078, 0.016]}>
            <sphereGeometry args={[1, 20, 16]} />
            <meshBasicMaterial color="white" />
          </mesh>
          <mesh position={[0.022, -0.018, 0.145]} scale={[0.026, 0.028, 0.012]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshBasicMaterial color="white" />
          </mesh>
          <mesh position={[0.075, -0.118, 0.14]} scale={[0.028, 0.032, 0.01]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshBasicMaterial color="#49cfff" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function BriskyFace({
  expression,
  motion,
  tracking,
}: {
  expression: BriskyExpression;
  motion: boolean;
  tracking: boolean;
}) {
  const smile = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const ovalMouth = useRef<THREE.Mesh>(null);
  const tongue = useRef<THREE.Mesh>(null);
  const playfulTongue = useRef<THREE.Mesh>(null);

  const sleeping = expression === 'sleeping';
  const thoughtfulOrConfused = expression === 'thinking' || expression === 'empty';
  const concerned = expression === 'error';

  const happyMouthGeo = useHappyMouthGeometry();
  const smileCurve = useMemo(
    () =>
      curve(
        [
          [-0.12, 0.026, 0],
          [-0.06, -0.024, 0.014],
          [0, -0.038, 0.018],
          [0.06, -0.024, 0.014],
          [0.12, 0.026, 0],
        ],
        0.025,
      ),
    [],
  );

  const restCurve = useMemo(
    () =>
      curve(
        [
          [-0.095, 0.015, 0],
          [-0.045, -0.022, 0.01],
          [0, -0.03, 0.014],
          [0.045, -0.022, 0.01],
          [0.095, 0.015, 0],
        ],
        0.02,
      ),
    [],
  );

  const thinkingCurve = useMemo(
    () =>
      curve(
        [
          [-0.08, -0.018, 0],
          [-0.025, 0.012, 0.012],
          [0.035, 0.004, 0.012],
          [0.08, -0.022, 0],
        ],
        0.021,
      ),
    [],
  );

  const concernedCurve = useMemo(
    () =>
      curve(
        [
          [-0.095, -0.026, 0],
          [-0.04, 0.008, 0.012],
          [0, 0.014, 0.015],
          [0.04, 0.008, 0.012],
          [0.095, -0.026, 0],
        ],
        0.021,
      ),
    [],
  );

  useEffect(
    () => () => {
      happyMouthGeo.dispose();
      smileCurve.dispose();
      restCurve.dispose();
      thinkingCurve.dispose();
      concernedCurve.dispose();
    },
    [happyMouthGeo, smileCurve, restCurve, thinkingCurve, concernedCurve],
  );

  const dims = useRef({ x: 0.001, y: 0.001 });

  useFrame((_, delta) => {
    if (!mouth.current || !ovalMouth.current || !smile.current || !tongue.current || !playfulTongue.current) return;
    const dt = Math.min(delta, 0.05);
    const joyful =
      expression === 'dragged' || expression === 'greeting' || expression === 'success' || expression === 'spin';
    const playful = expression === 'playful';
    const curious = expression === 'listening';
    const surprise = expression === 'surprised';

    const isOpen = joyful || curious || surprise;
    const tx = joyful ? 0.165 : curious ? 0.052 : surprise ? 0.072 : 0.001;
    const ty = joyful ? 0.145 : curious ? 0.058 : surprise ? 0.11 : 0.001;

    dims.current.x = motion ? THREE.MathUtils.damp(dims.current.x, tx, 18, dt) : tx;
    dims.current.y = motion ? THREE.MathUtils.damp(dims.current.y, ty, 18, dt) : ty;

    mouth.current.visible = joyful && (isOpen || dims.current.y > 0.012);
    mouth.current.scale.set(dims.current.x, dims.current.y, 0.025);
    mouth.current.rotation.z = expression === 'dragged' ? 0.08 : 0;

    ovalMouth.current.visible = !joyful && (isOpen || dims.current.y > 0.012);
    ovalMouth.current.scale.set(dims.current.x, dims.current.y, 0.025);

    smile.current.visible = !isOpen;

    tongue.current.visible = joyful;
    tongue.current.position.set(0, -dims.current.y * 0.56, 0.028);
    tongue.current.scale.set(dims.current.x * 0.64, dims.current.y * 0.45, 0.016);

    playfulTongue.current.visible = playful;
  });

  const activeLineGeo = sleeping
    ? restCurve
    : thoughtfulOrConfused
      ? thinkingCurve
      : concerned
        ? concernedCurve
        : smileCurve;

  return (
    <group>
      <ExpressiveEye x={-0.38} expression={expression} motion={motion} tracking={tracking} />
      <ExpressiveEye x={0.38} expression={expression} motion={motion} tracking={tracking} />
      <group position={[0, sleeping ? -0.135 : -0.26, 0.875]}>
        <mesh ref={smile} geometry={activeLineGeo}>
          <meshBasicMaterial color="#10134e" />
        </mesh>
        <mesh ref={playfulTongue} position={[0.044, -0.052, 0.016]} rotation={[0, 0, 0.25]} scale={[0.046, 0.06, 0.016]}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color="#f776c9" />
        </mesh>
        <mesh ref={mouth} geometry={happyMouthGeo}>
          <meshBasicMaterial color="#090f38" />
        </mesh>
        <mesh ref={ovalMouth}>
          <sphereGeometry args={[1, 32, 24]} />
          <meshBasicMaterial color="#090f38" />
        </mesh>
        <mesh ref={tongue}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color="#f776c9" />
        </mesh>
      </group>
    </group>
  );
}
