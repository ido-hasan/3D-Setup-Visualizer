import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useEffect, useState } from 'react';

const cache = new Map<string, Promise<THREE.Object3D>>();

/** Build the picking acceleration structure for every mesh under an object. */
export function prepareForPicking(object: THREE.Object3D): void {
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !mesh.geometry.boundsTree) mesh.geometry.computeBoundsTree();
  });
}

/** Load a stored model once and share it between every place that shows it. */
export function loadGlb(url: string): Promise<THREE.Object3D> {
  let p = cache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((gltf) => {
      prepareForPicking(gltf.scene);
      return gltf.scene as THREE.Object3D;
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export type GlbState = { status: 'loading' } | { status: 'ready'; object: THREE.Object3D } | { status: 'error' };

export function useGlb(url: string): GlbState {
  const [state, setState] = useState<GlbState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadGlb(url).then(
      (object) => live && setState({ status: 'ready', object }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [url]);
  return state;
}
