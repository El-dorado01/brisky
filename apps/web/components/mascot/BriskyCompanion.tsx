'use client';

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import './mascot.css';
import { BriskyFace, type BriskyExpression } from './BriskyFace';
import { BriskyGreetingArm } from './BriskyGreetingArm';
import { BriskySearchAntenna } from './BriskySearchAntenna';

export type BriskyPose = BriskyExpression;
export type BriskyConfig = {
  size: number;
  motion: boolean;
  satellites: boolean;
  tracking: boolean;
  amplitude: number;
  pose: BriskyPose;
};
export type BriskyInteraction = 'poke' | 'drag' | 'release';

type InteractionState = {
  pointer: number | null;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  moved: boolean;
  poke: number;
  lastPoke: number;
};

function JellyMaterial() {
  return (
    <meshPhysicalMaterial
      vertexColors
      roughness={0.17}
      metalness={0.24}
      clearcoat={1}
      clearcoatRoughness={0.08}
      iridescence={1}
      iridescenceIOR={1.4}
      iridescenceThicknessRange={[180, 480]}
    />
  );
}

function applyCanonicalVertexColors(geometry: THREE.BufferGeometry) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const blue = new THREE.Color('#1839ed');
  const cyan = new THREE.Color('#53e6fa');
  const pink = new THREE.Color('#efa6fa');
  const c = new THREE.Color();

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    c.copy(blue).lerp(cyan, THREE.MathUtils.clamp((y + 0.25) * 0.65 + x * 0.35, 0, 0.85));
    c.lerp(pink, Math.pow(Math.abs(x), 3) * 0.65 + Math.max(0, -y - 0.4) * 0.5);
    c.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function useJellyGeometry() {
  return useMemo(() => {
    const geometry = new THREE.SphereGeometry(1, 64, 48);
    const positions = geometry.attributes.position;
    applyCanonicalVertexColors(geometry);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      const organic = 1 + 0.015 * Math.sin(x * 2.5 + 0.3) * Math.cos(y * 2.2) * Math.cos(z * 2);
      const crownWidth = 1.13 - y * 0.036;
      const baseCushion = y < -0.5 ? 0.91 - Math.pow((-y - 0.5) / 0.5, 2) * 0.04 : 0.91;

      positions.setXYZ(i, x * organic * crownWidth, y * organic * baseCushion, z * organic * 0.8);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);
}

function useSatelliteGeometry() {
  return useMemo(() => {
    const geometry = new THREE.SphereGeometry(1, 36, 28);
    applyCanonicalVertexColors(geometry);
    geometry.computeVertexNormals();
    return geometry;
  }, []);
}

const SATELLITE_SPECS = [
  { size: 0.14, angle: 0.42, rx: 1.47, ry: 0.86, z: -0.1, speed: 0.85 },
  { size: 0.105, angle: 2.02, rx: 1.45, ry: 0.88, z: 0.04, speed: 1.05 },
  { size: 0.125, angle: 3.56, rx: 1.46, ry: 0.84, z: -0.06, speed: 0.78 },
  { size: 0.088, angle: 5.08, rx: 1.38, ry: 0.86, z: 0.1, speed: 1.18 },
];

function Character({
  config,
  expression,
  interaction,
  hit,
}: {
  config: BriskyConfig;
  expression: BriskyExpression;
  interaction: MutableRefObject<InteractionState>;
  hit: MutableRefObject<HTMLButtonElement | null>;
}) {
  const root = useRef<THREE.Group>(null);
  const group = useRef<THREE.Group>(null);
  const face = useRef<THREE.Group>(null);
  const satellites = useRef<THREE.Group>(null);
  const sleepBubble = useRef<THREE.Mesh>(null);

  const sleep = useRef(config.pose === 'sleeping' ? 1 : 0);
  const surpriseMorph = useRef(expression === 'surprised' ? 1 : 0);
  const confusedMorph = useRef(expression === 'empty' ? 1 : 0);
  const errorMorph = useRef(expression === 'error' ? 1 : 0);
  const armLeftVal = useRef(0);
  const armRightVal = useRef(0);
  const antennaVal = useRef(0);

  const geometry = useJellyGeometry();
  const satelliteGeo = useSatelliteGeometry();
  useEffect(
    () => () => {
      geometry.dispose();
      satelliteGeo.dispose();
    },
    [geometry, satelliteGeo],
  );

  const bodyGeometry = useMemo(() => geometry.clone(), [geometry]);
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);

  const lastMorphSig = useRef('');
  const searchSpread = useRef(config.pose === 'searching' ? 1 : 0);
  const celebrationPhase = useRef(0);
  const spinStart = useRef<number | null>(null);

  useEffect(() => {
    celebrationPhase.current = 0;
    spinStart.current = null;
  }, [expression]);

  useFrame(({ clock, pointer, viewport, size }, delta) => {
    if (!group.current || !root.current) return;
    const t = clock.elapsedTime;
    const state = interaction.current;

    const celebrating = expression === 'success' || expression === 'spin';
    const spinning = expression === 'spin';
    if (celebrating && config.motion) celebrationPhase.current += Math.min(delta, 0.1);
    if (spinning && spinStart.current === null) spinStart.current = t;
    const celebrationTime = celebrationPhase.current;
    const spinElapsed = spinning && spinStart.current !== null ? t - spinStart.current : 0;
    const bounce =
      celebrating && config.motion
        ? Math.abs(Math.sin(celebrationTime * 7)) * 0.16 * Math.exp(-celebrationTime * 0.8)
        : 0;
    const burst = celebrating ? Math.sin(Math.min(celebrationTime / 1.8, 1) * Math.PI) * 0.18 : 0;
    const spinProgress = spinning && config.motion ? Math.min(spinElapsed / 0.9, 1) : 0;
    const spinAngle =
      spinning && config.motion ? (1 - Math.pow(1 - spinProgress, 3)) * Math.PI * 2 : 0;

    const searching = config.pose === 'searching';
    searchSpread.current = config.motion
      ? THREE.MathUtils.damp(searchSpread.current, searching ? 1 : 0, 5, Math.min(delta, 0.1))
      : searching
        ? 1
        : 0;

    const dt = Math.min(delta, 0.1);
    const steps = Math.max(1, Math.ceil(dt / 0.01));
    for (let i = 0; i < steps; i++) {
      const step = dt / steps;
      state.vx += ((state.targetX - state.x) * 190 - state.vx * 19) * step;
      state.vy += ((state.targetY - state.y) * 190 - state.vy * 19) * step;
      state.x += state.vx * step;
      state.y += state.vy * step;
    }
    if (!config.motion) {
      state.x = state.targetX;
      state.y = state.targetY;
      state.vx = 0;
      state.vy = 0;
    }

    root.current.position.set(
      (state.x * viewport.width) / size.width,
      (-state.y * viewport.height) / size.height,
      0,
    );
    if (hit.current) {
      hit.current.style.transform = `translate(calc(-50% + ${state.x}px), calc(-50% + ${state.y}px))`;
    }

    if (state.poke === Infinity) state.poke = t;
    const pokeTime = t - state.poke;
    const activePoke = config.motion && pokeTime >= 0 && pokeTime < 0.85;
    const squish = activePoke ? Math.sin(pokeTime * 19) * Math.exp(-pokeTime * 5) * 0.18 : 0;

    const stretchX = config.motion ? Math.min(Math.abs(state.vx) * 0.0005, 0.16) : 0;
    const stretchY = config.motion ? Math.min(Math.abs(state.vy) * 0.0005, 0.16) : 0;

    const sleepy = expression === 'sleeping';
    const isSurprised = expression === 'surprised';
    const isConfused = expression === 'empty';
    const isError = expression === 'error';
    const dampDt = Math.min(delta, 0.05);

    sleep.current = config.motion ? THREE.MathUtils.damp(sleep.current, sleepy ? 1 : 0, 4, dampDt) : sleepy ? 1 : 0;
    surpriseMorph.current = config.motion
      ? THREE.MathUtils.damp(surpriseMorph.current, isSurprised ? 1 : 0, 10, dampDt)
      : isSurprised
        ? 1
        : 0;
    confusedMorph.current = config.motion
      ? THREE.MathUtils.damp(confusedMorph.current, isConfused ? 1 : 0, 7, dampDt)
      : isConfused
        ? 1
        : 0;
    errorMorph.current = config.motion
      ? THREE.MathUtils.damp(errorMorph.current, isError ? 1 : 0, 7, dampDt)
      : isError
        ? 1
        : 0;

    const rest = sleep.current;
    const surp = surpriseMorph.current;
    const conf = confusedMorph.current;
    const err = errorMorph.current;
    const lArm = armLeftVal.current;
    const rArm = armRightVal.current;
    const ant = antennaVal.current;
    const rippleAmp = activePoke ? Math.exp(-pokeTime * 4.5) * 0.065 : 0;
    const dragTailX = config.motion ? THREE.MathUtils.clamp(-state.x * 0.0045, -0.18, 0.18) : 0;
    const dragTailY = config.motion ? THREE.MathUtils.clamp(state.y * 0.0045, -0.14, 0.14) : 0;

    const sig = `${rest.toFixed(3)}_${surp.toFixed(3)}_${conf.toFixed(3)}_${err.toFixed(3)}_${lArm.toFixed(2)}_${rArm.toFixed(2)}_${ant.toFixed(2)}_${rippleAmp.toFixed(3)}_${dragTailX.toFixed(3)}_${dragTailY.toFixed(3)}`;
    if (sig !== lastMorphSig.current) {
      const base = geometry.attributes.position;
      const vertices = bodyGeometry.attributes.position;
      for (let i = 0; i < base.count; i++) {
        let x = base.getX(i);
        let y = base.getY(i);
        let z = base.getZ(i);
        const ny = THREE.MathUtils.clamp(y / 0.91, -1, 1);

        // 1. Cozy plush sleep settle (preserves Brisky's plump, rounded gumdrop silhouette without flattening the bottom)
        if (rest > 0.001) {
          x = x * (1 + rest * 0.04);
          y = y * (1 - rest * 0.04);
          z = z * (1 + rest * 0.04);
        }

        // 2. Surprised vertical capsule stretch
        if (surp > 0.001) {
          x *= 1 - surp * 0.2;
          y *= 1 + surp * 0.22;
          z *= 1 - surp * 0.1;
        }

        // 3. Confused (empty) slight bottom squish & puddle flare (Emotion Grid: "Squishes slightly, curious look")
        if (conf > 0.001) {
          const baseSquish = ny < 0 ? Math.pow(-ny, 1.4) * 0.08 : 0;
          x *= 1 + conf * (0.06 - ny * 0.09 + baseSquish);
          y *= 1 - conf * 0.11;
        }

        // 4. Error mild sympathetic slump
        if (err > 0.001) {
          x *= 1 + err * (0.03 - ny * 0.05);
          y *= 1 - err * 0.06;
        }

        // 5. Smooth surface collar bulges where arms/antenna emerge
        if (lArm > 0.01) {
          const dLeft = Math.hypot(x + 0.82, y - 0.02, z - 0.1);
          const bulge = Math.exp(-dLeft * dLeft * 5.5) * lArm * 0.11;
          x -= bulge;
          y += bulge * 0.22;
        }
        if (rArm > 0.01) {
          const dRight = Math.hypot(x - 0.82, y - 0.02, z - 0.1);
          const bulge = Math.exp(-dRight * dRight * 5.5) * rArm * 0.11;
          x += bulge;
          y += bulge * 0.22;
        }
        if (ant > 0.01) {
          const dTop = Math.hypot(x - 0.08, y - 0.78, z + 0.025);
          const bulge = Math.exp(-dTop * dTop * 8.0) * ant * 0.085;
          y += bulge;
        }

        // 6. Local poke indentation + concentric travelling jelly ripple wave
        if (rippleAmp > 0.001 && z > 0) {
          const radial = Math.hypot(x, y);
          const wave = Math.sin(radial * 11 - pokeTime * 28) * rippleAmp * Math.exp(-radial * 1.4);
          z += wave;
        }

        // 7. Directional jelly tail stretch when dragged
        if (Math.abs(dragTailX) > 0.002 || Math.abs(dragTailY) > 0.002) {
          const trailWeight = THREE.MathUtils.clamp(
            (x * Math.sign(dragTailX || 1) + y * Math.sign(dragTailY || 1) + 0.35) * 0.65,
            0,
            1,
          );
          x += dragTailX * trailWeight * trailWeight;
          y += dragTailY * trailWeight * trailWeight;
        }

        vertices.setXYZ(i, x, y, z);
      }
      vertices.needsUpdate = true;
      bodyGeometry.computeVertexNormals();
      lastMorphSig.current = sig;
    }

    const breath = config.motion ? Math.sin(t * (1.65 - rest * 0.65)) * (0.014 + rest * 0.01) : 0;
    const roamX =
      config.motion && expression === 'idle' && state.pointer === null
        ? Math.sin(t * 0.55) * Math.cos(t * 0.23) * 0.08 * config.amplitude
        : 0;

    group.current.position.x = (1 - rest) * roamX;
    group.current.position.y =
      (1 - rest) * (config.motion ? Math.sin(t * 1.65) * config.amplitude * 0.12 : 0) -
      rest * 0.08 -
      conf * 0.08 -
      err * 0.05 +
      bounce;
    group.current.rotation.z =
      rest * -0.08 +
      (1 - rest) *
        ((expression === 'listening'
          ? -0.08
          : expression === 'thinking'
            ? 0.08
            : expression === 'empty'
              ? -0.07
              : expression === 'error'
                ? 0.05
                : expression === 'playful'
                  ? 0.07
                  : expression === 'dragged'
                    ? -0.08
                    : -0.03) +
          (config.motion ? Math.sin(t * 0.7) * 0.025 : 0)) +
      (config.motion && rest > 0.01 ? Math.sin(t * 1.0) * 0.025 * rest : 0);
    group.current.rotation.y = (config.tracking ? pointer.x * 0.085 * (1 - rest) : 0) + spinAngle;

    group.current.scale.set(
      1 + rest * 0.03 - breath * 0.4 + squish + stretchX - stretchY * 0.4,
      1 - rest * 0.03 + breath * 1.2 - squish + stretchY - stretchX * 0.4,
      1 + rest * 0.03,
    );

    if (face.current) {
      face.current.scale.set(1 - surp * 0.14, 1 + surp * 0.05, 1);
      face.current.position.set(0, surp * 0.035 - conf * 0.03, 0);
    }

    if (sleepBubble.current) {
      sleepBubble.current.visible = rest > 0.05;
      const bubbleBreath = config.motion ? 0.5 + 0.5 * Math.sin(t * 1.0 - 0.4) : 0.65;
      const bScale = rest * (0.045 + 0.032 * bubbleBreath);
      sleepBubble.current.scale.setScalar(Math.max(0.001, bScale));
      // Rises gently above the upper-right crown toward the 'z Z' indicator
      sleepBubble.current.position.set(0.56 + bubbleBreath * 0.05, 0.86 + bubbleBreath * 0.09, 0.25);
    }

    if (satellites.current) {
      const sleepPositions = [
        [-1.32, 0.22, -0.05],
        [-1.24, -0.36, 0.08],
        [1.26, -0.28, 0.08],
        [1.34, 0.26, -0.05],
      ];
      satellites.current.children.forEach((bubble, i) => {
        const spec = SATELLITE_SPECS[i] || SATELLITE_SPECS[0];
        const a =
          spec.angle +
          spinAngle * 0.35 +
          (config.motion ? Math.sin(t * 0.35 + i) * 0.05 * (1 - rest) : 0);
        const bob = config.motion
          ? Math.sin(t * (spec.speed - rest * 0.45) + i * 2) * (0.09 - rest * 0.055)
          : 0;

        const awakeX = Math.cos(a) * spec.rx - state.vx * 0.0007;
        const awakeY = Math.sin(a) * spec.ry + state.vy * 0.0007 + bob;
        const awakeZ = spec.z + Math.sin(a) * 0.15;

        const sp = sleepPositions[i] || sleepPositions[0];
        let bx = THREE.MathUtils.lerp(awakeX, sp[0], rest);
        let by = THREE.MathUtils.lerp(awakeY, sp[1] + bob * 0.6, rest);
        let bz = THREE.MathUtils.lerp(awakeZ, sp[2], rest);

        if (expression === 'greeting') {
          bx *= 0.9;
          by -= 0.08;
          if (bx < 0 && by > 0) by += 0.4;
        } else if (expression === 'thinking' || expression === 'listening' || expression === 'empty') {
          by += 0.11;
          bx *= 1.03;
        } else if (expression === 'error') {
          bx *= 0.94;
          by -= 0.06;
        }

        bx *= 1 + searchSpread.current * 0.16;
        by *= 1 + searchSpread.current * 0.14;

        if (celebrating) {
          bx *= 1 + burst;
          by *= 1 + burst;
          bz += 0.45;
        }

        bubble.position.set(bx, by, bz);
      });
    }
  });

  const showLeftWaveArm =
    (expression === 'greeting' || expression === 'success' || expression === 'spin') &&
    config.pose !== 'searching';
  const showRightWaveArm =
    (expression === 'success' || expression === 'spin') && config.pose !== 'searching';
  const showThinkingHand = expression === 'thinking' && config.pose !== 'searching';

  return (
    <group ref={root}>
      <group scale={config.size / 160}>
        <group ref={group}>
          <mesh geometry={bodyGeometry}>
            <JellyMaterial />
          </mesh>

          <BriskyGreetingArm
            active={showLeftWaveArm || showThinkingHand}
            mode={showThinkingHand ? 'think' : 'wave'}
            motion={config.motion}
            onGrowth={(value) => {
              armLeftVal.current = value;
              if (hit.current) hit.current.dataset.armGrowth = value.toFixed(3);
            }}
          />

          <group scale={[-1, 1, 1]}>
            <BriskyGreetingArm
              active={showRightWaveArm}
              motion={config.motion}
              onGrowth={(value) => {
                armRightVal.current = value;
                if (hit.current) hit.current.dataset.rightArmGrowth = value.toFixed(3);
              }}
            />
          </group>

          <BriskySearchAntenna
            active={config.pose === 'searching'}
            motion={config.motion}
            onGrowth={(value) => {
              antennaVal.current = value;
              if (hit.current) hit.current.dataset.antennaGrowth = value.toFixed(3);
            }}
          />

          <group ref={face}>
            <BriskyFace expression={expression} motion={config.motion} tracking={config.tracking} />
          </group>

          <mesh ref={sleepBubble} geometry={satelliteGeo} visible={false}>
            <JellyMaterial />
          </mesh>
        </group>

        {config.satellites && (
          <group ref={satellites}>
            {SATELLITE_SPECS.map((spec, i) => (
              <mesh key={i} geometry={satelliteGeo} scale={spec.size}>
                <JellyMaterial />
              </mesh>
            ))}
          </group>
        )}
      </group>
    </group>
  );
}

function StaticBrisky() {
  return (
    <div className="static-brisky" role="img" aria-label="Brisky, a blue jelly creature">
      <span>● ●</span>
      <small>⌣</small>
    </div>
  );
}

class RenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <StaticBrisky /> : this.props.children;
  }
}

export function BriskyCompanion({
  config,
  enabled,
  draggable = true,
  onInteraction,
  pokeSignal = 0,
  greetingSignal = 0,
}: {
  config: BriskyConfig;
  enabled: boolean;
  draggable?: boolean;
  onInteraction?: (event: BriskyInteraction) => void;
  pokeSignal?: number;
  greetingSignal?: number;
}) {
  const [reaction, setReaction] = useState<BriskyExpression | null>(null);
  const [greeting, setGreeting] = useState(false);
  const greetingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const endGreeting = () => {
    clearTimeout(greetingTimer.current);
    setGreeting(false);
  };
  useEffect(() => {
    endGreeting();
  }, [config.pose, enabled]);

  const reactionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (greetingSignal && enabled && config.pose !== 'searching') {
      clearTimeout(greetingTimer.current);
      clearTimeout(reactionTimer.current);
      setReaction(null);
      setGreeting(true);
      greetingTimer.current = setTimeout(() => setGreeting(false), 3000);
    }
    return () => clearTimeout(greetingTimer.current);
  }, [greetingSignal]);

  const clearReaction = () => {
    clearTimeout(reactionTimer.current);
  };

  const react = (event: BriskyInteraction) => {
    endGreeting();
    clearReaction();
    if (event === 'drag') setReaction('dragged');
    else if (event === 'release') {
      setReaction('dragged');
      reactionTimer.current = setTimeout(() => setReaction(null), 550);
    } else {
      setReaction('surprised');
      reactionTimer.current = setTimeout(() => {
        setReaction('playful');
        reactionTimer.current = setTimeout(() => setReaction(null), 1000);
      }, 180);
    }
    onInteraction?.(event);
  };

  useEffect(() => () => clearTimeout(reactionTimer.current), []);
  useEffect(() => {
    if (config.pose !== 'idle') {
      clearReaction();
      setReaction(null);
    }
  }, [config.pose]);
  useEffect(() => {
    clearReaction();
    setReaction(null);
  }, [enabled]);

  const hit = useRef<HTMLButtonElement>(null);
  const interaction = useRef<InteractionState>({
    pointer: null,
    startX: 0,
    startY: 0,
    targetX: 0,
    targetY: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    moved: false,
    poke: -10,
    lastPoke: -1000,
  });

  const poke = () => {
    const now = performance.now();
    if (now - interaction.current.lastPoke < 350) return;
    interaction.current.lastPoke = now;
    interaction.current.poke = Infinity;
    react('poke');
  };

  useEffect(() => {
    if (pokeSignal) {
      interaction.current.poke = Infinity;
      react('poke');
    }
  }, [pokeSignal]);

  useEffect(() => {
    const cancel = () => {
      const s = interaction.current;
      s.pointer = null;
      s.targetX = 0;
      s.targetY = 0;
      clearReaction();
      setReaction(null);
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, []);

  const [visible, setVisible] = useState(!document.hidden);
  const [onscreen, setOnscreen] = useState(true);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => setOnscreen(entry.isIntersecting));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [enabled]);

  if (!enabled) return <div className="disabled-note">Brisky is taking a little break.</div>;

  const expression = reaction ?? (greeting ? 'greeting' : config.pose);

  return (
    <div ref={container} data-expression={expression} style={{ width: '100%', height: '100%' }}>
      <RenderBoundary>
        <Canvas
          aria-label="Animated Brisky jelly mascot"
          role="img"
          camera={{ position: [0, 0, 5.15], fov: 36 }}
          dpr={[1, 1.75]}
          frameloop={visible && onscreen ? 'always' : 'never'}
          fallback={<StaticBrisky />}
          gl={{ alpha: true, antialias: true }}
        >
          <ambientLight intensity={1.6} />
          <directionalLight position={[-3, 4, 5]} intensity={3} color="#f5eaff" />
          <pointLight position={[3, 1, 2]} intensity={25} color="#7ceaff" />
          <pointLight position={[-3, -1, 1]} intensity={18} color="#f3a3ff" />
          <Character config={config} expression={expression} interaction={interaction} hit={hit} />
        </Canvas>
      </RenderBoundary>
      <button
        ref={hit}
        className="mascot-hit"
        aria-label={
          draggable
            ? 'Poke Brisky, or drag to stretch. Press Enter or Space to poke.'
            : 'Poke Brisky. Press Enter or Space to poke.'
        }
        style={{
          width: config.size,
          height: config.size * 0.87,
          maxWidth: '100%',
          maxHeight: '100%',
          cursor: draggable ? undefined : 'pointer',
        }}
        onClick={(e) => {
          if (e.detail === 0) poke();
        }}
        onPointerDown={(e) => {
          if (!e.isPrimary || e.button !== 0) return;
          if (!draggable) {
            poke();
            return;
          }
          const s = interaction.current;
          s.pointer = e.pointerId;
          s.startX = e.clientX - s.x;
          s.startY = e.clientY - s.y;
          s.moved = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!draggable) return;
          const s = interaction.current;
          if (s.pointer !== e.pointerId) return;
          const dx = e.clientX - s.startX;
          const dy = e.clientY - s.startY;
          if (!s.moved && Math.hypot(dx - s.x, dy - s.y) > 5) {
            s.moved = true;
            react('drag');
          }
          if (s.moved) {
            s.targetX = 45 * Math.tanh(dx / 45);
            s.targetY = 27 * Math.tanh(dy / 27);
          }
        }}
        onPointerUp={(e) => {
          const s = interaction.current;
          if (s.pointer !== e.pointerId) return;
          const moved = s.moved;
          s.pointer = null;
          s.targetX = 0;
          s.targetY = 0;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          if (moved) react('release');
          else poke();
        }}
        onPointerCancel={() => {
          const s = interaction.current;
          s.pointer = null;
          s.targetX = 0;
          s.targetY = 0;
          clearReaction();
          setReaction(null);
        }}
        onLostPointerCapture={() => {
          const s = interaction.current;
          if (s.pointer !== null) {
            s.pointer = null;
            s.targetX = 0;
            s.targetY = 0;
            clearReaction();
            setReaction(null);
          }
        }}
      />
    </div>
  );
}
