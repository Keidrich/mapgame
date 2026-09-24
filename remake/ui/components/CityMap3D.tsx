/**
 * The city in 3D (three.js), as an alternative to the flat map (`CityMap.tsx`). It is loaded only
 * when the player turns 3D on (`store.map3d`), so the flat map pays nothing for it.
 *
 * Everything is built from the generated city: every lot in `mapgeo.lotQuads` is extruded to a
 * height set by its district, wealth and a seeded roll. Walls carry a night texture of lit windows,
 * so the city reads by its own light. Block slabs sit under the buildings and are tinted by the
 * overlay (who holds it, heat, money, police): your ground glows amber from street level. An amber
 * beam stands on the block you are on.
 *
 * Performance shape (an iPhone must hold this at 60fps):
 * - All buildings are two merged meshes (walls, roofs); all slabs one mesh with a triangle→block
 *   table for picking.
 * - Overlay changes rewrite one colour buffer; nothing is rebuilt unless the city itself changes.
 * - It renders only when something moved: the camera, the world, a resize.
 *
 * Gestures (MapControls): one finger pans across the ground, two pinch and turn, and a two-finger
 * drag up or down tilts. A tap that did not move picks the block under it.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { select, PLAYER, type World } from '@r/sim/index';
import type { Block, City, Id, Vec } from '@r/sim/types';
import type { Layer } from '../store';
import { lotQuads, mulberry, blockNo, treesFor } from './mapgeo';
import { mute } from './tone';

const AMBER = new THREE.Color('#e9a23b');
const HEIGHT: Record<string, number> = { downtown: 2.4, strip: 1.2, market: 1, heights: 0.75, projects: 1.5, docks: 0.55, industrial: 0.7, oldtown: 0.6, suburb: 0.35 };

export interface Map3DProps { w: World; layer?: Layer; night?: boolean; onBlock?: (id: Id) => void; selected?: Id; focus?: { blockId: Id; n: number } }

/** True when this device can draw WebGL at all; the caller falls back to the flat map when not. */
export function canWebGL(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/** A night facade: a grid of windows, a few lit warm, fewer cool, most dark. Tiled up every wall. */
function windowTexture(): THREE.Texture {
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

/** One flat polygon, fanned into triangles (block rings are convex enough for a fan). */
function pushPoly(pos: number[], poly: Vec[], y: number) {
  for (let i = 1; i < poly.length - 1; i++) pos.push(poly[0].x, y, poly[0].y, poly[i + 1].x, y, poly[i + 1].y, poly[i].x, y, poly[i].y);
}

interface Built {
  mats: { walls: THREE.MeshLambertMaterial; ground: THREE.MeshLambertMaterial; water: THREE.MeshPhongMaterial };
  root: THREE.Group;
  slabs: THREE.Mesh; slabBlock: Id[]; slabColor: THREE.BufferAttribute;
  roofBlock: Id[]; roofColor: THREE.BufferAttribute;
  hits: THREE.Mesh[]; hitBlock: Id[][];
  cell: number;
  dispose: () => void;
}

/** The static city: slabs, buildings, water, bridges, trees. Built once per city. */
function build(w: World): Built {
  const city: City = w.city;
  const root = new THREE.Group();
  const blocks = Object.values(w.blocks);
  const cell = city.width / Math.max(1, city.cols);
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x; };

  // ground past the edge of town
  const groundMat = keep(new THREE.MeshLambertMaterial({ color: '#101114' }));
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(city.width * 6, city.height * 6)), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(city.width / 2, -1, city.height / 2);
  root.add(ground);

  // block slabs: the pavement, tinted by the overlay; one mesh, with which block each triangle is
  const sp: number[] = []; const slabBlock: Id[] = [];
  for (const b of blocks) { const before = sp.length / 9; pushPoly(sp, b.poly, 0); for (let k = before; k < sp.length / 9; k++) slabBlock.push(b.id); }
  const sg = keep(new THREE.BufferGeometry());
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.computeVertexNormals();
  const slabColor = new THREE.Float32BufferAttribute(new Float32Array((sp.length / 3) * 3), 3);
  sg.setAttribute('color', slabColor);
  const slabs = new THREE.Mesh(sg, keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
  root.add(slabs);

  // buildings: walls with lit windows, dark roofs; each lot a box, its height from where it stands
  const wp: number[] = [], wn: number[] = [], wu: number[] = [], wc: number[] = [];
  const rp: number[] = [];
  const wallBlock: Id[] = [], roofBlock: Id[] = [];
  const floor = cell * 0.035, bay = cell * 0.03;
  for (const b of blocks) {
    if (select.isParkBlock(b)) continue;
    const kind = w.districts[b.districtId]?.kind ?? 'market';
    const r = mulberry(blockNo(b) * 31337 + 11);
    const tall = (HEIGHT[kind] ?? 1) * (0.8 + b.wealth / 250) * cell * 0.16;
    for (const q of lotQuads(city, b)) {
      const roll = r();
      // most lots low, a few much taller: a skyline, not a crate of equal boxes
      const h = Math.max(floor * 2, tall * (0.45 + roll * roll * 2.2) + (b.landmark && roll > 0.7 ? tall : 0));
      const shade = 0.75 + r() * 0.35;
      const ou = Math.floor(r() * 16) / 16, ov = Math.floor(r() * 16) / 16;
      let along = 0;
      for (let k = 0; k < 4; k++) {
        const a = q[k], c = q[(k + 1) % 4];
        const len = Math.hypot(c.x - a.x, c.y - a.y);
        const nx = (c.y - a.y) / (len || 1), nz = -(c.x - a.x) / (len || 1);
        const u0 = ou + along / (bay * 16), u1 = ou + (along + len) / (bay * 16), v1 = ov + h / (floor * 16);
        along += len;
        // two triangles per wall, outward facing
        wp.push(a.x, 0, a.y, c.x, 0, c.y, c.x, h, c.y, a.x, 0, a.y, c.x, h, c.y, a.x, h, a.y);
        for (let m = 0; m < 6; m++) { wn.push(-nx, 0, -nz); wc.push(shade, shade, shade); }
        wu.push(u0, ov, u1, ov, u1, v1, u0, ov, u1, v1, u0, v1);
        wallBlock.push(b.id, b.id);
      }
      rp.push(q[0].x, h, q[0].y, q[2].x, h, q[2].y, q[1].x, h, q[1].y, q[0].x, h, q[0].y, q[3].x, h, q[3].y, q[2].x, h, q[2].y);
      roofBlock.push(b.id, b.id);
    }
  }
  const wg = keep(new THREE.BufferGeometry());
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wg.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
  const tex = keep(windowTexture());
  const wallMat = keep(new THREE.MeshLambertMaterial({ color: '#4a505a', vertexColors: true, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1, side: THREE.DoubleSide }));
  const walls = new THREE.Mesh(wg, wallMat);
  root.add(walls);
  // roofs carry the overlay: from above, who holds a block reads off the tops of its buildings
  const rg = keep(new THREE.BufferGeometry());
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.computeVertexNormals();
  const roofColor = new THREE.Float32BufferAttribute(new Float32Array(rp.length), 3);
  rg.setAttribute('color', roofColor);
  const roofs = new THREE.Mesh(rg, keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  root.add(roofs);

  // water over the land, a little below the street
  const waterMat = keep(new THREE.MeshPhongMaterial({ color: '#08121f', specular: '#34507a', shininess: 60 }));
  if (city.sea) { const p: number[] = []; pushPoly(p, city.sea, 0.6); const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, waterMat); m.material.side = THREE.DoubleSide; root.add(m); }
  if (city.river) {
    const path = city.river.path, half = city.river.width / 2, p: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], c = path[i + 1], len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      const nx = -(c.y - a.y) / len * half, nz = (c.x - a.x) / len * half;
      p.push(a.x + nx, 0.6, a.y + nz, c.x + nx, 0.6, c.y + nz, c.x - nx, 0.6, c.y - nz, a.x + nx, 0.6, a.y + nz, c.x - nx, 0.6, c.y - nz, a.x - nx, 0.6, a.y - nz);
    }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, waterMat); waterMat.side = THREE.DoubleSide; root.add(m);
  }
  const bridgeMat = keep(new THREE.MeshLambertMaterial({ color: '#2e333b' }));
  for (const br of city.bridges) {
    const len = Math.hypot(br.to.x - br.from.x, br.to.y - br.from.y);
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(len, 3, cell * 0.08)), bridgeMat);
    m.position.set((br.from.x + br.to.x) / 2, 3, (br.from.y + br.to.y) / 2);
    m.rotation.y = -Math.atan2(br.to.y - br.from.y, br.to.x - br.from.x);
    root.add(m);
  }
  // parks: dark trees, one instanced mesh
  const trees = blocks.filter(select.isParkBlock).flatMap(treesFor);
  if (trees.length) {
    const tm = new THREE.InstancedMesh(keep(new THREE.ConeGeometry(cell * 0.035, cell * 0.12, 6)), keep(new THREE.MeshLambertMaterial({ color: '#1a2c22' })), trees.length);
    const o = new THREE.Object3D();
    trees.forEach((t, i) => { o.position.set(t.x, cell * 0.06, t.y); o.updateMatrix(); tm.setMatrixAt(i, o.matrix); });
    root.add(tm);
  }
  return {
    root, slabs, slabBlock, slabColor, roofBlock, roofColor, cell,
    mats: { walls: wallMat, ground: groundMat, water: waterMat },
    hits: [slabs, walls, roofs], hitBlock: [slabBlock, wallBlock, roofBlock],
    dispose: () => disposables.forEach(d => d.dispose()),
  };
}

/** What a block's slab looks like under an overlay: the same rules as the flat map's fills. */
function slabTint(w: World, b: Block, layer: Layer, night = true): THREE.Color {
  const base = new THREE.Color(select.isParkBlock(b) ? (night ? '#16241b' : '#3d5a45') : (night ? '#1d2025' : '#6d7178'));
  let col: THREE.Color | undefined, k = 0;
  if (layer === 'control') {
    let best = 0, who: string | undefined;
    for (const [o, v] of Object.entries(b.influence)) if (v > best) { best = v; who = o; }
    if (who && best >= 8) { col = who === PLAYER ? AMBER.clone() : new THREE.Color(mute(w.factions[who]?.color ?? '#888')); k = select.blockController(w, b.id) ? 0.55 + Math.min(0.35, best / 250) : 0.2 + best / 300; }
  } else if (layer === 'heat') { if (b.heat > 2) { col = new THREE.Color('#e8573f'); k = Math.min(0.85, b.heat / 90 + 0.1); } }
  else if (layer === 'wealth') { col = new THREE.Color('#3f9f7a'); k = b.wealth / 140; }
  else { col = new THREE.Color('#5b8def'); k = (w.districts[b.districtId]?.attention ?? 0) / 130; }
  return col ? base.lerp(col, Math.min(1, k)) : base;
}

export default function CityMap3D({ w, layer = 'control', night = true, onBlock, selected, focus }: Map3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  // the three.js side lives outside React: created once per city, fed the world on every change
  const three = useRef<{ sky: THREE.HemisphereLight; moon: THREE.DirectionalLight; beamMat: THREE.MeshBasicMaterial; renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: MapControls; built: Built; dirty: () => void; beacon: THREE.Group; marks: THREE.Group; outline: THREE.LineLoop; sel: THREE.LineLoop; fly: (x: number, z: number) => void; dispose: () => void } | null>(null);
  const cb = useRef({ onBlock });
  cb.current.onBlock = onBlock;

  // ---------------------------------------------------------------- the scene, once per city
  useEffect(() => {
    const el = host.current; if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const built = build(w);
    const { cell } = built;
    const span = Math.max(w.city.width, w.city.height);
    scene.background = new THREE.Color('#07080a');
    scene.fog = new THREE.FogExp2('#07080a', 1.1 / span);
    scene.add(built.root);
    const sky = new THREE.HemisphereLight('#6a6660', '#141416', 1.5); scene.add(sky);
    const moon = new THREE.DirectionalLight('#b8c2d6', 0.7); moon.position.set(-0.4, 1, 0.3); scene.add(moon);

    const camera = new THREE.PerspectiveCamera(42, 1, cell * 0.05, span * 6);
    const controls = new MapControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12;
    controls.screenSpacePanning = false;
    controls.minDistance = cell * 1.2; controls.maxDistance = span * 1.4;
    controls.minPolarAngle = 0.12; controls.maxPolarAngle = 1.2;
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    const here = w.blocks[w.player.blockId] ?? Object.values(w.blocks)[0];
    controls.target.set(here.center.x, 0, here.center.y);
    camera.position.set(here.center.x - cell * 1.5, cell * 5.5, here.center.y + cell * 5);
    controls.update();

    // the beacon on your block, your places, the outlines
    const beacon = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(cell * 0.03, cell * 0.07, cell * 5, 16, 1, true), beamMat);
    beam.position.y = cell * 2.5; beacon.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(cell * 0.14, cell * 0.2, 32), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 2; beacon.add(ring);
    const glow = new THREE.PointLight(AMBER, 3, cell * 3, 1.4); glow.position.y = cell * 0.4; beacon.add(glow);
    scene.add(beacon);
    const marks = new THREE.Group(); scene.add(marks);
    const lineMat = (c: string) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.95 });
    const outline = new THREE.LineLoop(new THREE.BufferGeometry(), lineMat('#e9a23b')); scene.add(outline);
    const sel = new THREE.LineLoop(new THREE.BufferGeometry(), lineMat('#ede8df')); scene.add(sel);

    let needs = true;
    const dirty = () => { needs = true; };
    let flying: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
    const fly = (x: number, z: number) => { flying = { from: controls.target.clone(), to: new THREE.Vector3(x, 0, z), t: 0 }; needs = true; };
    controls.addEventListener('change', dirty);

    // district names, placed over the scene in HTML so they stay crisp and use the display face
    const districts = Object.values(w.districts).filter(d => d.blockIds.some(id => w.blocks[id]));
    const tags = districts.map(d => { const t = document.createElement('span'); t.className = 'r-3d-label'; t.textContent = d.name; labels.current?.appendChild(t); return { d, t }; });
    const v = new THREE.Vector3();
    const placeLabels = () => {
      const r = renderer.domElement.getBoundingClientRect(); const dist = camera.position.distanceTo(controls.target);
      const show = dist > cell * 3.5;
      for (const { d, t } of tags) {
        v.set(d.center.x, cell * 0.6, d.center.y).project(camera);
        const vis = show && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
        t.style.opacity = vis ? '1' : '0';
        if (vis) t.style.transform = `translate(${((v.x + 1) / 2) * r.width}px, ${((1 - v.y) / 2) * r.height}px) translate(-50%, -50%)`;
      }
    };

    // keep the camera over the city: the target never leaves the city's footprint
    const clamp = () => { const t = controls.target; t.x = Math.max(0, Math.min(w.city.width, t.x)); t.z = Math.max(0, Math.min(w.city.height, t.z)); t.y = 0; };

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (flying) {
        flying.t = Math.min(1, flying.t + 0.06);
        const e = 1 - Math.pow(1 - flying.t, 3);
        const next = flying.from.clone().lerp(flying.to, e);
        const d = next.clone().sub(controls.target);
        controls.target.add(d); camera.position.add(d);
        if (flying.t >= 1) flying = null;
        needs = true;
      }
      const moved = controls.update();
      if (moved) clamp();
      if (!needs && !moved) return;
      needs = false;
      renderer.render(scene, camera);
      placeLabels();
    };
    const resize = () => {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); needs = true;
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    // A tap that did not move picks the block under it — on the click, not on pointer-up. A touch
    // is followed by a synthetic click at the same spot; opening the sheet on pointer-up put the
    // sheet's scrim under that click, and the sheet closed the moment it opened.
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
    let down: { x: number; y: number; t: number } | null = null; let pointers = 0; let tap = false;
    const onDown = (e: PointerEvent) => { pointers++; tap = false; down = pointers === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; };
    const onUp = (e: PointerEvent) => {
      pointers = Math.max(0, pointers - 1);
      const d = down; down = null;
      tap = !!d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 8 && performance.now() - d.t <= 500;
    };
    const onClick = (e: MouseEvent) => {
      if (!tap) return; tap = false;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(built.hits, false)[0];
      if (!hit || hit.faceIndex == null) return;
      const id = built.hitBlock[built.hits.indexOf(hit.object as THREE.Mesh)]?.[hit.faceIndex];
      if (id) cb.current.onBlock?.(id);
    };
    const cancel = () => { pointers = 0; down = null; tap = false; };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', cancel);
    renderer.domElement.addEventListener('click', onClick);
    loop();

    three.current = {
      sky, moon, beamMat, renderer, scene, camera, controls, built, dirty, beacon, marks, outline, sel, fly,
      dispose: () => {
        cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
        renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp); renderer.domElement.removeEventListener('pointercancel', cancel); renderer.domElement.removeEventListener('click', onClick);
        built.dispose();
        scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry && !built.hits.includes(m)) m.geometry.dispose?.(); });
        for (const { t } of tags) t.remove();
        renderer.dispose(); renderer.domElement.remove();
      },
    };
    return () => { three.current?.dispose(); three.current = null; };
    // the scene is rebuilt only for a different city
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.city]);

  // ---------------------------------------------------------------- the world on top of it
  useEffect(() => {
    const t = three.current; if (!t) return;
    const { built } = t;
    // overlay: rewrite the slab colours
    const arr = built.slabColor.array as Float32Array;
    const byBlock = new Map<Id, THREE.Color>();
    for (let tri = 0; tri < built.slabBlock.length; tri++) {
      const id = built.slabBlock[tri];
      let c = byBlock.get(id); if (!c) { c = slabTint(w, w.blocks[id], layer, night); byBlock.set(id, c); }
      for (let k = 0; k < 3; k++) { arr[(tri * 3 + k) * 3] = c.r; arr[(tri * 3 + k) * 3 + 1] = c.g; arr[(tri * 3 + k) * 3 + 2] = c.b; }
    }
    built.slabColor.needsUpdate = true;
    const roof = built.roofColor.array as Float32Array;
    for (let tri = 0; tri < built.roofBlock.length; tri++) {
      const c = byBlock.get(built.roofBlock[tri]) ?? slabTint(w, w.blocks[built.roofBlock[tri]], layer, night);
      const r = c.r * 1.25 + 0.03, g = c.g * 1.25 + 0.03, b = c.b * 1.25 + 0.035;
      for (let k = 0; k < 3; k++) { roof[(tri * 3 + k) * 3] = r; roof[(tri * 3 + k) * 3 + 1] = g; roof[(tri * 3 + k) * 3 + 2] = b; }
    }
    built.roofColor.needsUpdate = true;
    // the beacon and the outline of where you are
    const here = w.blocks[w.player.blockId] as Block | undefined;
    t.beacon.visible = !!here;
    if (here) t.beacon.position.set(here.center.x, 0, here.center.y);
    const ring = (b?: Block) => new THREE.BufferGeometry().setFromPoints((b?.poly ?? []).map(p => new THREE.Vector3(p.x, 3, p.y)));
    t.outline.geometry.dispose(); t.outline.geometry = ring(here);
    t.sel.geometry.dispose(); t.sel.geometry = ring(selected ? w.blocks[selected] : undefined);
    // your places and back rooms: small amber posts at the kerb, the rivals' in their muted colour
    t.marks.children.forEach(o => { (o as THREE.Mesh).geometry?.dispose(); });
    t.marks.clear();
    const cell = built.cell;
    const post = new THREE.CylinderGeometry(cell * 0.018, cell * 0.018, cell * 0.14, 8);
    const mats = new Map<string, THREE.Material>();
    const matOf = (c: string) => { let m = mats.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); mats.set(c, m); } return m; };
    for (const b of Object.values(w.businesses)) {
      if (!w.blocks[b.blockId]) continue;
      const mine = b.ownedBy === PLAYER || b.protection?.by === PLAYER;
      const fac = b.protection && b.protection.by !== PLAYER ? w.factions[b.protection.by] : undefined;
      if (!mine && !fac) continue;
      const m = new THREE.Mesh(post, matOf(mine ? '#e9a23b' : mute(fac!.color)));
      m.position.set(b.pos.x, cell * 0.07, b.pos.y);
      t.marks.add(m);
    }
    t.dirty();
  }, [w, layer, selected, night]);

  // the hour: by night the city is lit by its own windows; by day an overcast sky, the windows dark
  useEffect(() => {
    const t = three.current; if (!t) return;
    const span = Math.max(w.city.width, w.city.height);
    const bg = night ? '#07080a' : '#8e969f';
    (t.scene.background as THREE.Color).set(bg);
    t.scene.fog = new THREE.FogExp2(bg, (night ? 1.1 : 0.7) / span);
    t.sky.color.set(night ? '#6a6660' : '#e8ecf0'); t.sky.groundColor.set(night ? '#141416' : '#4a4a48'); t.sky.intensity = night ? 1.5 : 1.9;
    t.moon.color.set(night ? '#b8c2d6' : '#fff1dc'); t.moon.intensity = night ? 0.7 : 1.6; t.moon.position.set(night ? -0.4 : 0.5, 1, night ? 0.3 : -0.35);
    const m = t.built.mats;
    m.walls.color.set(night ? '#4a505a' : '#9aa0a8'); m.walls.emissiveIntensity = night ? 1 : 0.06;
    m.ground.color.set(night ? '#101114' : '#3a3c40');
    m.water.color.set(night ? '#08121f' : '#2d4a66');
    t.beamMat.opacity = night ? 0.16 : 0.32;
    t.dirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [night, w.city]);

  // fly to a block when asked
  useEffect(() => {
    const t = three.current; if (!t || !focus) return;
    const b = w.blocks[focus.blockId]; if (b) t.fly(b.center.x, b.center.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  return (
    <div className="r-map3d" ref={host} aria-label={`3D map of ${w.city.name}`} role="img">
      <div className="r-3d-labels" ref={labels} aria-hidden="true" />
    </div>
  );
}
