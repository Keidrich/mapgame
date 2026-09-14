import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from 'maplibre-gl';
import type { Feature as GJFeature, FeatureCollection, Polygon } from 'geojson';
import { select } from '@sim/index';
import { PLAYER, type Id, type ProductKind, type World } from '@sim/types';
import { AUTHORITY_KINDS, POSTURES } from '@content/authority';
import { BUSINESS_DEFS } from '@content/businesses';
import { chunkBounds, chunksInBox, type GeoChunk } from '@geo/chunks';
import { topInfluence } from '@ui/derive';
import { bumpChunks, explainFog, openSheet, revealNear, useStore, type MapLayer } from '@ui/store';
import { allCachedChunks, loadChunk, recentlyFailed } from '@ui/net/chunks';

// MapLibre 6 spawns its worker from a file next to its own module, which a bundled build never ships.
// Point it at the copy Vite bundles for us instead, or every source silently fails to load in production.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

/** Basemaps in order of preference. Vector styles need no API key; the last entry is a raster fallback MapLibre renders itself. */
export const BASEMAP_STYLES: (string | StyleSpecification)[] = [
  'https://tiles.openfreemap.org/styles/dark',
  'https://tiles.versatiles.org/assets/styles/eclipse/style.json',
  'https://tiles.openfreemap.org/styles/positron',
  'https://tiles.openfreemap.org/styles/liberty',
  {
    version: 8,
    sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' } },
    layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-brightness-max': 0.4, 'raster-saturation': -0.7 } }],
  },
];
const MARKER_BLOCK_PX = 96;
const LOAD_MIN_ZOOM = 12.5;
const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

/** Fetch the first basemap style that answers (8 s each). Style objects are used as they are. */
export async function resolveBasemap(): Promise<StyleSpecification> {
  for (const s of BASEMAP_STYLES) {
    if (typeof s !== 'string') return s;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    try { const res = await fetch(s, { signal: ctrl.signal }); if (res.ok) { const json = (await res.json()) as StyleSpecification; if (json && json.version === 8) return json; } }
    catch { /* next */ } finally { clearTimeout(t); }
  }
  return BASEMAP_STYLES[BASEMAP_STYLES.length - 1] as StyleSpecification;
}

interface Props { id: string; chunkKey: string; color: string; fillOpacity: number; line: string; lineWidth: number; lineOpacity: number; unpopulated: 0 | 1; selected: 0 | 1 }
type Feature = GJFeature<Polygon, Props>;

const ring = (poly: { lat: number; lng: number }[]) => [[...poly.map(p => [p.lng, p.lat]), [poly[0].lng, poly[0].lat]]];

/**
 * A block's fill under the chosen overlay. Every mode reads a field the sim already keeps —
 * `heat`, `wealth`, the Authority monitoring field, `influence`, `demand` — and nothing here
 * writes anything or asks for a new per-block stat. `t` is 0..1 along the ramp.
 */
const RAMPS: Record<Exclude<MapLayer, 'control'>, [string, string]> = {
  heat:      ['#3a2020', '#e5484d'],
  wealth:    ['#1e2b22', '#3fbf6f'],
  police:    ['#1c2436', '#4d8df6'],
  influence: ['#2a2233', '#b06cf0'],
  demand:    ['#2b2718', '#f2c94c'],
};
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a); const [r2, g2, b2] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}
export interface LayerOpts { layer: MapLayer; factionId?: Id; product?: ProductKind; field?: Map<Id, number> }
/** The 0..1 reading for one block under one overlay, or undefined for the control view. */
export function layerValue(w: World, blockId: Id, o: LayerOpts): number | undefined {
  const b = w.blocks[blockId]; if (!b) return undefined;
  switch (o.layer) {
    case 'control': return undefined;
    case 'heat': return b.heat / 100;
    case 'wealth': return b.wealth / 100;
    // the whole point of piece 1: what the buildings are putting on this block, drawn
    case 'police': return Math.min(1, (b.police + (o.field?.get(blockId) ?? 0)) / 100);
    case 'influence': return Math.min(1, (b.influence[o.factionId ?? PLAYER] ?? 0) / 100);
    case 'demand': return Math.min(1, (b.demand[o.product ?? 'green'] ?? 0) / 12);
  }
}
function blockFeature(w: World, blockId: Id, selected: boolean, o: LayerOpts): Feature {
  const b = w.blocks[blockId];
  const ctrl = select.blockController(w, blockId);
  const top = topInfluence(b);
  const color = select.factionColor(w, ctrl);
  const hot = b.heat > 50;
  const v = layerValue(w, blockId, o);
  if (v !== undefined) {
    // an overlay replaces the control shading entirely, so a faint reading reads as faint and
    // not as "somebody owns this". Selection and the player's own edges still draw on top.
    const [lo, hi] = RAMPS[o.layer as Exclude<MapLayer, 'control'>];
    return {
      type: 'Feature',
      properties: {
        id: b.id, chunkKey: b.chunkKey,
        color: mix(lo, hi, v),
        fillOpacity: 0.15 + v * 0.55,
        line: selected ? '#ffffff' : ctrl === PLAYER ? '#f2c94c' : '#5a6270',
        lineWidth: selected ? 3 : ctrl === PLAYER ? 1.4 : 0.5,
        lineOpacity: selected ? 1 : ctrl === PLAYER ? 0.9 : 0.4,
        unpopulated: 0, selected: selected ? 1 : 0,
      },
      geometry: { type: 'Polygon', coordinates: ring(b.polygon) },
    };
  }
  const fillOpacity = ctrl ? 0.12 + (Math.min(100, top.value) / 100) * 0.4 : 0.08;
  return {
    type: 'Feature',
    properties: {
      id: b.id, chunkKey: b.chunkKey,
      color: ctrl === PLAYER ? '#f2c94c' : ctrl ? color : '#8a9099',
      fillOpacity: hot ? Math.max(fillOpacity, 0.22) : fillOpacity,
      line: selected ? '#ffffff' : hot ? '#e5484d' : ctrl ? color : '#5a6270',
      lineWidth: selected ? 3 : hot ? 2 : ctrl ? 1.4 : 0.8,
      lineOpacity: selected ? 1 : ctrl ? 0.9 : 0.75,
      unpopulated: 0, selected: selected ? 1 : 0,
    },
    geometry: { type: 'Polygon', coordinates: ring(b.polygon) },
  };
}
function ghostFeature(c: GeoChunk, i: number): Feature {
  const b = c.blocks[i];
  return {
    type: 'Feature',
    properties: { id: b.id, chunkKey: c.key, color: '#8a9099', fillOpacity: 0.03, line: '#3a414b', lineWidth: 0.6, lineOpacity: 0.5, unpopulated: 1, selected: 0 },
    geometry: { type: 'Polygon', coordinates: ring(b.polygon) },
  };
}
function buildGeoJSON(w: World | null, selectedId?: Id, o: LayerOpts = { layer: 'control' }): FeatureCollection {
  const features: Feature[] = [];
  const populated = new Set<string>();
  // the monitoring field is one pass for the whole city, not a search per block
  const opts: LayerOpts = { ...o, field: w && o.layer === 'police' ? select.monitoringField(w) : undefined };
  if (w) for (const id of Object.keys(w.blocks)) { populated.add(id); features.push(blockFeature(w, id, id === selectedId, opts)); }
  // streets we have the geometry for but nobody has walked to: drawn faintly, under the cloud
  for (const c of allCachedChunks()) { if (w?.chunks[c.key]) continue; c.blocks.forEach((b, i) => { if (!populated.has(b.id)) features.push(ghostFeature(c, i)); }); }
  return { type: 'FeatureCollection', features };
}

/**
 * Cloud over every chunk in view the player has not opened up. One rectangle per chunk, so it
 * covers ground whose streets were never downloaded as well as ground that is merely unvisited —
 * the player should not be able to tell the difference, because to them there is none.
 */
function buildFogJSON(w: World | null, box: { south: number; west: number; north: number; east: number } | null): FeatureCollection {
  if (!w || !box) return { type: 'FeatureCollection', features: [] };
  const out: GJFeature<Polygon, { key: string }>[] = [];
  for (const key of chunksInBox(box.south, box.west, box.north, box.east, 60)) {
    if (w.chunks[key]) continue;
    const b = chunkBounds(key);
    out.push({
      type: 'Feature',
      properties: { key },
      geometry: { type: 'Polygon', coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]] },
    });
  }
  return { type: 'FeatureCollection', features: out as GJFeature<Polygon, never>[] };
}
const boundsOf = (m: MLMap) => { const b = m.getBounds(); return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }; };
function blocksAreBig(m: MLMap, w: World): boolean {
  const blocks = Object.values(w.blocks); if (!blocks.length) return false;
  const avgSide = Math.sqrt(blocks.reduce((s, b) => s + b.areaM2, 0) / blocks.length);
  const metresPerPx = (156543.03 * Math.cos((m.getCenter().lat * Math.PI) / 180)) / Math.pow(2, m.getZoom());
  return avgSide / metresPerPx >= MARKER_BLOCK_PX;
}

interface Want { html: string; lng: number; lat: number; cls: string; click?: () => void }
type Kept = { mk: maplibregl.Marker; sig: string };

/** Fullscreen MapLibre map: basemap, all block polygons as one GeoJSON source, DOM markers for what is in view. */
export function MapView() {
  const world = useStore(s => s.world);
  const blockId = useStore(s => s.selection.blockId);
  const businessId = useStore(s => s.selection.businessId);
  const chunkVersion = useStore(s => s.chunkVersion);
  const tab = useStore(s => s.tab);
  const layer = useStore(s => s.layer);
  const layerFactionId = useStore(s => s.layerFactionId);
  const layerProduct = useStore(s => s.layerProduct);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const markers = useRef(new Map<string, Kept>());
  const seedRef = useRef<number | null>(null);
  const worldRef = useRef(world); worldRef.current = world;
  const selRef = useRef({ blockId, businessId }); selRef.current = { blockId, businessId };
  const layerRef = useRef<LayerOpts>({ layer, factionId: layerFactionId, product: layerProduct }); layerRef.current = { layer, factionId: layerFactionId, product: layerProduct };
  const loading = useRef(new Set<string>());
  const [loadingCount, setLoadingCount] = useState(0);

  useEffect(() => {
    if (!el.current || map.current) return;
    const w0 = worldRef.current;
    const center: [number, number] = w0 ? [w0.origin.lng, w0.origin.lat] : [-74.006, 40.7128];
    const m = new maplibregl.Map({ container: el.current, style: EMPTY_STYLE, center, zoom: 14.5, minZoom: 3, maxZoom: 18.5, attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false, touchPitch: false });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    (window as unknown as { __map?: MLMap }).__map = m; // handy for debugging on device: window.__map
    let disposed = false;
    void resolveBasemap().then(style => { if (!disposed && map.current === m) { ready.current = false; m.setStyle(style); } });
    const addLayers = () => {
      if (m.getSource('blocks')) return;
      m.addSource('blocks', { type: 'geojson', data: buildGeoJSON(worldRef.current, selRef.current.blockId, layerRef.current) });
      m.addLayer({ id: 'blocks-fill', type: 'fill', source: 'blocks', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'fillOpacity'] } });
      m.addLayer({ id: 'blocks-line', type: 'line', source: 'blocks', paint: { 'line-color': ['get', 'line'], 'line-width': ['get', 'lineWidth'], 'line-opacity': ['get', 'lineOpacity'] } });
      // cloud sits above the blocks: unwalked streets show through it, faintly
      m.addSource('fog', { type: 'geojson', data: buildFogJSON(worldRef.current, boundsOf(m)) });
      m.addLayer({ id: 'fog-fill', type: 'fill', source: 'fog', paint: { 'fill-color': '#0d1117', 'fill-opacity': 0.82 } });
      m.addLayer({ id: 'fog-edge', type: 'line', source: 'fog', paint: { 'line-color': '#39414d', 'line-width': 1, 'line-opacity': 0.5, 'line-dasharray': [2, 2] } });
      ready.current = true;
      syncMarkers();
    };
    m.on('style.load', addLayers);
    m.on('error', () => { /* tile and glyph hiccups are non-fatal; the style itself was validated by resolveBasemap */ });
    m.on('click', 'fog-fill', e => { explainFog((e.features?.[0]?.properties as { key: string } | undefined)?.key ?? ''); });
    m.on('click', 'blocks-fill', e => {
      const f = e.features?.[0]; if (!f) return;
      const { id, chunkKey, unpopulated } = f.properties as Props;
      // tapping used to summon a whole district; now ground opens by walking to it
      if (unpopulated) explainFog(chunkKey); else openSheet({ kind: 'block', blockId: id });
    });
    m.on('mouseenter', 'blocks-fill', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'blocks-fill', () => { m.getCanvas().style.cursor = ''; });
    m.on('moveend', () => {
      syncMarkers(); loadVisibleChunks();
      const fog = m.getSource('fog') as GeoJSONSource | undefined;
      if (fog) fog.setData(buildFogJSON(worldRef.current, boundsOf(m)));
    });
    m.on('zoomend', syncMarkers);
    // the HUD measures itself after mount and moves the map's top edge; keep MapLibre's transform in step with the container
    const ro = new ResizeObserver(() => { m.resize(); syncMarkers(); });
    ro.observe(el.current);
    return () => { ro.disconnect(); disposed = true; for (const k of markers.current.values()) k.mk.remove(); markers.current.clear(); m.remove(); map.current = null; ready.current = false; seedRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (tab === 'map') setTimeout(() => map.current?.resize(), 50); }, [tab]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    if (world && seedRef.current !== world.seed) {
      seedRef.current = world.seed;
      // centre on where the player starts, close enough to read the blocks around them
      m.jumpTo({ center: [world.origin.lng, world.origin.lat], zoom: 15.2 });
    }
    const src = m.getSource('blocks') as GeoJSONSource | undefined;
    if (src) src.setData(buildGeoJSON(world, blockId, { layer, factionId: layerFactionId, product: layerProduct }));
    const fog = m.getSource('fog') as GeoJSONSource | undefined;
    if (fog) fog.setData(buildFogJSON(world, boundsOf(m)));
    syncMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, blockId, businessId, chunkVersion, layer, layerFactionId, layerProduct]);

  function loadVisibleChunks() {
    const m = map.current; if (!m || m.getZoom() < LOAD_MIN_ZOOM) return;
    const b = m.getBounds(); const w = worldRef.current;
    for (const key of chunksInBox(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), 9)) {
      if (loading.current.has(key) || w?.chunks[key] || allCachedChunks().some(c => c.key === key) || recentlyFailed(key)) continue;
      loading.current.add(key); setLoadingCount(loading.current.size);
      // this only warms the geometry cache. Whether those streets become a real place with
      // people in it is `revealNear()`'s decision, and it wants somebody to have walked there.
      void loadChunk(key, undefined, { priority: 0 }).then(() => { loading.current.delete(key); setLoadingCount(loading.current.size); bumpChunks(); void revealNear(); }).catch(() => { loading.current.delete(key); setLoadingCount(loading.current.size); });
    }
  }

  function syncMarkers() {
    const m = map.current; const w = worldRef.current;
    if (!m || !w || !ready.current) return;
    const hi = blocksAreBig(m, w);
    const vb = m.getBounds();
    const inView = (lat: number, lng: number) => lat >= vb.getSouth() && lat <= vb.getNorth() && lng >= vb.getWest() && lng <= vb.getEast();
    const want = new Map<string, Want>();
    const sb = select.startBlock(w);
    want.set('start', { html: '★', cls: 'start-marker', lng: sb.center.lng, lat: sb.center.lat });
    // the law, as a thing on the map. The radius it is watching is the 'police' overlay; this
    // marker is what tells the player the radius exists at all.
    for (const a of select.authorities(w)) {
      const ab = w.blocks[a.blockId]; if (!ab || !inView(ab.center.lat, ab.center.lng)) continue;
      const rung = POSTURES[a.posture];
      want.set(`law:${a.id}`, {
        html: `${AUTHORITY_KINDS[a.kind].icon}${a.posture === 'routine' ? '' : rung.icon}`,
        cls: `law-marker${a.posture === 'routine' ? '' : ' hot'}`,
        lng: ab.center.lng, lat: ab.center.lat,
        click: () => openSheet({ kind: 'block', blockId: a.blockId }),
      });
    }
    const you = w.blocks[w.player.currentBlockId];
    const offset = (b: World['blocks'][string], dx: number, dy: number) => ({ lng: b.center.lng + dx / (111320 * Math.cos((b.center.lat * Math.PI) / 180)), lat: b.center.lat + dy / 111320 });
    if (you) want.set('you', { html: '🚶', cls: 'you-marker', ...offset(you, 0, hi ? Math.sqrt(you.areaM2) * 0.22 : 26), click: () => openSheet({ kind: 'block', blockId: you.id }) });
    for (const b of Object.values(w.blocks)) {
      if (!inView(b.center.lat, b.center.lng)) continue;
      if (b.heat > 50) want.set(`fire:${b.id}`, { html: '🔥', cls: 'hex-fire', ...offset(b, 0, hi ? Math.sqrt(b.areaM2) * 0.3 : 0) });
      if (hi) {
        const n = b.businessIds.length;
        b.businessIds.forEach((bid, i) => {
          const biz = w.businesses[bid]; if (!biz) return;
          const a = (i / n) * Math.PI * 2 - Math.PI / 2; const r = n > 1 ? Math.min(90, Math.sqrt(b.areaM2) * 0.28) : 0;
          const yours = biz.ownedBy === 'player' || biz.protection?.factionId === PLAYER;
          want.set(`biz:${bid}`, { html: BUSINESS_DEFS[biz.type].icon, cls: `biz-marker${yours ? ' yours' : ''}${bid === selRef.current.businessId ? ' sel' : ''}`, ...offset(b, Math.cos(a) * r, Math.sin(a) * r), click: () => openSheet({ kind: 'business', businessId: bid }) });
        });
      } else if (b.businessIds.length && m.getZoom() >= 13.5) {
        want.set(`count:${b.id}`, { html: String(b.businessIds.length), cls: 'hex-badge', lng: b.center.lng, lat: b.center.lat });
      }
      const sh = b.safehouseId ? w.safehouses[b.safehouseId] : undefined;
      if (sh) want.set(`safe:${sh.id}`, { html: '🏠', cls: `safe-marker${sh.owner === PLAYER ? '' : ' rival'}`, ...(hi ? offset(b, 0, -Math.sqrt(b.areaM2) * 0.2) : { lng: b.center.lng, lat: b.center.lat }), click: () => openSheet({ kind: 'block', blockId: b.id }) });
    }
    for (const [key, k] of markers.current) if (!want.has(key)) { k.mk.remove(); markers.current.delete(key); }
    for (const [key, d] of want) {
      const sig = `${d.cls}|${d.html}`;
      const kept = markers.current.get(key);
      // MapLibre positions the marker element with its own transform, so all styling lives on an inner node.
      if (kept) { if (kept.sig !== sig) { const inner = kept.mk.getElement().firstElementChild as HTMLElement; inner.className = d.cls; inner.textContent = d.html; kept.sig = sig; } kept.mk.setLngLat([d.lng, d.lat]); continue; }
      const node = document.createElement('div'); node.className = 'mk'; if (!d.click) node.style.pointerEvents = 'none';
      const inner = document.createElement('div'); inner.className = d.cls; inner.textContent = d.html; node.appendChild(inner);
      if (d.click) { const fn = d.click; node.addEventListener('click', ev => { ev.stopPropagation(); fn(); }); }
      const mk = new maplibregl.Marker({ element: node, anchor: 'center' }).setLngLat([d.lng, d.lat]).addTo(m);
      markers.current.set(key, { mk, sig });
    }
  }

  return (
    <>
      <div ref={el} className="map" role="application" aria-label="City map" />
      {loadingCount > 0 && <div className="map-loading" role="status" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 10, zIndex: 5, padding: '6px 12px', borderRadius: 14, background: 'rgba(20,23,28,0.9)', border: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)', pointerEvents: 'none' }}>🗺️ Mapping new streets…</div>}
    </>
  );
}
