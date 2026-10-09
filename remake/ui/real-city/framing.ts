import * as THREE from 'three';
import type { RealBuilding } from '@geo/realCity';
import { mapAim, type MapInsets } from './view';

/** Fit the entire building into the map space left by the phone header and bottom sheet. */
export function frameBuilding(camera: THREE.PerspectiveCamera, target: THREE.Vector3, b: RealBuilding, width: number, height: number, insets: MapInsets) {
  const points = b.rings.flat();
  const spanX = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
  const spanZ = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
  const radius = Math.hypot(spanX, spanZ, b.height - b.minHeight) / 2 + 10;
  const usable = Math.max(70, Math.min(height - insets.top - insets.bottom - 65, width - insets.left - insets.right - 40));
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = Math.max(180, radius / Math.sin(fov / 2) * height / usable);
  const offset = camera.position.clone().sub(target).normalize().multiplyScalar(Math.min(2200, distance));
  target.set(b.center.x, (b.height + b.minHeight) / 2, b.center.y);
  camera.position.copy(target).add(offset); camera.lookAt(target); camera.updateMatrixWorld();
  const aim = mapAim(width, height, insets), worldHeight = 2 * offset.length() * Math.tan(fov / 2);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const shift = right.multiplyScalar((.5 - aim.x / width) * worldHeight * camera.aspect).add(up.multiplyScalar((aim.y / height - .5) * worldHeight));
  target.add(shift); camera.position.add(shift); camera.lookAt(target); camera.updateMatrixWorld();
}
