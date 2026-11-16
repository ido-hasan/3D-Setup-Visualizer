import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BoardSpec } from '@viz/shared';

const cache = new WeakMap<BoardSpec, THREE.BufferGeometry>();

/** One merged, vertex-coloured mesh for a board drawn from boxes and cylinders. */
export function boardGeometry(spec: BoardSpec): THREE.BufferGeometry {
  const hit = cache.get(spec);
  if (hit) return hit;
  const color = new THREE.Color();
  const parts = spec.shapes.map((s) => {
    let g: THREE.BufferGeometry;
    if (s.kind === 'box') {
      g = new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]);
      if (s.rot) g.rotateZ((s.rot * Math.PI) / 180);
    } else {
      g = new THREE.CylinderGeometry(s.size[0] / 2, s.size[0] / 2, s.size[2], 24);
      if ((s.axis ?? 'z') === 'z') g.rotateX(Math.PI / 2);
      else if (s.axis === 'x') g.rotateZ(Math.PI / 2);
    }
    g.translate(s.pos[0], s.pos[1], s.pos[2]);
    color.set(s.color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.computeBoundsTree();
  cache.set(spec, merged);
  return merged;
}

export const boardMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 });
