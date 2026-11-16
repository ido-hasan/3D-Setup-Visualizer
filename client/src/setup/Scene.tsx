import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useShallow } from 'zustand/react/shallow';
import { cableKeyPoints, cableKind, HOUSING_LENGTH, partPins, type BBox, type Pin, type Vec3 } from '@viz/shared';
import { BoxOutline, PartModel } from '../three/PartModel';
import { pinDetail, PinHighlight, PinMarkers } from '../three/PinMarkers';
import { rayToPlane } from '../three/Stage';
import {
  beginGesture,
  dragInstanceTo,
  endGesture,
  mutate,
  passengersOf,
  pickPin,
  select,
  useAnalysis,
  useEditor,
} from './store';

const ACCENT = '#2563eb';
const DANGER = '#d92d20';
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitSphere = new THREE.SphereGeometry(1, 16, 12);
const proxyMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const hiddenMarkerColor = () => '#98a2b3';
const MISSING_BOX: BBox = { min: [-18, -12, 0], max: [18, 12, 6] };

function useControls(): OrbitControlsImpl | null {
  return useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
}

// Instances

function InstanceView({ id }: { id: string }) {
  const inst = useEditor((s) => s.doc.instances.find((i) => i.id === id));
  const part = useEditor((s) => (inst ? s.parts[inst.partId] : undefined));
  const tool = useEditor((s) => s.tool);
  const readOnly = useEditor((s) => s.readOnly);
  const selected = useEditor((s) => s.selection?.kind === 'instance' && s.selection.id === id);
  const hovered = useEditor((s) => s.hoverInstance === id);
  const controls = useControls();
  const drag = useRef<{ offX: number; offY: number; planeZ: number; startX: number; startY: number; moved: boolean; passengers: string[] } | null>(null);

  const pins = useMemo(() => (part ? partPins(part) : []), [part]);
  if (!inst) return null;
  const bbox = part?.bbox ?? MISSING_BOX;
  const size: Vec3 = [bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]];
  const center: Vec3 = [(bbox.min[0] + bbox.max[0]) / 2, (bbox.min[1] + bbox.max[1]) / 2, (bbox.min[2] + bbox.max[2]) / 2];
  const wiring = tool === 'wire' && !readOnly;
  const showPins = wiring || hovered || selected;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || wiring) return;
    // A cable or one of its handles in front of or inside the box wins.
    if (e.intersections.some((hit) => hit.object.userData.cablePart)) return;
    e.stopPropagation();
    select({ kind: 'instance', id });
    if (readOnly) return;
    drag.current = {
      offX: e.point.x - inst.x,
      offY: e.point.y - inst.y,
      planeZ: e.point.z,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      passengers: passengersOf(id),
    };
    (e.target as Element).setPointerCapture(e.pointerId);
    if (controls) controls.enabled = false;
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
      d.moved = true;
      beginGesture();
    }
    const p = rayToPlane(e.ray, d.planeZ);
    if (!p) return;
    dragInstanceTo(id, p.x - d.offX, p.y - d.offY, d.passengers, useEditor.getState().snapGrid && !e.altKey);
  };

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (controls) controls.enabled = true;
    if (d.moved) endGesture();
  };

  const hoverPin = (pin: Pin | null) => {
    const s = useEditor.getState();
    const same = pin ? s.hoverPin?.instanceId === id && s.hoverPin.pinId === pin.id : s.hoverPin?.instanceId !== id;
    if (same) return;
    useEditor.setState({ hoverPin: pin ? { instanceId: id, pinId: pin.id } : null });
  };

  return (
    <group position={[inst.x, inst.y, inst.z]} rotation={[0, 0, (inst.rotZ * Math.PI) / 180]}>
      {part ? (
        <PartModel part={part} />
      ) : (
        <>
          <BoxOutline bbox={MISSING_BOX} color={DANGER} pad={0} />
          <Html position={[0, 0, 8]} style={{ pointerEvents: 'none' }}>
            <div className="scene-label" style={{ color: 'var(--danger)' }}>
              Missing part
            </div>
          </Html>
        </>
      )}
      <mesh
        geometry={unitBox}
        material={proxyMaterial}
        position={center}
        scale={size}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerOver={() => useEditor.setState({ hoverInstance: id })}
        onPointerOut={() => useEditor.getState().hoverInstance === id && useEditor.setState({ hoverInstance: null })}
      />
      {selected && <BoxOutline bbox={bbox} color={ACCENT} />}
      {showPins && pins.length > 0 && (
        <PinMarkers
          pins={pins}
          radius={part?.isBreadboard ? 1.05 : 1}
          // Breadboard holes are already drawn on the board, so their markers stay invisible.
          hidden={part?.isBreadboard}
          colorOf={part?.isBreadboard ? hiddenMarkerColor : undefined}
          onHover={hoverPin}
          onPick={wiring ? (pin) => pickPin({ instanceId: id, pinId: pin.id }) : undefined}
        />
      )}
    </group>
  );
}

// Cables

function basisFor(normal: THREE.Vector3): THREE.Quaternion {
  const z = normal.clone().normalize();
  const x = new THREE.Vector3(0, 0, 1).cross(z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = z.clone().cross(x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function Plug({ position, normal, usb }: { position: Vec3; normal: Vec3; usb: boolean }) {
  const length = usb ? 14 : HOUSING_LENGTH;
  const n = useMemo(() => new THREE.Vector3(...normal), [normal]);
  const quaternion = useMemo(() => basisFor(n), [n]);
  const pos = useMemo(() => new THREE.Vector3(...position).addScaledVector(n, length / 2), [position, n, length]);
  return (
    <mesh geometry={unitBox} position={pos} quaternion={quaternion} scale={usb ? [12, 4.6, length] : [2.4, 2.4, length]}>
      <meshStandardMaterial color={usb ? '#d5d8dd' : '#1e1e21'} roughness={0.6} />
    </mesh>
  );
}

function ControlHandle({ cableId, index, position, ghost }: { cableId: string; index: number; position: Vec3; ghost: boolean }) {
  const controls = useControls();
  const camera = useThree((s) => s.camera);
  const drag = useRef<{ plane: THREE.Plane; index: number } | null>(null);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(...position));
    beginGesture();
    if (ghost) {
      // Dragging a ghost handle turns it into a real point on the route.
      mutate((d) => {
        d.cables.find((c) => c.id === cableId)?.controlPoints.splice(index, 0, position);
      }, true);
    }
    drag.current = { plane, index };
    (e.target as Element).setPointerCapture(e.pointerId);
    if (controls) controls.enabled = false;
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const hit = e.ray.intersectPlane(d.plane, new THREE.Vector3());
    if (!hit) return;
    mutate((doc) => {
      const cable = doc.cables.find((c) => c.id === cableId);
      if (cable?.controlPoints[d.index]) cable.controlPoints[d.index] = [hit.x, hit.y, Math.max(1, hit.z)];
    }, true);
  };
  const end = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (controls) controls.enabled = true;
    endGesture();
  };
  const remove = (e: ThreeEvent<MouseEvent>) => {
    if (ghost) return;
    e.stopPropagation();
    mutate((d) => {
      d.cables.find((c) => c.id === cableId)?.controlPoints.splice(index, 1);
    });
  };

  return (
    <mesh
      geometry={unitSphere}
      position={position}
      scale={ghost ? 1.7 : 2.2}
      userData={{ cablePart: true, handle: true }}
      renderOrder={20}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={remove}
    >
      <meshBasicMaterial color={ghost ? '#ffffff' : ACCENT} transparent opacity={ghost ? 0.85 : 1} depthTest={false} />
    </mesh>
  );
}

function CableView({ id }: { id: string }) {
  const cable = useEditor((s) => s.doc.cables.find((c) => c.id === id));
  const selected = useEditor((s) => s.selection?.kind === 'cable' && s.selection.id === id);
  const readOnly = useEditor((s) => s.readOnly);
  const tool = useEditor((s) => s.tool);
  const showLabels = useEditor((s) => s.showLabels);
  const highlightIssue = useEditor((s) => s.highlightIssue);
  const analysis = useAnalysis();

  const a = cable ? analysis.index.resolve(cable.from) : undefined;
  const b = cable ? analysis.index.resolve(cable.to) : undefined;
  const dangling = !a || !b;
  const usb = !dangling && cableKind(a.pin, b.pin) === 'usb';

  // A lost end is drawn hovering over its board, or over the bench when the board is gone too.
  const fallback = (ref: { instanceId: string } | undefined, other: Vec3 | undefined): { position: Vec3; normal: Vec3 } => {
    const inst = ref ? analysis.index.instances.get(ref.instanceId) : undefined;
    if (inst) return { position: [inst.x, inst.y, inst.z + 12], normal: [0, 0, 1] };
    return { position: other ? [other[0] + 25, other[1], 4] : [0, 0, 4], normal: [0, 0, 1] };
  };
  const endA = a ?? fallback(cable?.from, b?.position);
  const endB = b ?? fallback(cable?.to, a?.position);
  const controlPoints = cable?.controlPoints ?? [];
  const key = JSON.stringify([endA.position, endA.normal, endB.position, endB.normal, controlPoints, usb]);

  const { curve, tube, pickTube, glowTube, points } = useMemo(() => {
    const pts = cableKeyPoints(endA, endB, controlPoints, usb ? 14 : HOUSING_LENGTH);
    const c = new THREE.CatmullRomCurve3(
      pts.map((p) => new THREE.Vector3(...p)),
      false,
      'centripetal',
    );
    const segments = Math.max(40, pts.length * 14);
    const r = usb ? 1.7 : 0.65;
    return {
      points: pts,
      curve: c,
      tube: new THREE.TubeGeometry(c, segments, r, 8),
      pickTube: new THREE.TubeGeometry(c, Math.round(segments / 2), 2.6, 5),
      glowTube: new THREE.TubeGeometry(c, segments, r + 1, 8),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!cable) return null;
  const issueHit = Boolean(highlightIssue && analysis.issues.find((i) => i.id === highlightIssue)?.cableIds.includes(id));
  const color = dangling ? DANGER : cable.color;
  const interactive = tool === 'select';

  const ghosts: Array<{ index: number; position: Vec3 }> = [];
  if (selected && !readOnly) {
    if (controlPoints.length === 0) {
      ghosts.push({ index: 0, position: points[2] });
    } else {
      // One ghost in the middle of each stretch between real points.
      const last = points.length - 1;
      for (let seg = 1; seg <= controlPoints.length + 1; seg++) {
        const p = curve.getPoint((seg + 0.5) / last);
        ghosts.push({ index: seg - 1, position: [p.x, p.y, p.z] });
      }
    }
  }
  const mid = curve.getPoint(0.5);

  return (
    <group>
      <mesh geometry={tube}>
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      {(selected || issueHit || dangling) && (
        <mesh geometry={glowTube} renderOrder={5}>
          <meshBasicMaterial color={issueHit || dangling ? DANGER : ACCENT} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      {interactive && (
        <mesh
          geometry={pickTube}
          material={proxyMaterial}
          userData={{ cablePart: true }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            // A routing handle sits inside this click area. Let it take the press.
            if (e.intersections.some((hit) => hit.object.userData.handle)) return;
            e.stopPropagation();
            select({ kind: 'cable', id });
          }}
        />
      )}
      {a && <Plug position={a.position} normal={a.normal} usb={usb} />}
      {b && <Plug position={b.position} normal={b.normal} usb={usb} />}
      {selected &&
        !readOnly &&
        controlPoints.map((cp, i) => <ControlHandle key={`p${i}`} cableId={id} index={i} position={cp} ghost={false} />)}
      {ghosts.map((g) => (
        <ControlHandle key={`g${g.index}`} cableId={id} index={g.index} position={g.position} ghost />
      ))}
      {showLabels && cable.label && (
        <Html position={[mid.x, mid.y, mid.z]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="cable-label">{cable.label}</div>
        </Html>
      )}
    </group>
  );
}

/** The cable being drawn: from the first pin to the pointer. */
function WirePreview() {
  const wireFrom = useEditor((s) => s.wireFrom);
  const analysis = useAnalysis();
  const ref = useRef<THREE.Mesh>(null);
  const from = wireFrom ? analysis.index.resolve(wireFrom) : undefined;

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh || !from) return;
    const { hoverPin } = useEditor.getState();
    const target = hoverPin ? analysis.index.resolve(hoverPin) : undefined;
    let end: { position: Vec3; normal: Vec3 } | undefined;
    if (target && target.key !== from.key) end = target;
    else {
      state.raycaster.setFromCamera(state.pointer, state.camera);
      const p = rayToPlane(state.raycaster.ray, 6);
      if (p) end = { position: [p.x, p.y, p.z], normal: [0, 0, 1] };
    }
    if (!end) return;
    const pts = cableKeyPoints(from, end, [], target ? HOUSING_LENGTH : 0).map((p) => new THREE.Vector3(...p));
    mesh.geometry.dispose();
    mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 40, 0.65, 6);
  });

  if (!from) return null;
  return (
    <>
      <mesh ref={ref}>
        <bufferGeometry />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.75} />
      </mesh>
      <PinHighlight position={from.position} name={from.pin.name} color={ACCENT} showLabel={false} />
    </>
  );
}

function HoveredPin() {
  const hoverPin = useEditor((s) => s.hoverPin);
  const analysis = useAnalysis();
  const r = hoverPin ? analysis.index.resolve(hoverPin) : undefined;
  if (!r) return null;
  const net = analysis.netlist.netOfPin.get(r.key);
  const others = net ? net.pins.filter((p) => p.key !== r.key && !p.part.isBreadboard).length : 0;
  const detail = r.part.isBreadboard ? (others ? `joined to ${others} pin${others > 1 ? 's' : ''}` : 'breadboard hole') : pinDetail(r.pin);
  return <PinHighlight position={r.position} name={r.pin.name} detail={detail} />;
}

/** A warning mark above each board that has a problem. */
function IssueBadges() {
  const analysis = useAnalysis();
  const badges = useMemo(() => {
    const worst = new Map<string, 'error' | 'warning'>();
    for (const issue of analysis.issues) {
      for (const id of issue.instanceIds) {
        if (issue.severity === 'error' || !worst.has(id)) worst.set(id, issue.severity);
      }
    }
    return [...worst.entries()];
  }, [analysis]);
  const parts = useEditor((s) => s.parts);
  return (
    <>
      {badges.map(([id, severity]) => {
        const inst = analysis.index.instances.get(id);
        if (!inst) return null;
        const top = (parts[inst.partId]?.bbox.max[2] ?? 6) + inst.z + 9;
        return (
          <Html key={id} position={[inst.x, inst.y, top]} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`warn-badge ${severity}`}>!</div>
          </Html>
        );
      })}
    </>
  );
}

export function Scene() {
  const instanceIds = useEditor(useShallow((s) => s.doc.instances.map((i) => i.id)));
  const cableIds = useEditor(useShallow((s) => s.doc.cables.map((c) => c.id)));
  return (
    <>
      {instanceIds.map((id) => (
        <InstanceView key={id} id={id} />
      ))}
      {cableIds.map((id) => (
        <CableView key={id} id={id} />
      ))}
      <WirePreview />
      <HoveredPin />
      <IssueBadges />
    </>
  );
}
