import { Html } from '@react-three/drei';
import { useThree, type RootState, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  expandStrip,
  makeStrip,
  moveStripEnd,
  moveStripStart,
  partPins,
  roundVec,
  snapToAxis,
  translateStrip,
  type Pin,
  type Strip,
  type Vec3,
} from '@viz/shared';
import { newId } from '../lib/util';
import { PartModel } from '../three/PartModel';
import { pinDetail, PinHighlight, PinMarkers } from '../three/PinMarkers';
import { beginPartGesture, endPartGesture, mutatePart, usePartEditor } from './store';

const ACCENT = '#2563eb';
const unitSphere = new THREE.SphereGeometry(1, 16, 12);
const accentColor = () => ACCENT;

const v3 = (v: Vec3): THREE.Vector3 => new THREE.Vector3(v[0], v[1], v[2]);
const arr = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

function rayAt(state: RootState, clientX: number, clientY: number): THREE.Ray {
  const rect = state.gl.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, state.camera);
  return raycaster.ray;
}

/**
 * Follow the pointer across a plane until the button is released.
 * onMove gets how far the pointer has travelled on the plane since the press.
 */
function dragOnPlane(
  state: RootState,
  press: { clientX: number; clientY: number },
  plane: THREE.Plane,
  onMove: (delta: THREE.Vector3, hit: THREE.Vector3, ev: PointerEvent) => void,
): void {
  const controls = state.controls as unknown as OrbitControlsImpl | null;
  const origin = rayAt(state, press.clientX, press.clientY).intersectPlane(plane, new THREE.Vector3());
  if (!origin) return;
  if (controls) controls.enabled = false;
  let moved = false;
  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - press.clientX, ev.clientY - press.clientY) < 4) return;
    const hit = rayAt(state, ev.clientX, ev.clientY).intersectPlane(plane, new THREE.Vector3());
    if (!hit) return;
    if (!moved) {
      moved = true;
      beginPartGesture();
    }
    onMove(hit.clone().sub(origin), hit, ev);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (controls) controls.enabled = true;
    if (moved) endPartGesture();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

/** Pull a direction onto the nearest axis when it is within about 12 degrees of it. */
function snapEnd(start: Vec3, end: Vec3, free: boolean): Vec3 {
  if (free) return end;
  const d: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const length = Math.hypot(...d);
  if (length < 1e-6) return end;
  const axis = snapToAxis(d);
  const along = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
  if (Math.abs(along) / length < Math.cos((12 * Math.PI) / 180)) return end;
  return [start[0] + axis[0] * along, start[1] + axis[1] * along, start[2] + axis[2] * along];
}

function nextName(prefix: string, taken: string[]): string {
  for (let n = 1; ; n++) if (!taken.includes(`${prefix}${n}`)) return `${prefix}${n}`;
}

function StripHandle({ strip, which }: { strip: Strip; which: 'start' | 'end' }) {
  const get = useThree((s) => s.get);
  const position = which === 'start' ? strip.start : strip.end;
  return (
    <mesh
      geometry={unitSphere}
      position={position}
      scale={2.1}
      renderOrder={30}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(v3(strip.normal), v3(position));
        const fixed = which === 'start' ? strip.end : strip.start;
        dragOnPlane(get(), e, plane, (_delta, hit, ev) => {
          const target = snapEnd(fixed, arr(hit), ev.altKey);
          const keepPitch = usePartEditor.getState().keepPitch;
          mutatePart((p) => {
            const i = p.strips.findIndex((s) => s.id === strip.id);
            if (i >= 0) p.strips[i] = which === 'end' ? moveStripEnd(strip, target, keepPitch) : moveStripStart(strip, target, keepPitch);
          }, true);
        });
      }}
    >
      <meshBasicMaterial color="#ffffff" depthTest={false} />
      <mesh geometry={unitSphere} scale={0.62} renderOrder={31}>
        <meshBasicMaterial color={ACCENT} depthTest={false} />
      </mesh>
    </mesh>
  );
}

export function PartScene() {
  const part = usePartEditor((s) => s.part)!;
  const tool = usePartEditor((s) => s.tool);
  const selection = usePartEditor((s) => s.selection);
  const stripStart = usePartEditor((s) => s.stripStart);
  const hoverPinId = usePartEditor((s) => s.hoverPinId);
  const showNames = usePartEditor((s) => s.showNames);
  const get = useThree((s) => s.get);
  const gl = useThree((s) => s.gl);
  const readOnly = Boolean(part.builtin);

  const pins = useMemo(() => partPins(part), [part]);
  const [cursor, setCursor] = useState<{ point: Vec3; normal: Vec3 } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<Vec3 | null>(null);
  const altKey = useRef(false);

  const selectedStrip = selection?.kind === 'strip' ? part.strips.find((s) => s.id === selection.id) : undefined;
  const selectedPins = useMemo(() => {
    if (selectedStrip) return expandStrip(selectedStrip);
    if (selection?.kind === 'pin') return pins.filter((p) => p.id === selection.id);
    return [];
  }, [selectedStrip, selection, pins]);
  const focusPin =
    selection?.kind === 'pin'
      ? selectedPins[0]
      : selectedStrip && selection?.kind === 'strip' && selection.index !== undefined
        ? selectedPins.find((p) => p.stripIndex === selection.index)
        : undefined;
  const hoverPin = hoverPinId ? pins.find((p) => p.id === hoverPinId) : undefined;

  // Strip tool: the far end follows the pointer across the plane of the first click.
  useEffect(() => {
    if (!stripStart) {
      setPreviewEnd(null);
      return;
    }
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(v3(stripStart.normal), v3(stripStart.point));
    const move = (ev: PointerEvent) => {
      altKey.current = ev.altKey;
      const hit = rayAt(get(), ev.clientX, ev.clientY).intersectPlane(plane, new THREE.Vector3());
      if (hit) setPreviewEnd(snapEnd(stripStart.point, arr(hit), ev.altKey));
    };
    gl.domElement.addEventListener('pointermove', move);
    return () => gl.domElement.removeEventListener('pointermove', move);
  }, [stripStart, get, gl]);

  const previewStrip = useMemo(
    () => (stripStart && previewEnd ? makeStrip(stripStart.point, previewEnd, { id: 'preview', name: 'J', normal: stripStart.normal }) : null),
    [stripStart, previewEnd],
  );
  const previewPins = useMemo(() => (previewStrip ? expandStrip(previewStrip) : []), [previewStrip]);
  const previewRef = useRef(previewStrip);
  previewRef.current = previewStrip;

  const surfaceHit = (e: ThreeEvent<PointerEvent | MouseEvent>): { point: Vec3; normal: Vec3 } => {
    const n = e.face ? e.face.normal.clone().transformDirection(e.object.matrixWorld) : new THREE.Vector3(0, 0, 1);
    return { point: roundVec(arr(e.point), 2), normal: snapToAxis(arr(n)) };
  };

  const finishStrip = () => {
    const s = usePartEditor.getState();
    const preview = previewRef.current;
    if (!s.stripStart || !preview || !s.part) return;
    const id = newId();
    const strip: Strip = { ...preview, id, name: nextName('J', s.part.strips.map((st) => st.name)) };
    mutatePart((p) => {
      p.strips.push(strip);
    });
    usePartEditor.setState({ stripStart: null, tool: 'select', selection: { kind: 'strip', id } });
  };

  const onModelClick = (e: ThreeEvent<MouseEvent>) => {
    if (readOnly || e.delta > 5 || tool === 'select') return;
    e.stopPropagation();
    const hit = surfaceHit(e);
    if (tool === 'pin') {
      const id = newId();
      mutatePart((p) => {
        p.pins.push({
          id,
          name: nextName('P', partPins(p).map((x) => x.name)),
          type: 'GPIO',
          position: hit.point,
          normal: hit.normal,
          gender: 'male',
        });
      });
      usePartEditor.setState({ selection: { kind: 'pin', id } });
    } else if (!stripStart) {
      usePartEditor.setState({ stripStart: hit, selection: null });
    } else {
      finishStrip();
    }
  };

  // A second strip click that lands beside the model still finishes the strip.
  useEffect(() => {
    if (!stripStart) return;
    let down: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => (down = { x: ev.clientX, y: ev.clientY });
    const onUp = (ev: PointerEvent) => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5 || ev.button !== 0) return;
      // Clicks on the model are handled by onModelClick; this covers the rest of the canvas.
      const state = get();
      const ray = rayAt(state, ev.clientX, ev.clientY);
      const raycaster = new THREE.Raycaster(ray.origin, ray.direction);
      const model = state.scene.getObjectByName('part-model');
      if (model && raycaster.intersectObject(model, true).length > 0) return;
      finishStrip();
    };
    gl.domElement.addEventListener('pointerdown', onDown);
    gl.domElement.addEventListener('pointerup', onUp);
    return () => {
      gl.domElement.removeEventListener('pointerdown', onDown);
      gl.domElement.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripStart]);

  const onPressPin = (pin: Pin, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    usePartEditor.setState({
      selection: pin.stripId ? { kind: 'strip', id: pin.stripId, index: pin.stripIndex } : { kind: 'pin', id: pin.id },
    });
    if (readOnly) return;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(v3(pin.normal), v3(pin.position));
    const strip = pin.stripId ? usePartEditor.getState().part?.strips.find((s) => s.id === pin.stripId) : undefined;
    dragOnPlane(get(), e, plane, (delta) => {
      mutatePart((p) => {
        if (strip) {
          const i = p.strips.findIndex((s) => s.id === strip.id);
          if (i >= 0) p.strips[i] = translateStrip(strip, arr(delta));
        } else {
          const target = p.pins.find((x) => x.id === pin.id);
          if (target) target.position = roundVec([pin.position[0] + delta.x, pin.position[1] + delta.y, pin.position[2] + delta.z], 2);
        }
      }, true);
    });
  };

  const placing = !readOnly && tool !== 'select';
  return (
    <>
      <group
        name="part-model"
        onClick={onModelClick}
        onPointerMove={placing ? (e) => (e.stopPropagation(), setCursor(surfaceHit(e))) : undefined}
        onPointerOut={placing ? () => setCursor(null) : undefined}
      >
        <PartModel part={part} />
      </group>

      {pins.length > 0 && (
        <PinMarkers
          pins={pins}
          onHover={tool === 'select' ? (pin) => usePartEditor.setState({ hoverPinId: pin?.id ?? null }) : undefined}
          onPress={tool === 'select' ? onPressPin : undefined}
        />
      )}
      {selectedStrip && selectedPins.length > 0 && <PinMarkers pins={selectedPins} radius={1.45} colorOf={accentColor} />}
      {selectedStrip && !readOnly && (
        <>
          <StripHandle strip={selectedStrip} which="start" />
          <StripHandle strip={selectedStrip} which="end" />
        </>
      )}
      {focusPin && <PinHighlight position={focusPin.position} name={focusPin.name} detail={pinDetail(focusPin)} />}
      {hoverPin && hoverPin.id !== focusPin?.id && <PinHighlight position={hoverPin.position} name={hoverPin.name} detail={pinDetail(hoverPin)} color="#1b2330" />}

      {showNames &&
        pins.map((p) =>
          p.id === focusPin?.id || p.id === hoverPin?.id ? null : (
            <Html key={p.id} position={[p.position[0], p.position[1], p.position[2] + 1.5]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div className="pin-tip" style={{ fontSize: 10, padding: '1px 4px', opacity: 0.85 }}>
                {p.name}
              </div>
            </Html>
          ),
        )}

      {/* Where the next click will land. */}
      {placing && cursor && !stripStart && (
        <mesh geometry={unitSphere} position={cursor.point} scale={1.1} renderOrder={25}>
          <meshBasicMaterial color={ACCENT} transparent opacity={0.7} depthTest={false} />
        </mesh>
      )}
      {stripStart && (
        <>
          <mesh geometry={unitSphere} position={stripStart.point} scale={1.3} renderOrder={25}>
            <meshBasicMaterial color={ACCENT} depthTest={false} />
          </mesh>
          {previewPins.length > 0 && <PinMarkers pins={previewPins} radius={1.1} colorOf={accentColor} />}
          {previewStrip && (
            <Html position={[previewStrip.end[0], previewStrip.end[1], previewStrip.end[2] + 4]} style={{ pointerEvents: 'none' }}>
              <div className="pin-tip">
                <strong>{previewStrip.count} pins</strong>
                <span>2.54 mm pitch</span>
              </div>
            </Html>
          )}
        </>
      )}
    </>
  );
}

