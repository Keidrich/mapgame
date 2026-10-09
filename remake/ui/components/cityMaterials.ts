import * as THREE from 'three';
import { mulberry } from './mapgeo';

/** A night facade: a grid of windows, a few lit warm, fewer cool, most dark. Tiled up every wall. */
export function windowTexture(): THREE.Texture {
  const n = 16, px = 16, c = document.createElement('canvas'); c.width = c.height = n * px;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  const r = mulberry(7);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const roll = r();
    g.fillStyle = roll < 0.2 ? '#ffc877' : roll < 0.27 ? '#ffe4b8' : roll < 0.3 ? '#a9c4ff' : '#0b0c0e';
    g.fillRect(i * px + 4, j * px + 3, px - 8, px - 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.anisotropy = 4;
  return t;
}
