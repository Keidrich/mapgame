import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealCity } from '@geo/realCity';
import { pathFor, streetLabels, type MapCommand } from './view';

interface Props { city: RealCity; selected?: string; labels: boolean; command: MapCommand; onSelect(id: string): void }
export function RealCity2D({ city, selected, labels, command, onSelect }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 390, h: 844 });
  const [view, setView] = useState({ x: 0, y: 0, width: 700 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ x: 0, y: 0, moved: false, building: '', pinch: 0 });
  const names = useMemo(() => {
    const placed: { x: number; y: number }[] = [], scale = view.width / size.w;
    return streetLabels(city, view).filter(s => {
      if (placed.some(p => Math.abs(p.x - s.x) < 115 * scale && Math.abs(p.y - s.y) < 25 * scale)) return false;
      placed.push(s); return true;
    });
  }, [city, view, size.w]);
  const clamp = (v: typeof view) => ({ x: Math.max(city.bounds.minX, Math.min(city.bounds.maxX, v.x)), y: Math.max(city.bounds.minY, Math.min(city.bounds.maxY, v.y)), width: Math.max(140, Math.min(2400, v.width)) });
  useEffect(() => { const el = svg.current!; const r = new ResizeObserver(() => setSize({ w: el.clientWidth || 390, h: el.clientHeight || 844 })); r.observe(el); return () => r.disconnect(); }, []);
  useEffect(() => {
    if (!command.n) return;
    if (command.kind === 'home') setView({ x: 0, y: 0, width: 700 });
    else if (command.kind === 'focus') { const b = city.buildings.find(b => b.id === selected); if (b) setView(v => ({ ...v, x: b.center.x, y: b.center.y, width: Math.min(v.width, 500) })); }
    else setView(v => clamp({ ...v, width: v.width * (command.kind === 'in' ? 0.75 : 1.33) }));
    // Selection alone should highlight, not move the camera out from under the player's finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);
  useEffect(() => {
    const el = svg.current!;
    const wheel = (e: WheelEvent) => { e.preventDefault(); setView(v => clamp({ ...v, width: v.width * Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * 0.003) })); };
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  }, [city]);
  const height = view.width * size.h / size.w;
  const end = (id: number) => { pointers.current.delete(id); gesture.current.pinch = 0; };
  return <svg ref={svg} className="rc-map rc-flat" viewBox={`${view.x - view.width / 2} ${view.y - height / 2} ${view.width} ${height}`} aria-label="Map of Lower East Side buildings and streets"
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
    <g className="rc-parks">{city.parks.map(p => <path key={p.id} d={pathFor(p.rings)} fillRule="evenodd" />)}</g>
    <g className="rc-curbs" fill="none" strokeLinecap="round" strokeLinejoin="round">{city.streets.map(s => <polyline key={s.id} points={s.points.map(p => `${p.x},${p.y}`).join(' ')} strokeWidth={s.width + 4} />)}</g>
    <g className="rc-roads" fill="none" strokeLinecap="round" strokeLinejoin="round">{city.streets.map(s => <polyline key={s.id} points={s.points.map(p => `${p.x},${p.y}`).join(' ')} strokeWidth={s.width} />)}</g>
    <g className="rc-buildings">{city.buildings.map(b => <path key={b.id} data-building={b.id} d={pathFor(b.rings)} fillRule="evenodd" className={selected === b.id ? 'selected' : ''} strokeWidth={selected === b.id ? 2.5 : 0.5} role="button" tabIndex={0} aria-label={b.address === 'Unnumbered building' ? `Building ${b.id.split(':').pop()}` : b.address} aria-pressed={selected === b.id} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(b.id); } }} />)}</g>
    {labels && <g className="rc-road-names" pointerEvents="none" style={{ fontSize: Math.max(8, view.width / size.w * 11) }}>{names.map(s => <text key={s.name} x={s.x} y={s.y} textAnchor="middle">{s.name}</text>)}</g>}
  </svg>;
}
