import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export type ModelFormat = 'step' | 'stl' | 'obj' | 'glb';

export interface LoadedModel {
  object: THREE.Object3D;
  format: ModelFormat;
  fileName: string;
  /** Which way is up in the file, by the convention of its format. */
  upAxis: 'y' | 'z';
  /** Unit the format normally uses. */
  unit: 'mm' | 'm';
  triangles: number;
  /** False when the file carries no colours, so the app picks one. */
  hasColor: boolean;
}

export const MODEL_EXTENSIONS = ['.step', '.stp', '.stl', '.obj', '.glb', '.gltf'];
export const DEFAULT_MODEL_COLOR = '#8c97a6';

const extOf = (name: string): string => name.slice(name.lastIndexOf('.')).toLowerCase();

function formatOf(name: string): ModelFormat | undefined {
  switch (extOf(name)) {
    case '.step':
    case '.stp':
      return 'step';
    case '.stl':
      return 'stl';
    case '.obj':
      return 'obj';
    case '.glb':
    case '.gltf':
      return 'glb';
    default:
      return undefined;
  }
}

function countTriangles(object: THREE.Object3D): number {
  let n = 0;
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}

interface OcctMesh {
  name?: string;
  color?: [number, number, number];
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
  brep_faces?: Array<{ first: number; last: number; color: [number, number, number] | null }>;
}

/** Convert a STEP file in a worker, so the page stays responsive on big files. */
function readStep(buffer: ArrayBuffer): Promise<{ success: boolean; meshes: OcctMesh[] }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/occt/occt-import-js-worker.js');
    worker.onmessage = (ev) => {
      worker.terminate();
      resolve(ev.data);
    };
    worker.onerror = (ev) => {
      worker.terminate();
      reject(new Error(ev.message || 'The STEP converter could not start.'));
    };
    worker.postMessage({ format: 'step', buffer: new Uint8Array(buffer), params: null });
  });
}

function stepToObject(meshes: OcctMesh[]): { object: THREE.Group; hasColor: boolean } {
  const group = new THREE.Group();
  let hasColor = false;
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const materialFor = (rgb: [number, number, number] | null | undefined): THREE.MeshStandardMaterial => {
    const key = rgb ? rgb.map((c) => c.toFixed(3)).join(',') : 'default';
    let m = materials.get(key);
    if (!m) {
      const color = rgb ? new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace) : new THREE.Color(DEFAULT_MODEL_COLOR);
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
      m.userData.fromFile = Boolean(rgb);
      materials.set(key, m);
    }
    return m;
  };

  for (const src of meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(src.attributes.position.array, 3));
    if (src.attributes.normal) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(src.attributes.normal.array, 3));
    geometry.setIndex(src.index.array);
    if (!src.attributes.normal) geometry.computeVertexNormals();

    const base = materialFor(src.color);
    if (src.color) hasColor = true;
    const faces = (src.brep_faces ?? []).filter((f) => f.color);
    let material: THREE.Material | THREE.Material[] = base;
    if (faces.length > 0) {
      // Faces can each carry a colour. Triangles in between keep the mesh colour.
      hasColor = true;
      const list: THREE.Material[] = [base];
      const indexOfMat = new Map<THREE.Material, number>([[base, 0]]);
      const triCount = src.index.array.length / 3;
      const addGroup = (first: number, last: number, mat: THREE.Material) => {
        if (last < first) return;
        let i = indexOfMat.get(mat);
        if (i === undefined) {
          i = list.length;
          list.push(mat);
          indexOfMat.set(mat, i);
        }
        geometry.addGroup(first * 3, (last - first + 1) * 3, i);
      };
      let cursor = 0;
      for (const f of [...faces].sort((a, b) => a.first - b.first)) {
        addGroup(cursor, f.first - 1, base);
        addGroup(f.first, f.last, materialFor(f.color));
        cursor = f.last + 1;
      }
      addGroup(cursor, triCount - 1, base);
      material = list;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = src.name ?? '';
    group.add(mesh);
  }
  return { object: group, hasColor };
}

/** Swap any non-standard materials for standard ones, which the GLB exporter stores faithfully. */
function standardiseMaterials(object: THREE.Object3D): boolean {
  let hasColor = false;
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const convert = (m: THREE.Material): THREE.Material => {
      const any = m as THREE.MeshPhongMaterial;
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        hasColor = true;
        return m;
      }
      const std = new THREE.MeshStandardMaterial({
        color: any.color ?? new THREE.Color(DEFAULT_MODEL_COLOR),
        map: any.map ?? null,
        roughness: 0.6,
        metalness: 0.1,
        transparent: any.transparent,
        opacity: any.opacity ?? 1,
        vertexColors: any.vertexColors,
        side: any.side,
      });
      const isDefault = !any.map && !any.vertexColors && (!any.color || any.color.getHexString() === 'ffffff');
      if (isDefault) std.color.set(DEFAULT_MODEL_COLOR);
      else hasColor = true;
      std.userData.fromFile = !isDefault;
      return std;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
  });
  return hasColor;
}

/**
 * Read a dropped model. Several files may be given: an OBJ may come with its MTL.
 * Throws an Error with a message meant for the user.
 */
export async function loadModelFiles(files: File[]): Promise<LoadedModel> {
  const main = files.find((f) => formatOf(f.name));
  if (!main) {
    throw new Error(`This file type is not supported. Use ${MODEL_EXTENSIONS.join(', ')}.`);
  }
  const format = formatOf(main.name)!;
  const base = { format, fileName: main.name };

  if (format === 'stl') {
    const geometry = new STLLoader().parse(await main.arrayBuffer());
    // Many STL writers leave the stored normals at zero, so work them out from the triangles.
    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
    if (geometry.attributes.position.count === 0) throw new Error('No surfaces were found in this STL file.');
    const colored = Boolean((geometry as THREE.BufferGeometry & { hasColors?: boolean }).hasColors);
    const material = new THREE.MeshStandardMaterial({
      color: colored ? '#ffffff' : DEFAULT_MODEL_COLOR,
      vertexColors: colored,
      roughness: 0.6,
      metalness: 0.1,
    });
    material.userData.fromFile = colored;
    const object = new THREE.Mesh(geometry, material);
    return { ...base, object, upAxis: 'z', unit: 'mm', triangles: countTriangles(object), hasColor: colored };
  }

  if (format === 'obj') {
    const loader = new OBJLoader();
    const mtl = files.find((f) => extOf(f.name) === '.mtl');
    if (mtl) {
      const materials = new MTLLoader().parse(await mtl.text(), '');
      materials.preload();
      loader.setMaterials(materials);
    }
    const object = loader.parse(await main.text());
    const hasColor = standardiseMaterials(object);
    if (countTriangles(object) === 0) throw new Error('No surfaces were found in this OBJ file.');
    return { ...base, object, upAxis: 'y', unit: 'mm', triangles: countTriangles(object), hasColor };
  }

  if (format === 'glb') {
    let gltf;
    try {
      gltf = await new GLTFLoader().parseAsync(await main.arrayBuffer(), '');
    } catch (e) {
      const hint = extOf(main.name) === '.gltf' ? ' A .gltf that points to separate files cannot be read; export a single .glb instead.' : '';
      throw new Error(`This glTF file could not be read.${hint}`);
    }
    const object = gltf.scene;
    standardiseMaterials(object);
    return { ...base, object, upAxis: 'y', unit: 'm', triangles: countTriangles(object), hasColor: true };
  }

  const result = await readStep(await main.arrayBuffer());
  if (!result?.success || !result.meshes?.length) {
    throw new Error('This STEP file could not be converted. It may be damaged or hold no solid shapes.');
  }
  const { object, hasColor } = stepToObject(result.meshes);
  return { ...base, object, upAxis: 'z', unit: 'mm', triangles: countTriangles(object), hasColor };
}
