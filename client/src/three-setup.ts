import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// The bench is the XY plane and Z points up, the way CAD files and board drawings are laid out.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

// Fast picking on detailed models.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
