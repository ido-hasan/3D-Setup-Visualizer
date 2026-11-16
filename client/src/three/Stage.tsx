import { Canvas, useThree, type RootState } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, type MutableRefObject, type ReactNode } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { BBox } from '@viz/shared';

/** Lets code outside the canvas reach the camera, renderer and controls. */
export type StageBridge = MutableRefObject<(() => RootState) | null>;

function Bridge({ bridge }: { bridge: StageBridge }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    bridge.current = get;
    // End-to-end tests use this to turn bench positions into screen positions.
    (window as unknown as { __vizStage?: unknown }).__vizStage = get;
    return () => {
      bridge.current = null;
    };
  }, [bridge, get]);
  return null;
}

const benchMaterial = new THREE.ShaderMaterial({
  uniforms: {
    base: { value: new THREE.Color('#f3f5f8') },
    line: { value: new THREE.Color('#8f9bab') },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 base;
    uniform vec3 line;
    varying vec3 vWorld;
    // 1 on a grid line, 0 between lines, one pixel wide at any zoom.
    float grid(vec2 p, float cell) {
      vec2 q = p / cell;
      vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
      return 1.0 - min(min(g.x, g.y), 1.0);
    }
    void main() {
      float d = distance(cameraPosition, vWorld);
      float fine = grid(vWorld.xy, 10.0) * (1.0 - smoothstep(250.0, 900.0, d)) * 0.28;
      float coarse = grid(vWorld.xy, 50.0) * (1.0 - smoothstep(900.0, 3200.0, d)) * 0.5;
      gl_FragColor = vec4(mix(base, line, max(fine, coarse)), 1.0);
      #include <colorspace_fragment>
    }
  `,
});

/** The bench: a plane with a 10 mm grid and heavier lines every 50 mm, fading with distance. */
export function Bench({ size = 6000 }: { size?: number }) {
  return (
    <mesh position={[0, 0, -0.2]} material={benchMaterial}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}

interface StageProps {
  children: ReactNode;
  bridge?: StageBridge;
  cameraPosition?: [number, number, number];
  target?: [number, number, number];
  onPointerMissed?: (e: MouseEvent) => void;
  bench?: boolean;
}

/** The 3D viewport: lights, the bench, and orbit / pan / zoom controls. */
export function Stage({ children, bridge, cameraPosition = [150, -230, 200], target = [0, 0, 0], onPointerMissed, bench = true }: StageProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 32, near: 1, far: 8000, position: cameraPosition }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={onPointerMissed}
    >
      <color attach="background" args={['#f3f5f8']} />
      <fog attach="fog" args={['#f3f5f8', 2500, 6000]} />
      <hemisphereLight args={['#ffffff', '#aab2bf', 1.25]} position={[0, 0, 1]} />
      <directionalLight position={[120, -160, 300]} intensity={1.7} />
      <directionalLight position={[-200, 150, 150]} intensity={0.55} />
      {bench && <Bench />}
      {children}
      <OrbitControls makeDefault target={target} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={15} maxDistance={3000} />
      {bridge && <Bridge bridge={bridge} />}
    </Canvas>
  );
}

/** Run something as soon as the 3D view exists. It is created a moment after the page. */
export function whenStageReady(bridge: StageBridge, fn: (state: RootState) => void, tries = 60): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = (left: number) => {
    const state = bridge.current?.();
    if (state && state.controls && state.size.width > 0) fn(state);
    else if (left > 0) timer = setTimeout(() => attempt(left - 1), 50);
  };
  timer = setTimeout(() => attempt(tries), 30);
  return () => clearTimeout(timer);
}

export type ViewName = 'top' | 'front' | 'iso' | 'current';

const VIEW_DIRS: Record<Exclude<ViewName, 'current'>, THREE.Vector3> = {
  top: new THREE.Vector3(0, -0.002, 1).normalize(),
  front: new THREE.Vector3(0, -1, 0.22).normalize(),
  iso: new THREE.Vector3(0.5, -0.85, 0.8).normalize(),
};

/** Look at the scene from a named direction, optionally framing a box. */
export function setView(state: RootState, view: ViewName, frame?: BBox): void {
  const controls = state.controls as unknown as OrbitControlsImpl | null;
  const camera = state.camera as THREE.PerspectiveCamera;
  if (!controls) return;
  let distance = camera.position.distanceTo(controls.target);
  // "current" keeps the direction the user is looking from.
  const dir = view === 'current' ? camera.position.clone().sub(controls.target).normalize() : VIEW_DIRS[view];
  if (frame) {
    const min = new THREE.Vector3(...frame.min);
    const max = new THREE.Vector3(...frame.max);
    controls.target.copy(min).add(max).multiplyScalar(0.5);
    const radius = Math.max(40, max.distanceTo(min) / 2);
    const fov = (camera.fov * Math.PI) / 180;
    const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
    distance = (radius * 1.25) / Math.sin(fit / 2);
  }
  camera.position.copy(controls.target).addScaledVector(dir, distance);
  controls.update();
  state.invalidate();
}

/** Where a screen point lands on a horizontal plane. */
export function screenToPlane(state: RootState, clientX: number, clientY: number, z = 0): THREE.Vector3 | null {
  const rect = state.gl.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, state.camera);
  return rayToPlane(ray.ray, z);
}

export function rayToPlane(ray: THREE.Ray, z: number): THREE.Vector3 | null {
  if (Math.abs(ray.direction.z) < 1e-6) return null;
  const t = (z - ray.origin.z) / ray.direction.z;
  if (t < 0) return null;
  return ray.origin.clone().addScaledVector(ray.direction, t);
}
