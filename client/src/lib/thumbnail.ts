import * as THREE from 'three';
import type { BBox, Part } from '@viz/shared';
import { boardGeometry, boardMaterial } from './boardGeometry';

let renderer: THREE.WebGLRenderer | undefined;

function getRenderer(width: number, height: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
  }
  renderer.setSize(width, height, false);
  return renderer;
}

export function addStudioLights(scene: THREE.Scene): void {
  const hemi = new THREE.HemisphereLight('#ffffff', '#aab2bf', 1.25);
  hemi.position.set(0, 0, 1);
  const key = new THREE.DirectionalLight('#ffffff', 1.7);
  key.position.set(120, -160, 300);
  const fill = new THREE.DirectionalLight('#ffffff', 0.55);
  fill.position.set(-200, 150, 150);
  scene.add(hemi, key, fill);
}

/** Point a camera at a box from the front-right, above, so the whole box fits. */
export function frameBox(camera: THREE.PerspectiveCamera, bbox: BBox, margin = 1.15): void {
  const center = new THREE.Vector3(
    (bbox.min[0] + bbox.max[0]) / 2,
    (bbox.min[1] + bbox.max[1]) / 2,
    (bbox.min[2] + bbox.max[2]) / 2,
  );
  const radius = Math.max(1, new THREE.Vector3(...bbox.max).sub(new THREE.Vector3(...bbox.min)).length() / 2);
  const fov = (camera.fov * Math.PI) / 180;
  const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
  const distance = (radius * margin) / Math.sin(fit / 2);
  const dir = new THREE.Vector3(0.55, -0.9, 0.95).normalize();
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = distance / 50;
  camera.far = distance * 10;
  camera.up.set(0, 0, 1);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

/** Render an object to a PNG data URL. The object is put back where it was afterwards. */
export function renderThumbnail(object: THREE.Object3D, bbox: BBox, width = 320, height = 240): string {
  const r = getRenderer(width, height);
  const scene = new THREE.Scene();
  addStudioLights(scene);
  const parent = object.parent;
  scene.add(object);
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 5000);
  frameBox(camera, bbox);
  r.setClearColor(0x000000, 0);
  r.render(scene, camera);
  const url = r.domElement.toDataURL('image/png');
  scene.remove(object);
  if (parent) parent.add(object);
  return url;
}

const boardThumbs = new Map<string, string>();

/** Thumbnail for a part drawn by the app. Cached for the life of the page. */
export function boardThumbnail(part: Part): string | undefined {
  if (part.model.kind !== 'board') return undefined;
  let url = boardThumbs.get(part.id);
  if (!url) {
    const mesh = new THREE.Mesh(boardGeometry(part.model.spec), boardMaterial);
    url = renderThumbnail(mesh, part.bbox);
    boardThumbs.set(part.id, url);
  }
  return url;
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
