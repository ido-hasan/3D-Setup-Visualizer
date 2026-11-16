import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Pin, Vec3 } from '@viz/shared';
import { PIN_COLORS, PIN_TYPE_LABELS } from '../lib/pinColors';

const sphere = new THREE.SphereGeometry(1, 14, 10);
sphere.computeBoundsTree();
const markerMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92 });
/** Pickable but not drawn. */
const hiddenMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

interface PinMarkersProps {
  pins: Pin[];
  radius?: number;
  /** Called with the pin under the pointer, or null when it leaves. */
  onHover?: (pin: Pin | null) => void;
  onPick?: (pin: Pin, e: ThreeEvent<MouseEvent>) => void;
  onPress?: (pin: Pin, e: ThreeEvent<PointerEvent>) => void;
  colorOf?: (pin: Pin) => string;
  /** Keep the markers pickable without drawing them. */
  hidden?: boolean;
}

/** One small dot per pin, drawn in a single call however many pins there are. */
export function PinMarkers({ pins, radius = 1, onHover, onPick, onPress, colorOf, hidden }: PinMarkersProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const capacity = Math.max(1, pins.length);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    pins.forEach((pin, i) => {
      m.makeScale(radius, radius, radius).setPosition(pin.position[0], pin.position[1], pin.position[2]);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(colorOf ? colorOf(pin) : PIN_COLORS[pin.type]));
    });
    mesh.count = pins.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
  }, [pins, radius, colorOf]);

  const interactive = Boolean(onHover || onPick || onPress);
  const handlers = interactive
    ? {
        onPointerMove: (e: ThreeEvent<PointerEvent>) => {
          if (e.instanceId === undefined) return;
          e.stopPropagation();
          onHover?.(pins[e.instanceId] ?? null);
        },
        onPointerOut: () => onHover?.(null),
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
          if (!onPress || e.instanceId === undefined || e.button !== 0) return;
          const pin = pins[e.instanceId];
          if (pin) onPress(pin, e);
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (!onPick || e.instanceId === undefined || e.delta > 5) return;
          e.stopPropagation();
          const pin = pins[e.instanceId];
          if (pin) onPick(pin, e);
        },
      }
    : {};

  return <instancedMesh key={`${capacity}${hidden ? 'h' : ''}`} ref={ref} args={[sphere, hidden ? hiddenMaterial : markerMaterial, capacity]} frustumCulled={false} {...handlers} />;
}

interface PinHighlightProps {
  position: Vec3;
  name: string;
  detail?: string;
  color?: string;
  radius?: number;
  showLabel?: boolean;
}

/** A glow on one pin, with its name. */
export function PinHighlight({ position, name, detail, color = '#2563eb', radius = 1.9, showLabel = true }: PinHighlightProps) {
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthTest: false }),
    [color],
  );
  return (
    <group position={position}>
      <mesh geometry={sphere} material={material} scale={radius} renderOrder={10} />
      {showLabel && (
        <Html position={[0, 0, 3]} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
          <div className="pin-tip">
            <strong>{name}</strong>
            {detail && <span>{detail}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

export const pinDetail = (pin: Pin): string => PIN_TYPE_LABELS[pin.type];
