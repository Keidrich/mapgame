/**
 * The city, drawn. Everything here is derived from the generated `City` and the world — no
 * tiles, no network — so the map is instant and identical on every device for the same seed.
 *
 * Performance shape: the static city (water, lots, parks, bridges, street names) is memoised
 * once per city; only block fills, markers and the pin redraw as the world changes. Panning and
 * pinching move the `viewBox` directly on the element and commit to React state only when the
 * gesture ends, so dragging never re-renders a few thousand paths.
 */
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { select, PLAYER, type World } from '@r/sim/index';
import type { Block, Id, Vec } from '@r/sim/types';
import { Icon } from '@ui/icons';
import type { Layer } from '../store';
import { mute } from './tone';
import { blockLots, inside, quadPath, residents, shopSpots, treesFor, type Lot } from './mapgeo';

const GOLD = '#e9a23b';
interface View { x: number; y: number; w: number; h: number }

const pts = (p: Vec[]) => p.map(q => `${q.x},${q.y}`).join(' ');
const pathOf = (p: Vec[]) => `M${p.map(q => `${q.x} ${q.y}`).join('L')}Z`;

/** The part of the map that never changes for a given city. */
const StaticCity = memo(function StaticCity({ w, detail }: { w: World; detail: boolean }) {
  const { city } = w;
  const blocks = Object.values(w.blocks);
  // the buildings actually there (`mapgeo.blockLots`): shops, landmarks and homes, drawn apart
  const lots = useMemo(() => { const res = residents(w); return blocks.filter(b => !select.isParkBlock(b)).flatMap(b => blockLots(w, b, res[b.id] ?? 0)); }, [city, blocks.length]);
  const byKind = (k: Lot['kind']) => lots.filter(l => l.kind === k).map(l => quadPath(l.quad)).join('');
  const trees = useMemo(() => blocks.filter(select.isParkBlock).flatMap(treesFor), [city, blocks.length]);
  const avenues = city.streets.filter(s => s.rank === 0);
  return (
    <g className="r-static">
      {/* blocks: the pavement, and the buildings on it */}
      {blocks.map(b => <path key={b.id} d={pathOf(b.poly)} className={select.isParkBlock(b) ? 'r-park' : 'r-block'} />)}
      <path d={byKind('home')} className="r-lots r-lot-home" />
      <path d={byKind('shop')} className="r-lots r-lot-shop" />
      <path d={byKind('landmark')} className="r-lots r-lot-mark" />
      {trees.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={5 + (i % 3) * 1.5} className="r-tree" />)}
      {/* water over the land, so a block the river clips reads as a waterfront */}
      {city.sea && <polygon points={pts(city.sea)} className="r-sea" />}
      {city.river && <polyline points={pts(city.river.path)} className="r-river" style={{ strokeWidth: city.river.width }} />}
      {city.river && <polyline points={pts(city.river.path)} className="r-river-glint" style={{ strokeWidth: city.river.width * 0.25 }} />}
      {city.bridges.map(b => <g key={b.id}><line x1={b.from.x} y1={b.from.y} x2={b.to.x} y2={b.to.y} className="r-bridge-casing" /><line x1={b.from.x} y1={b.from.y} x2={b.to.x} y2={b.to.y} className="r-bridge" /></g>)}
      {detail && avenues.map(s => (
        <g key={s.id}>
          <path id={`r-st-${s.id}`} d={`M${s.points.map(p => `${p.x} ${p.y}`).join('L')}`} fill="none" />
          <text className="r-street-label"><textPath href={`#r-st-${s.id}`} startOffset="30%">{s.name}</textPath></text>
          <text className="r-street-label"><textPath href={`#r-st-${s.id}`} startOffset="75%">{s.name}</textPath></text>
        </g>
      ))}
    </g>
  );
});

function layerFill(w: World, b: Block, layer: Layer): { fill: string; opacity: number } | undefined {
  if (layer === 'control') {
    const c = select.blockController(w, b.id);
    let best = 0, who: string | undefined;
    for (const [k, v] of Object.entries(b.influence)) if (v > best) { best = v; who = k; }
    if (!who || best < 8) return undefined;
    const color = who === PLAYER ? GOLD : mute(w.factions[who]?.color ?? '#888');
    return { fill: color, opacity: c ? 0.28 + Math.min(0.32, best / 300) : 0.1 + best / 400 };
  }
  if (layer === 'heat') return b.heat > 2 ? { fill: '#ff5a36', opacity: Math.min(0.7, b.heat / 100 + 0.08) } : undefined;
  if (layer === 'wealth') return { fill: '#3fbf8f', opacity: b.wealth / 180 };
  const d = w.districts[b.districtId];
  return { fill: '#5b8def', opacity: d.attention / 160 };
}

export interface MapProps { w: World; layer?: Layer; onBlock?: (id: Id) => void; selected?: Id; focus?: { blockId: Id; n: number }; mini?: boolean; className?: string }

export function CityMap({ w, layer = 'control', onBlock, selected, focus, mini, className }: MapProps) {
  const { city } = w;
  const spots = useMemo(() => shopSpots(w), [city]);
  const pad = 160;
  const full: View = { x: -pad, y: -pad, w: city.width + pad * 2, h: city.height + pad * 2 };
  const svg = useRef<SVGSVGElement>(null);
  const view = useRef<View>(full);
  const [committed, setCommitted] = useState<View>(full);
  const [box, setBox] = useState({ w: 390, h: 600 });
  const gesture = useRef<{ pts: Map<number, { x: number; y: number }>; start?: { x: number; y: number }; moved: boolean; pinch?: number; base?: View }>({ pts: new Map(), moved: false });

  // fit to the element, keeping the aspect ratio of the screen
  useEffect(() => {
    const el = svg.current; if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); if (r.width && r.height) setBox({ w: r.width, h: r.height }); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const apply = (v: View, commit = false) => {
    // keep the aspect ratio of the element, and never lose the city off-screen
    const aspect = box.h / box.w;
    const vw = Math.max(260, Math.min(full.w * 1.4, v.w)); const vh = vw * aspect;
    const cx = Math.max(-pad, Math.min(city.width + pad, v.x + v.w / 2)); const cy = Math.max(-pad, Math.min(city.height + pad, v.y + v.h / 2));
    const nv = { x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh };
    view.current = nv;
    svg.current?.setAttribute('viewBox', `${nv.x} ${nv.y} ${nv.w} ${nv.h}`);
    if (commit) setCommitted(nv);
  };
  // first frame, and whenever the element changes shape: frame the player's neighbourhood
  const framed = useRef(false);
  useEffect(() => {
    if (mini) { const aspect = box.h / box.w; const vw = Math.max(full.w, full.h / aspect); apply({ x: city.width / 2 - vw / 2, y: city.height / 2 - (vw * aspect) / 2, w: vw, h: vw * aspect }, true); return; }
    if (!framed.current) { framed.current = true; const b = w.blocks[w.player.blockId] ?? Object.values(w.blocks)[0]; if (b) apply({ x: b.center.x - 500, y: b.center.y - 500, w: 1000, h: 1000 }, true); }
    else apply(view.current, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.w, box.h, mini]);
  useEffect(() => {
    if (!focus || mini) return;
    const b = w.blocks[focus.blockId]; if (!b) return;
    apply({ x: b.center.x - 550, y: b.center.y - 550, w: 1100, h: 1100 }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  const toWorld = (cx: number, cy: number) => { const r = svg.current!.getBoundingClientRect(); const v = view.current; return { x: v.x + ((cx - r.left) / r.width) * v.w, y: v.y + ((cy - r.top) / r.height) * v.h }; };
  const zoomAt = (cx: number, cy: number, k: number) => { const p = toWorld(cx, cy); const v = view.current; const nw = v.w * k, nh = v.h * k; apply({ x: p.x - ((p.x - v.x) / v.w) * nw, y: p.y - ((p.y - v.y) / v.h) * nh, w: nw, h: nh }); };

  const down = (e: RPE<SVGSVGElement>) => {
    if (mini) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const g = gesture.current;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pts.size === 1) { g.start = { x: e.clientX, y: e.clientY }; g.moved = false; g.base = { ...view.current }; }
    if (g.pts.size === 2) { const [a, b] = [...g.pts.values()]; g.pinch = Math.hypot(a.x - b.x, a.y - b.y); g.base = { ...view.current }; g.moved = true; }
  };
  const move = (e: RPE<SVGSVGElement>) => {
    const g = gesture.current; if (!g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.current!.getBoundingClientRect();
    if (g.pts.size === 1 && g.start && g.base) {
      const dx = e.clientX - g.start.x, dy = e.clientY - g.start.y;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      if (g.moved) apply({ ...g.base, x: g.base.x - (dx / r.width) * g.base.w, y: g.base.y - (dy / r.height) * g.base.h });
    } else if (g.pts.size === 2 && g.pinch && g.base) {
      const [a, b] = [...g.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = g.pinch / d;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const p = { x: g.base.x + ((mx - r.left) / r.width) * g.base.w, y: g.base.y + ((my - r.top) / r.height) * g.base.h };
      const nw = g.base.w * k, nh = g.base.h * k;
      apply({ x: p.x - ((mx - r.left) / r.width) * nw, y: p.y - ((my - r.top) / r.height) * nh, w: nw, h: nh });
    }
  };
  const up = (e: RPE<SVGSVGElement>) => {
    const g = gesture.current;
    const was = g.pts.size;
    g.pts.delete(e.pointerId);
    if (was === 1 && !g.moved && onBlock) {
      const p = toWorld(e.clientX, e.clientY);
      const hit = Object.values(w.blocks).find(b => inside(p, b.poly));
      if (hit) onBlock(hit.id);
    }
    if (g.pts.size === 0) setCommitted({ ...view.current });
    if (g.pts.size === 1) { const [q] = [...g.pts.values()]; g.start = q; g.base = { ...view.current }; g.pinch = undefined; }
  };
  const wheel = (e: React.WheelEvent<SVGSVGElement>) => { if (mini) return; zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015)); clearTimeout(wheelT.current); wheelT.current = window.setTimeout(() => setCommitted({ ...view.current }), 160); };
  const wheelT = useRef<number | undefined>(undefined);

  // screen pixels per world unit, for markers that keep their size
  const ppu = box.w / committed.w;
  const detail = !mini && ppu > 0.24;
  const close = !mini && ppu > 0.55;
  const labels = !mini && ppu > 0.4;
  const u = (px: number) => px / Math.max(ppu, 0.0001);
  const blocks = Object.values(w.blocks);
  // undefined when the map shows a city you are not in (the region's other cities)
  const here = w.blocks[w.player.blockId] as Block | undefined;
  const known = new Set(w.player.safehouseIds.map(id => w.safehouses[id]?.blockId));

  return (
    <svg ref={svg} className={`r-map${mini ? ' mini' : ''}${className ? ` ${className}` : ''}`} viewBox={`${committed.x} ${committed.y} ${committed.w} ${committed.h}`} preserveAspectRatio="xMidYMid slice"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} role="img" aria-label={`Map of ${w.city.name}`}>
      {/* past the city limits: open ground, so the edge of town reads as an edge and not a void */}
      <defs><pattern id="r-outskirts" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="#0a0b0d" /><circle cx="10" cy="10" r="1.6" fill="#15171b" /><circle cx="40" cy="38" r="1.2" fill="#15171b" /></pattern></defs>
      <rect x={-4000} y={-4000} width={city.width + 8000} height={city.height + 8000} fill="url(#r-outskirts)" />
      <rect x={-60} y={-60} width={city.width + 120} height={city.height + 120} rx={80} className="r-ground" />
      <StaticCity w={w} detail={labels} />
      {/* who holds what */}
      <g className="r-overlay">
        {blocks.map(b => { const f = layerFill(w, b, layer); return f ? <path key={b.id} d={pathOf(b.poly)} fill={f.fill} fillOpacity={f.opacity} /> : null; })}
      </g>
      {!mini && selected && w.blocks[selected] && <path d={pathOf(w.blocks[selected].poly)} className="r-selected" style={{ strokeWidth: u(2.5) }} />}
      {!mini && here && <path d={pathOf(here.poly)} className="r-here" style={{ strokeWidth: u(2) }} />}
      {/* district names when zoomed out */}
      {!close && Object.values(w.districts).map(d => <text key={d.id} x={d.center.x} y={d.center.y} className="r-district-label" style={{ fontSize: u(mini ? 9 : 12) }}>{d.name}</text>)}
      {/* places */}
      {detail && Object.values(w.businesses).map(b => {
        const mine = b.ownedBy === PLAYER || b.protection?.by === PLAYER;
        const fac = b.protection && b.protection.by !== PLAYER ? w.factions[b.protection.by] : undefined;
        const color = mine ? GOLD : fac ? mute(fac.color) : b.tier === 3 ? '#c3b1f3' : '#8f8a82';
        return (
          <g key={b.id} transform={`translate(${(spots[b.id] ?? b.pos).x} ${(spots[b.id] ?? b.pos).y})`} className="r-biz">
            {/* far out, a place nobody holds is a faint dot: a lit street of them read as polka dots */}
            <circle r={u(close ? 9 : 3.2)} fill={close ? '#111317' : color} fillOpacity={close || mine || fac ? 1 : 0.45} stroke={color} strokeOpacity={close || mine || fac ? 1 : 0} strokeWidth={u(close ? 1.5 : 0.8)} />
            {close && <g transform={`translate(${-u(6)} ${-u(6)}) scale(${u(12) / 24})`} style={{ color }}><Icon of="business" id={b.type} size={24} strokeWidth={2} /></g>}
            {close && b.racketIds.some(id => w.rackets[id]?.owner === PLAYER) && <circle cx={u(8)} cy={-u(8)} r={u(3)} fill={GOLD} />}
          </g>
        );
      })}
      {!mini && [...known].map(bid => { const b = w.blocks[bid!]; return b ? <g key={bid} transform={`translate(${b.center.x + u(14)} ${b.center.y - u(14)}) scale(${u(16) / 24})`} className="r-safe"><rect x="-2" y="-2" width="28" height="28" rx="4" fill="#11141b" stroke={GOLD} /><g style={{ color: GOLD }}><Icon name="safehouse" size={24} strokeWidth={2} /></g></g> : null; })}
      {/* street crews: a fist on the corner, red while they are nobody's */}
      {detail && Object.values(w.crews ?? {}).map(c => { const b = w.blocks[c.blockId]; if (!b) return null; const col = c.terms === 'none' ? '#e5534b' : GOLD; return <g key={c.id} transform={`translate(${b.center.x - u(16)} ${b.center.y + u(8)}) scale(${u(14) / 24})`}><rect x="-3" y="-3" width="30" height="30" rx="6" fill="#11141b" stroke={col} /><g style={{ color: col }}><Icon name="fist" size={24} strokeWidth={2} /></g></g>; })}
      {/* you */}
      {!mini && here && <g transform={`translate(${here.center.x} ${here.center.y})`} className="r-pin">
        <circle r={u(14)} className="r-pin-halo" />
        <circle r={u(6)} fill={GOLD} stroke="#0d0f14" strokeWidth={u(2)} />
      </g>}
    </svg>
  );
}
