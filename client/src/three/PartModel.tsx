import { useMemo } from 'react';
import * as THREE from 'three';
import type { BBox, Part } from '@viz/shared';
import { fileUrl } from '../api';
import { boardGeometry, boardMaterial } from '../lib/boardGeometry';
import { useGlb } from '../lib/glb';

export function BoxOutline({ bbox, color, pad = 0.6 }: { bbox: BBox; color: string; pad?: number }) {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(bbox.max[0] - bbox.min[0] + pad * 2, bbox.max[1] - bbox.min[1] + pad * 2, bbox.max[2] - bbox.min[2] + pad * 2);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [bbox, pad]);
  return (
    <lineSegments
      geometry={geometry}
      position={[(bbox.min[0] + bbox.max[0]) / 2, (bbox.min[1] + bbox.max[1]) / 2, (bbox.min[2] + bbox.max[2]) / 2]}
    >
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

function GlbModel({ file, bbox }: { file: string; bbox: BBox }) {
  const state = useGlb(fileUrl(file));
  const clone = useMemo(() => (state.status === 'ready' ? state.object.clone(true) : null), [state]);
  if (clone) return <primitive object={clone} />;
  // Stand-in while the file loads, or when it cannot be found.
  return <BoxOutline bbox={bbox} color={state.status === 'error' ? '#d92d20' : '#98a2b3'} pad={0} />;
}

/** Draws a part in its own frame: millimetres, Z up, origin at the centre of its base. */
export function PartModel({ part }: { part: Part }) {
  if (part.model.kind === 'board') {
    return <mesh geometry={boardGeometry(part.model.spec)} material={boardMaterial} />;
  }
  return <GlbModel file={part.model.file} bbox={part.bbox} />;
}
