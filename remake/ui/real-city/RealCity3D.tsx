import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import type { RealCity } from '@geo/realCity';
import { buildRealCity } from './geometry';
import { streetLabels, type MapCommand } from './view';

interface Props { city: RealCity; selected?: string; night: boolean; labels: boolean; command: MapCommand; onSelect(id: string): void; onUnavailable(): void }
export function RealCity3D(props: Props) {
  const host = useRef<HTMLDivElement>(null), latest = useRef(props); latest.current = props;
  const api = useRef<{ update(): void; command(c: MapCommand): void } | null>(null);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' }); }
    catch { latest.current.onUnavailable(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor('#101820');
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', '3D map of the Lower East Side. Drag to pan; pinch to zoom and rotate.');
    el.appendChild(canvas);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, 1, 6000);
    const controls = new MapControls(camera, canvas);
    controls.enableDamping = false; controls.screenSpacePanning = false;
    controls.minDistance = 100; controls.maxDistance = 2200;
    controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI * 0.43;
    const ambient = new THREE.HemisphereLight('#bacfe8', '#50413b', 2.1);
    const sun = new THREE.DirectionalLight('#ffdfb5', 2.1); sun.position.set(-300, 800, 500);
    scene.add(ambient, sun);
    const built = buildRealCity(props.city); scene.add(built.root);
    const highlight = new THREE.Group(); scene.add(highlight);
    const selectionMat = new THREE.LineBasicMaterial({ color: '#ffd18a', depthTest: false });
    let selected: string | undefined;
    const labels = streetLabels(props.city).map(s => {
      const node = document.createElement('span'); node.className = 'rc-street-label'; node.textContent = s.name; node.setAttribute('aria-hidden', 'true'); el.appendChild(node);
      return { ...s, node };
    });
    let frame = 0, disposed = false;
    const render = () => {
      frame = 0; if (disposed) return;
      const b = props.city.bounds;
      const x = THREE.MathUtils.clamp(controls.target.x, b.minX, b.maxX), z = THREE.MathUtils.clamp(controls.target.z, b.minY, b.maxY);
      camera.position.x += x - controls.target.x; camera.position.z += z - controls.target.z;
      controls.target.set(x, 0, z); camera.lookAt(controls.target);
      renderer.render(scene, camera);
      const width = el.clientWidth, height = el.clientHeight, placed: { x: number; y: number }[] = [];
      const nearby = streetLabels(props.city, { x: controls.target.x, y: controls.target.z });
      for (let i = 0; i < labels.length; i++) {
        const l = { ...nearby[i], node: labels[i].node };
        l.node.textContent = l.name;
        const p = new THREE.Vector3(l.x, 1, l.y).project(camera), x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
        const show = latest.current.labels && p.z > -1 && p.z < 1 && x > 75 && x < width - 95 && y > 130 && y < height - 240 && !placed.some(q => Math.abs(q.x - x) < 115 && Math.abs(q.y - y) < 35);
        l.node.hidden = !show;
        if (show) { l.node.style.left = `${x}px`; l.node.style.top = `${y}px`; placed.push({ x, y }); }
      }
    };
    const invalidate = () => { if (!frame && !disposed) frame = requestAnimationFrame(render); };
    const update = () => {
      const p = latest.current;
      built.setNight(p.night); ambient.intensity = p.night ? 1.25 : 2.1; sun.intensity = p.night ? 0.65 : 2.1;
      renderer.setClearColor(p.night ? '#101820' : '#3c4957');
      if (selected !== p.selected) {
        for (const child of [...highlight.children]) { (child as THREE.Line).geometry.dispose(); highlight.remove(child); }
        selected = p.selected;
        const building = props.city.buildings.find(b => b.id === selected);
        if (building) for (const ring of building.rings) {
          const points = [...ring, ring[0]].map(v => new THREE.Vector3(v.x, building.height + 0.2, v.y));
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), selectionMat); line.renderOrder = 2; highlight.add(line);
        }
      }
      invalidate();
    };
    const home = () => { controls.target.set(0, 0, 0); camera.position.set(350, 560, 680); controls.update(); };
    home();
    api.current = { update, command(c) {
      if (c.kind === 'home') home();
      else if (c.kind === 'focus') {
        const b = props.city.buildings.find(b => b.id === latest.current.selected);
        if (b) { const delta = new THREE.Vector3(b.center.x, 0, b.center.y).sub(controls.target); camera.position.add(delta); controls.target.add(delta); controls.update(); }
      } else {
        const offset = camera.position.clone().sub(controls.target);
        offset.setLength(THREE.MathUtils.clamp(offset.length() * (c.kind === 'in' ? 0.75 : 1.33), 100, 2200));
        camera.position.copy(controls.target).add(offset); controls.update();
      }
      invalidate();
    } };
    controls.addEventListener('change', invalidate);
    const resize = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); invalidate();
    }); resize.observe(el);
    const raycaster = new THREE.Raycaster(); let start = { x: 0, y: 0 }, moved = false;
    const pointers = new Set<number>();
    const down = (e: PointerEvent) => { pointers.add(e.pointerId); if (pointers.size === 1) { start = { x: e.clientX, y: e.clientY }; moved = false; } else moved = true; };
    const move = (e: PointerEvent) => { if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) moved = true; };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId); if (moved || pointers.size || e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), camera);
      const hit = raycaster.intersectObjects(built.hits, false)[0];
      if (hit && hit.faceIndex != null) { const i = built.hits.findIndex(mesh => mesh === hit.object); const id = built.ids[i]?.[hit.faceIndex]; if (id) latest.current.onSelect(id); }
    };
    const cancel = (e: PointerEvent) => { pointers.delete(e.pointerId); moved = true; };
    const lost = (e: Event) => { e.preventDefault(); latest.current.onUnavailable(); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('webglcontextlost', lost);
    update();
    return () => {
      disposed = true; api.current = null; cancelAnimationFrame(frame); resize.disconnect(); controls.dispose();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('webglcontextlost', lost);
      for (const c of highlight.children) (c as THREE.Line).geometry.dispose();
      selectionMat.dispose(); built.dispose(); renderer.dispose(); canvas.remove(); labels.forEach(l => l.node.remove());
    };
  }, [props.city]);
  useEffect(() => { api.current?.update(); }, [props.selected, props.night, props.labels]);
  useEffect(() => { if (props.command.n) api.current?.command(props.command); }, [props.command]);
  return <div className="rc-map rc-three" ref={host} />;
}
