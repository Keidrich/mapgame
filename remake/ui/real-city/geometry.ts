import * as THREE from 'three';
import type { XY } from '@geo/project';
import { footprintArea, type RealCity, type RealBuilding } from '@geo/realCity';
import { hashString } from '@r/sim/rng';
import { windowTexture } from '../components/cityMaterials';

/** Earcut handles concave footprints and courtyards; the old convex quad fan cannot. */
export function polygonTriangles(rings: XY[][], height: number): number[] {
  const vectors = rings.map(r => r.map(p => new THREE.Vector2(p.x, p.y)));
  const all = rings.flat(), out: number[] = [];
  for (const tri of THREE.ShapeUtils.triangulateShape(vectors[0], vectors.slice(1))) {
    for (const i of [tri[0], tri[2], tri[1]]) out.push(all[i].x, height, all[i].y);
  }
  return out;
}

function ribbon(points: XY[], width: number, height: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.01) continue;
    const x = -(b.y - a.y) / len * width / 2, y = (b.x - a.x) / len * width / 2;
    out.push(...polygonTriangles([[{ x: a.x + x, y: a.y + y }, { x: b.x + x, y: b.y + y }, { x: b.x - x, y: b.y - y }, { x: a.x - x, y: a.y - y }]], height));
  }
  return out;
}

export function buildRealCity(city: RealCity) {
  const root = new THREE.Group(), disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { disposables.push(x); return x; };
  const geometry = (p: number[]) => { const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g; };
  const material = (color: string) => keep(new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  const surface = (p: number[], m: THREE.Material) => { const mesh = new THREE.Mesh(geometry(p), m); root.add(mesh); return mesh; };
  const land = material('#262c33'), curb = material('#505963'), asphalt = material('#1b222b'), park = material('#254c40');
  const { minX, minY, maxX, maxY } = city.bounds;
  surface(polygonTriangles([[{ x: minX - 200, y: minY - 200 }, { x: maxX + 200, y: minY - 200 }, { x: maxX + 200, y: maxY + 200 }, { x: minX - 200, y: maxY + 200 }]], -0.1), land);
  const cp: number[] = [], ap: number[] = [], pp: number[] = [];
  for (const s of city.streets) { cp.push(...ribbon(s.points, s.width + 4, 0)); ap.push(...ribbon(s.points, s.width, 0.08)); }
  for (const p of city.parks) pp.push(...polygonTriangles(p.rings, 0.16));
  surface(cp, curb); surface(ap, asphalt); surface(pp, park);

  // A pair of merged building meshes, irrespective of building count. Picking uses face tables.
  const walls: number[] = [], roofs: number[] = [], uv: number[] = [], colors: number[] = [], roofColors: number[] = [];
  const wallIds: string[] = [], roofIds: string[] = [];
  const palette = ['#8b7367', '#a68f78', '#71808b', '#736b67', '#92928a', '#8a6660'];
  for (const b of city.buildings) {
    const color = new THREE.Color(palette[hashString(b.id) % palette.length]);
    for (const ring of b.rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length], len = Math.hypot(c.x - a.x, c.y - a.y);
      walls.push(a.x, b.minHeight, a.y, c.x, b.minHeight, c.y, c.x, b.height, c.y, a.x, b.minHeight, a.y, c.x, b.height, c.y, a.x, b.height, a.y);
      const u = len / 48, v = b.height / 51.2, v0 = b.minHeight / 51.2;
      if (footprintArea(b) < 35 || ['roof','shed','hut','tank','tower'].includes(b.kind)) uv.push(...Array(12).fill(0));
      else uv.push(0, v0, u, v0, u, v, 0, v0, u, v, 0, v);
      for (let j = 0; j < 6; j++) colors.push(color.r, color.g, color.b);
      wallIds.push(b.id, b.id);
    }
    const p = polygonTriangles(b.rings, b.height);
    roofs.push(...p);
    for (let j = 0; j < p.length / 3; j++) roofColors.push(color.r * 0.74, color.g * 0.78, color.b * 0.82);
    for (let j = 0; j < p.length / 9; j++) roofIds.push(b.id);
  }
  const wg = geometry(walls); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wg.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const windows = keep(windowTexture());
  const wallMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#ffcf91', emissiveMap: windows, emissiveIntensity: 0.6 }));
  const wallMesh = new THREE.Mesh(wg, wallMat); root.add(wallMesh);
  const rg = geometry(roofs); rg.setAttribute('color', new THREE.Float32BufferAttribute(roofColors, 3));
  const roofMesh = new THREE.Mesh(rg, keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))); root.add(roofMesh);
  return { root, hits: [wallMesh, roofMesh], ids: [wallIds, roofIds], wallMat,
    setNight(night: boolean) { wallMat.emissiveIntensity = night ? 0.9 : 0.08; land.color.set(night ? '#262c33' : '#606963'); },
    dispose() { disposables.forEach(x => x.dispose()); } };
}

/** A separate selected shell keeps the city's merged meshes and picking tables intact. */
export function selectionGeometry(building: RealBuilding) {
  const positions = polygonTriangles(building.rings, building.height + 0.35);
  for (const ring of building.rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    positions.push(a.x, building.minHeight, a.y, b.x, building.minHeight, b.y, b.x, building.height + .35, b.y,
      a.x, building.minHeight, a.y, b.x, building.height + .35, b.y, a.x, building.height + .35, a.y);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Perimeter and corner edges only; no triangulation diagonals or hidden back-face scaffolding. */
export function selectionOutline(building: RealBuilding) {
  const positions: number[] = [], top = building.height + .4;
  for (const ring of building.rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], prev = ring[(i + ring.length - 1) % ring.length];
    positions.push(a.x, top, a.y, b.x, top, b.y);
    const cross = (a.x - prev.x) * (b.y - a.y) - (a.y - prev.y) * (b.x - a.x);
    if (Math.abs(cross) > .05) positions.push(a.x, building.minHeight, a.y, a.x, top, a.y);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Ground-level control wash keeps buildings and streets readable above it. */
export function buildTerritories(territories: { poly: XY[]; ownerId?: string; color: string }[]) {
  const root = new THREE.Group(), disposables: {dispose():void}[]=[];
  for (const t of territories) {
    if (!t.ownerId) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(polygonTriangles([t.poly],.24),3));
    const material = new THREE.MeshBasicMaterial({color:t.color,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(geometry,material); root.add(mesh); disposables.push(geometry,material);
    const outline = new THREE.BufferGeometry().setFromPoints([...t.poly,t.poly[0]].map(p=>new THREE.Vector3(p.x,.26,p.y)));
    const line = new THREE.LineBasicMaterial({color:t.color,transparent:true,opacity:.55,depthWrite:false});
    root.add(new THREE.Line(outline,line)); disposables.push(outline,line);
  }
  return {root,dispose(){disposables.forEach(x=>x.dispose());}};
}
