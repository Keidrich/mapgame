import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import { hex, select } from '@sim/index';
import { PLAYER, type Id, type World } from '@sim/types';
import { BUSINESS_DEFS } from '@content/businesses';
import { gridBounds, topInfluence } from '@ui/derive';
import { openSheet, useStore } from '@ui/store';
import { addBasemap } from '@ui/basemap';

/** Business markers appear once the typical block is at least this wide on screen. */
const MARKER_BLOCK_PX = 96;
function blocksAreBig(m: L.Map, w: World): boolean {
  const blocks = Object.values(w.blocks); if (!blocks.length) return false;
  const avgSide = Math.sqrt(blocks.reduce((s, b) => s + b.areaM2, 0) / blocks.length);
  const metresPerPx = (156543.03 * Math.cos((w.origin.lat * Math.PI) / 180)) / Math.pow(2, m.getZoom());
  return avgSide / metresPerPx >= MARKER_BLOCK_PX;
}

function hexStyle(w: World, blockId: Id, selected: boolean): L.PathOptions {
  const b = w.blocks[blockId];
  const ctrl = select.blockController(w, blockId);
  const top = topInfluence(b);
  const color = select.factionColor(w, ctrl);
  const fillOpacity = ctrl ? 0.08 + (Math.min(100, top.value) / 100) * 0.37 : 0.06;
  const hot = b.heat > 50;
  return {
    color: selected ? '#ffffff' : hot ? '#e5484d' : ctrl ? color : '#3a404a',
    weight: selected ? 3 : hot ? 2 : 1,
    opacity: selected ? 1 : ctrl ? 0.8 : 0.5,
    fillColor: ctrl === PLAYER ? '#f2c94c' : ctrl ? color : '#666a70',
    fillOpacity: hot ? Math.max(fillOpacity, 0.2) : fillOpacity,
    // Player turf gets a dashed edge so it reads apart from gold-ish faction colours.
    dashArray: ctrl === PLAYER && !selected ? '6 4' : undefined,
  };
}

interface Want { html: string; pos: L.LatLngExpression; size: [number, number]; anchor: [number, number]; layer: 'badge' | 'marker'; click?: () => void }
type Kept = { mk: L.Marker; html: string; anchor: string };

/** Fullscreen Leaflet map. The instance lives in a ref; layers are diffed by id whenever World changes. */
export function MapView() {
  const world = useStore(s => s.world);
  const blockId = useStore(s => s.selection.blockId);
  const businessId = useStore(s => s.selection.businessId);
  const tab = useStore(s => s.tab);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const hexLayer = useRef<L.LayerGroup>(L.layerGroup());
  const badgeLayer = useRef<L.LayerGroup>(L.layerGroup());
  const markerLayer = useRef<L.LayerGroup>(L.layerGroup());
  const polys = useRef(new Map<Id, L.Polygon>());
  const markers = useRef(new Map<string, Kept>());
  const seedRef = useRef<number | null>(null);
  const worldRef = useRef(world);
  const selRef = useRef({ blockId, businessId });
  worldRef.current = world; selRef.current = { blockId, businessId };

  // ---- create the map once ----
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 11, maxZoom: 18 });
    m.setView([0, 0], 14);
    addBasemap(m);
    m.zoomControl.setPosition('bottomleft');
    hexLayer.current.addTo(m); badgeLayer.current.addTo(m); markerLayer.current.addTo(m);
    m.on('zoomend', () => { if (worldRef.current) syncMarkers(m, worldRef.current); });
    map.current = m;
    return () => {
      // Full teardown so a remount (StrictMode, HMR) rebuilds and re-fits from scratch.
      hexLayer.current.clearLayers(); badgeLayer.current.clearLayers(); markerLayer.current.clearLayers();
      polys.current.clear(); markers.current.clear(); seedRef.current = null;
      m.remove(); map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaflet needs a size refresh when the map is revealed after a tab panel covered it.
  useEffect(() => { if (tab === 'map') setTimeout(() => map.current?.invalidateSize(), 50); }, [tab]);

  // ---- hexes (diffed by block id) ----
  useEffect(() => {
    const m = map.current; if (!m || !world) return;
    if (seedRef.current !== world.seed) {
      seedRef.current = world.seed;
      hexLayer.current.clearLayers(); badgeLayer.current.clearLayers(); markerLayer.current.clearLayers();
      polys.current.clear(); markers.current.clear();
      m.fitBounds(gridBounds(world), { padding: [8, 8] });
    }
    const seen = new Set<Id>();
    for (const b of Object.values(world.blocks)) {
      seen.add(b.id);
      const style = hexStyle(world, b.id, b.id === selRef.current.blockId);
      let p = polys.current.get(b.id);
      if (!p) {
        p = L.polygon(b.polygon.map(c => [c.lat, c.lng] as [number, number]), style);
        p.on('click', () => openSheet({ kind: 'block', blockId: b.id }));
        p.addTo(hexLayer.current); polys.current.set(b.id, p);
      } else p.setStyle(style);
    }
    for (const [id, p] of polys.current) if (!seen.has(id)) { hexLayer.current.removeLayer(p); polys.current.delete(id); }
    syncMarkers(m, world);
  }, [world]);

  // ---- selection highlight ----
  useEffect(() => {
    if (!world) return;
    for (const [id, p] of polys.current) p.setStyle(hexStyle(world, id, id === blockId));
    if (blockId) polys.current.get(blockId)?.bringToFront();
    for (const [key, k] of markers.current) {
      if (!key.startsWith('biz:')) continue;
      const e = k.mk.getElement()?.firstElementChild as HTMLElement | null;
      e?.classList.toggle('sel', key === `biz:${businessId}`);
    }
  }, [blockId, businessId, world]);

  function syncMarkers(m: L.Map, w: World) {
    const hi = blocksAreBig(m, w);
    const want = new Map<string, Want>();
    const at = (b: World['blocks'][string], dx: number, dy: number): L.LatLngExpression => {
      const p = hex.metersToLatLng(b.center, dx, dy); return [p.lat, p.lng];
    };
    const sb = select.startBlock(w);
    want.set('start', { html: '<div class="start-marker" title="Where you started">★</div>', pos: [sb.center.lat, sb.center.lng], size: [18, 18], anchor: [9, hi ? -4 : 28], layer: 'badge' });
    for (const b of Object.values(w.blocks)) {
      if (b.heat > 50) want.set(`fire:${b.id}`, { html: '<div class="hex-fire">🔥</div>', pos: at(b, 0, hi ? Math.min(w.hexSizeM * 0.55, Math.sqrt(b.areaM2) * 0.35) : 0), size: [16, 16], anchor: [8, hi ? 8 : 24], layer: 'badge' });
      if (!hi) {
        if (b.businessIds.length) want.set(`count:${b.id}`, { html: `<div class="hex-badge">${b.businessIds.length}</div>`, pos: [b.center.lat, b.center.lng], size: [22, 22], anchor: [11, 11], layer: 'badge' });
      } else {
        const n = b.businessIds.length;
        b.businessIds.forEach((bid, i) => {
          const biz = w.businesses[bid]; if (!biz) return;
          const a = (i / n) * Math.PI * 2 - Math.PI / 2; const r = n > 1 ? Math.min(w.hexSizeM * 0.45, Math.sqrt(b.areaM2) * 0.28) : 0;
          const yours = biz.ownedBy === 'player' || biz.protection?.factionId === PLAYER;
          want.set(`biz:${bid}`, { html: `<div class="biz-marker${yours ? ' yours' : ''}${bid === selRef.current.businessId ? ' sel' : ''}">${BUSINESS_DEFS[biz.type].icon}</div>`, pos: at(b, Math.cos(a) * r, Math.sin(a) * r), size: [28, 28], anchor: [14, 14], layer: 'marker', click: () => openSheet({ kind: 'business', businessId: bid }) });
        });
      }
      const sh = b.safehouseId ? w.safehouses[b.safehouseId] : undefined;
      if (sh) want.set(`safe:${sh.id}`, { html: `<div class="safe-marker${sh.owner === PLAYER ? '' : ' rival'}">🏠</div>`, pos: hi ? at(b, 0, -Math.min(w.hexSizeM * 0.3, Math.sqrt(b.areaM2) * 0.2)) : [b.center.lat, b.center.lng], size: [30, 30], anchor: [15, hi ? 15 : 30], layer: 'marker', click: () => openSheet({ kind: 'block', blockId: b.id }) });
    }
    for (const [key, k] of markers.current) if (!want.has(key)) { k.mk.remove(); markers.current.delete(key); }
    for (const [key, d] of want) {
      const anchor = d.anchor.join(',');
      const kept = markers.current.get(key);
      if (kept) {
        if (kept.html !== d.html || kept.anchor !== anchor) { kept.mk.setIcon(L.divIcon({ className: 'leaflet-div-icon', html: d.html, iconSize: d.size, iconAnchor: d.anchor })); kept.html = d.html; kept.anchor = anchor; }
        kept.mk.setLatLng(d.pos);
        continue;
      }
      const mk = L.marker(d.pos, { icon: L.divIcon({ className: 'leaflet-div-icon', html: d.html, iconSize: d.size, iconAnchor: d.anchor }), interactive: !!d.click, keyboard: false });
      if (d.click) mk.on('click', d.click);
      mk.addTo(d.layer === 'badge' ? badgeLayer.current : markerLayer.current);
      markers.current.set(key, { mk, html: d.html, anchor });
    }
  }

  return <div ref={el} className="map" role="application" aria-label="City map" />;
}
