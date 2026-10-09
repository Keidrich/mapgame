import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import type { RealCity } from '@geo/realCity';
import { buildRealCity, selectionGeometry, selectionOutline, buildTerritories } from './geometry';
import { streetLabels, type MapCommand, type MapInsets } from './view';

import { frameBuilding } from './framing';
import { MapPlaces, visiblePlaces, type MapPlayState, type ProjectedPlace } from './MapPlaces';

interface Props { city: RealCity; selected?: string; night: boolean; labels: boolean; command: MapCommand; insets: MapInsets; play?: MapPlayState; territory:boolean; onSelect(id: string): void; onUnavailable(): void }
export function RealCity3D(props: Props) {
  const [markers, setMarkers] = useState<ProjectedPlace[]>([]), [player, setPlayer] = useState<{ x: number; y: number }>();
  const appliedCommand = useRef(-1);
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
    let turf:ReturnType<typeof buildTerritories>|undefined, turfData:MapPlayState['territories']|undefined;
    const highlight = new THREE.Group(); scene.add(highlight);
    const selectionMat = new THREE.LineBasicMaterial({ color: '#bce0ff', depthTest: true, transparent: true, opacity: .95 });
    const selectionFill = new THREE.MeshBasicMaterial({ color: '#0a84ff', transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const pin = document.createElement('div'); pin.className = 'rc-selection-anchor'; pin.hidden = true; pin.setAttribute('aria-hidden', 'true');
    const pinLabel = document.createElement('span'); pinLabel.className = 'rc-selection-address';
    const pinDot = document.createElement('span'); pinDot.className = 'rc-selection-pin'; pinDot.textContent = '●';
    pin.append(pinLabel, pinDot); el.appendChild(pin);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let selectionStarted = 0;
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
      controls.target.set(x, controls.target.y, z); camera.lookAt(controls.target);
      // One brief acknowledgement, then return to on-demand rendering to spare mobile GPUs.
      const elapsed = performance.now() - selectionStarted;
      selectionFill.opacity = !motion.matches && elapsed < 650 ? .32 + .16 * Math.sin(Math.PI * elapsed / 650) : .32;
      renderer.render(scene, camera);
      const width = el.clientWidth, height = el.clientHeight, placed: { x: number; y: number }[] = [];
      const project = (x: number, y: number, height: number) => {
        const p = new THREE.Vector3(x, height, y).project(camera);
        return { x: (p.x + 1) * width / 2, y: (1 - p.y) * el.clientHeight / 2, visible: p.z > -1 && p.z < 1 };
      };
      const play = latest.current.play, insets = latest.current.insets;
      setMarkers(visiblePlaces((play?.places ?? []).map(place => {
        const b = props.city.buildings.find(b => b.id === place.buildingId);
        return { ...place, ...project(place.pos.x, place.pos.y, (b?.height ?? 0) + 3) };
      }), selected, width, height, insets));
      const dot = play ? project(play.player.x, play.player.y, 2) : undefined;
      setPlayer(dot?.visible ? dot : undefined);
      const selectedBuilding = props.city.buildings.find(b => b.id === selected);
      if (selectedBuilding) {
        const p = new THREE.Vector3(selectedBuilding.center.x, selectedBuilding.height + 2, selectedBuilding.center.y).project(camera);
        pin.hidden = !!play?.places.some(place => place.buildingId === selected) || p.z < -1 || p.z > 1 || Math.abs(p.x) > .94 || (1 - p.y) * height / 2 < insets.top + 42 || (1 - p.y) * height / 2 > height - insets.bottom;
        pin.style.left = `${(p.x + 1) * width / 2}px`; pin.style.top = `${(1 - p.y) * height / 2}px`;
      } else pin.hidden = true;
      const nearby = streetLabels(props.city, { x: controls.target.x, y: controls.target.z });
      for (let i = 0; i < labels.length; i++) {
        const l = { ...nearby[i], node: labels[i].node };
        l.node.textContent = l.name;
        const p = new THREE.Vector3(l.x, 1, l.y).project(camera), x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
        const show = latest.current.labels && p.z > -1 && p.z < 1 && x > 75 && x < width - 95 && y > 130 && y < height - 240 && !placed.some(q => Math.abs(q.x - x) < 115 && Math.abs(q.y - y) < 35);
        l.node.hidden = !show;
        if (show) { l.node.style.left = `${x}px`; l.node.style.top = `${y}px`; placed.push({ x, y }); }
      }
      if (selected && !motion.matches && elapsed < 650) invalidate();
    };
    const invalidate = () => { if (!frame && !disposed) frame = requestAnimationFrame(render); };
    const update = () => {
      const p = latest.current;
      if (p.play?.territories !== turfData) { if(turf){scene.remove(turf.root);turf.dispose();} turfData=p.play?.territories; turf=buildTerritories(turfData??[]);scene.add(turf.root); }
      if(turf) turf.root.visible=p.territory;
      built.setNight(p.night); ambient.intensity = p.night ? 1.25 : 2.1; sun.intensity = p.night ? 0.65 : 2.1;
      renderer.setClearColor(p.night ? '#101820' : '#3c4957');
      if (selected !== p.selected) {
        for (const child of [...highlight.children]) { (child as THREE.Line).geometry.dispose(); highlight.remove(child); }
        selected = p.selected;
        const building = props.city.buildings.find(b => b.id === selected);
        if (building) {
          const geometry = selectionGeometry(building);
          const fill = new THREE.Mesh(geometry, selectionFill); fill.renderOrder = 2; highlight.add(fill);
          const edges = new THREE.LineSegments(selectionOutline(building), selectionMat); edges.renderOrder = 3; highlight.add(edges);
          pinLabel.textContent = building.address === 'Unnumbered building' ? 'Selected building' : building.address;
          selectionStarted = performance.now();
          if (!motion.matches) pinDot.animate([{ transform: 'translateY(-12px) scale(.75)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      }
      invalidate();
    };
    const home = () => { controls.target.set(0, 0, 0); camera.position.set(350, 560, 680); controls.update(); };
    home();
    api.current = { update, command(c) {
      if (c.kind === 'home') home();
      else if (c.kind === 'focus' || c.kind === 'player') {
        const b = c.kind === 'focus' ? props.city.buildings.find(b => b.id === latest.current.selected) : undefined;
        const point = latest.current.play?.player;
        if (b) frameBuilding(camera, controls.target, b, el.clientWidth, el.clientHeight, latest.current.insets);
        else if (c.kind === 'player' && point) frameBuilding(camera, controls.target, { id: 'player', center: point, height: 1, minHeight: 0, heightSource: 'estimated', kind: 'yes', address: '', rings: [[{ x: point.x - 30, y: point.y - 30 }, { x: point.x + 30, y: point.y + 30 }]] }, el.clientWidth, el.clientHeight, latest.current.insets);
        controls.update();
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
      renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix();
      if (latest.current.command.kind === 'focus' || latest.current.command.kind === 'player') api.current?.command(latest.current.command);
      invalidate();
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
      selectionMat.dispose(); selectionFill.dispose(); pin.remove(); turf?.dispose(); built.dispose(); renderer.dispose(); canvas.remove(); labels.forEach(l => l.node.remove());
    };
  }, [props.city]);
  useEffect(() => { api.current?.update(); }, [props.selected, props.night, props.labels, props.play, props.insets, props.territory]);
  useEffect(() => {
    if (!props.command.n) return;
    if (appliedCommand.current === props.command.n && props.command.kind !== 'focus' && props.command.kind !== 'player') return;
    appliedCommand.current = props.command.n; api.current?.command(props.command);
  }, [props.command, props.insets]);
  return <><div className="rc-map rc-three" ref={host} /><MapPlaces places={markers} player={player} selected={props.selected} onSelect={props.onSelect} /></>;
}
