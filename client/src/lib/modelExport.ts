import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { BBox } from '@viz/shared';

export interface ModelFix {
  /** Millimetres per file unit: 1 for mm, 10 for cm, 1000 for m, 25.4 for inch. */
  unitScale: number;
  /** Extra scale on top of the unit. */
  scale: number;
  /** Orientation fix, applied after the format's up-axis conversion. */
  rotation: THREE.Quaternion;
  /** Colour for models that carry none. */
  color: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Lay a model out the way the app stores it: millimetres, Z up, resting on the bench with the
 * centre of its base at the origin. `holder` must be a group whose only child is the model.
 */
export function applyFix(holder: THREE.Group, model: THREE.Object3D, upAxis: 'y' | 'z', fix: ModelFix): BBox {
  const toZUp = upAxis === 'y' ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2) : new THREE.Quaternion();
  holder.position.set(0, 0, 0);
  holder.quaternion.copy(fix.rotation).multiply(toZUp);
  holder.scale.setScalar(fix.unitScale * fix.scale);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  if (box.isEmpty()) return { min: [0, 0, 0], max: [0, 0, 0] };
  const center = box.getCenter(new THREE.Vector3());
  holder.position.set(-center.x, -center.y, -box.min.z);
  holder.updateMatrixWorld(true);
  const size = box.getSize(new THREE.Vector3());
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const std = m as THREE.MeshStandardMaterial;
      if (std.userData.fromFile === false) std.color.set(fix.color);
    }
  });
  return {
    min: [round2(-size.x / 2), round2(-size.y / 2), 0],
    max: [round2(size.x / 2), round2(size.y / 2), round2(size.z)],
  };
}

/** The rotation that puts the thinnest side of the model on the bench, as a board lies. */
export function layFlatRotation(model: THREE.Object3D, upAxis: 'y' | 'z'): THREE.Quaternion {
  const holder = new THREE.Group();
  const parent = model.parent;
  holder.add(model);
  if (upAxis === 'y') holder.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  holder.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3());
  holder.remove(model);
  if (parent) parent.add(model);
  const q = new THREE.Quaternion();
  if (size.x <= size.y && size.x <= size.z) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  else if (size.y <= size.x && size.y <= size.z) q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  return q;
}

/** Store the laid-out model as one binary glTF file. */
export async function exportGlb(holder: THREE.Object3D): Promise<ArrayBuffer> {
  const result = await new GLTFExporter().parseAsync(holder, { binary: true, onlyVisible: false });
  return result as ArrayBuffer;
}
