import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealCity } from '@geo/realCity';
import { pathFor, streetLabels, mapAim, type MapCommand, type MapInsets } from './view';

import { MapPlaces, visiblePlaces, type MapPlayState } from './MapPlaces';

interface Props { city: RealCity; selected?: string; labels: boolean; command: MapCommand; insets: MapInsets; play?: MapPlayState; onSelect(id: string): void }
export function RealCity2D({ city, selected, labels, command, insets, play, onSelect }: Props) {
  const appliedCommand = useRef(-1);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 390, h: 844 });
  const [view, setView] = useState({ x: 0, y: 0, width: 700 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ x: 0, y: 0, moved: false, building: '', pinch: 0 });
  const names = useMemo(() => {
    const placed: { x: number; y: number; w: number; h: number }[] = [], scale = view.width / size.w;
    const halfHeight = view.width * size.h / size.w / 2;
    return streetLabels(city, view).filter(s => {
      if (Math.abs(s.x - view.x) > view.width / 2 - 55 * scale || Math.abs(s.y - view.y) > halfHeight - 90 * scale) return false;
      if (view.width > 1300 && !s.major) return false;
      const radians = s.angle * Math.PI / 180, textWidth = s.name.length * 6 * scale;
      const w = Math.abs(Math.cos(radians)) * textWidth + Math.abs(Math.sin(radians)) * 14 * scale + 10 * scale;
      const h = Math.abs(Math.sin(radians)) * textWidth + Math.abs(Math.cos(radians)) * 14 * scale + 10 * scale;
      if (placed.some(p => Math.abs(p.x - s.x) < (p.w + w) / 2 && Math.abs(p.y - s.y) < (p.h + h) / 2)) return false;
      placed.push({ ...s, w, h }); return true;
    });
  }, [city, view, size.w, size.h]);
  const clamp = (v: typeof view) => ({ x: Math.max(city.bounds.minX, Math.min(city.bounds.maxX, v.x)), y: Math.max(city.bounds.minY, Math.min(city.bounds.maxY, v.y)), width: Math.max(140, Math.min(2400, v.width)) });
  useEffect(() => { const el = svg.current!; const r = new ResizeObserver(() => setSize({ w: el.clientWidth || 390, h: el.clientHeight || 844 })); r.observe(el); return () => r.disconnect(); }, []);
  useEffect(() => {
    if (!command.n) return;
    if (appliedCommand.current === command.n && command.kind !== 'focus' && command.kind !== 'player') return;
    appliedCommand.current = command.n;
    if (command.kind === 'home') setView({ x: 0, y: 0, width: 700 });
    else if (command.kind === 'focus' || command.kind === 'player') {
      const point = command.kind === 'player' ? play?.player : city.buildings.find(b => b.id === selected)?.center;
      if (point) setView(v => { const width = Math.min(v.width, size.w < 700 ? 260 : 500), aim = mapAim(size.w, size.h, insets); return { x: point.x + (size.w / 2 - aim.x) * width / size.w, y: point.y + (size.h / 2 - aim.y) * width / size.w, width }; });
    }
    else setView(v => clamp({ ...v, width: v.width * (command.kind === 'in' ? 0.75 : 1.33) }));
    // Selection alone should highlight, not move the camera out from under the player's finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, insets, size]);
  useEffect(() => {
    const el = svg.current!;
    const wheel = (e: WheelEvent) => { e.preventDefault(); setView(v => clamp({ ...v, width: v.width * Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * 0.003) })); };
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  }, [city]);
  const height = view.width * size.h / size.w;
  const selectedBuilding = city.buildings.find(b => b.id === selected);
  const scale = view.width / size.w;
  const distance = scale * 90;
  const scaleMetres = distance >= 200 ? 200 : distance >= 100 ? 100 : distance >= 50 ? 50 : 20;
  const end = (id: number) => { pointers.current.delete(id); gesture.current.pinch = 0; };
  // Camera movement changes the viewBox and labels, not thousands of static footprint paths.
  const geography = useMemo(() => <>
    <g className="rc-parks">{city.parks.map(p => <path key={p.id} d={pathFor(p.rings)} fillRule="evenodd" />)}</g>
    <g className="rc-curbs" fill="none" strokeLinecap="round" strokeLinejoin="round">{city.streets.map(s => <polyline key={s.id} points={s.points.map(p => `${p.x},${p.y}`).join(' ')} strokeWidth={s.width + (s.major ? 4 : 2)} />)}</g>
    <g className="rc-roads" fill="none" strokeLinecap="round" strokeLinejoin="round">{city.streets.map(s => <polyline key={s.id} points={s.points.map(p => `${p.x},${p.y}`).join(' ')} className={s.major ? 'major' : s.width < 5 ? 'path' : 'local'} strokeWidth={s.width} />)}</g>
    <g className="rc-buildings">{city.buildings.map(b => <path key={b.id} data-building={b.id} d={pathFor(b.rings)} fillRule="evenodd" className={selected === b.id ? 'selected' : ''} vectorEffect="non-scaling-stroke" strokeWidth={selected === b.id ? 2.5 : 0.6} role="button" tabIndex={0} aria-label={b.address === 'Unnumbered building' ? `Building ${b.id.split(':').pop()}` : b.address} aria-pressed={selected === b.id} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(b.id); } }} />)}</g>
  </>, [city, selected, onSelect]);
  const project = (p: { x: number; y: number }) => ({ x: (p.x - view.x) / scale + size.w / 2, y: (p.y - view.y) / scale + size.h / 2 });
  const markers = visiblePlaces((play?.places ?? []).map(p => ({ ...p, ...project(p.pos), visible: true })), selected, size.w, size.h, insets);
  return <><svg ref={svg} className="rc-map rc-flat" viewBox={`${view.x - view.width / 2} ${view.y - height / 2} ${view.width} ${height}`} aria-label="Map of Lower East Side buildings and streets"
    onPointerDown={e => {
      if (e.button !== 0) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) gesture.current = { x: e.clientX, y: e.clientY, moved: false, building: (e.target as Element).getAttribute('data-building') ?? '', pinch: 0 };
      else gesture.current.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={e => {
      const last = pointers.current.get(e.pointerId); if (!last) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 6) g.moved = true;
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()]; const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (g.pinch > 0 && distance > 0) { const ratio = g.pinch / distance; setView(v => clamp({ ...v, width: v.width * ratio })); }
        g.pinch = distance;
      } else if (g.moved) setView(v => clamp({ ...v, x: v.x - (e.clientX - last.x) * v.width / size.w, y: v.y - (e.clientY - last.y) * v.width / size.w }));
    }}
    onPointerUp={e => { if (!gesture.current.moved && gesture.current.building) onSelect(gesture.current.building); end(e.pointerId); }}
    onPointerCancel={e => { gesture.current.moved = true; end(e.pointerId); }}>
    {geography}
    {labels && <g className="rc-road-names" pointerEvents="none" style={{ fontSize: scale * 11 }}>{names.map(s => <text key={s.name} x={s.x} y={s.y} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${s.angle} ${s.x} ${s.y})`} strokeWidth={scale * 3}>{s.name}</text>)}</g>}
    {selectedBuilding && !play?.places.some(p => p.buildingId === selected) && <g key={selected} pointerEvents="none" transform={`translate(${selectedBuilding.center.x} ${selectedBuilding.center.y}) scale(${scale})`}>
      <g className="rc-map-pin"><circle className="rc-pin-ring" r="22" /><path d="M0 0L-6 -15H6Z" fill="#fff" /><circle cy="-26" r="16" fill="#0a84ff" stroke="#fff" strokeWidth="3" /><circle cy="-26" r="5" fill="#fff" /></g>
    </g>}
  </svg><MapPlaces places={markers} player={play ? project(play.player) : undefined} selected={selected} onSelect={onSelect} /><div className="rc-map-reference" aria-label={`Map scale ${scaleMetres} metres. North is up.`}><span className="rc-north">↑ <b>N</b></span><span className="rc-scale" style={{ width: scaleMetres / scale }}>{scaleMetres} m</span></div></>;
}
