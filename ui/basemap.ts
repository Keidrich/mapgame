/**
 * Basemap for the Leaflet map. Same stack Plug uses: OpenFreeMap vector tiles
 * (OpenMapTiles schema, © OpenStreetMap contributors) rendered by MapLibre GL.
 * No API key. If WebGL is missing or the style fails to load, fall back to
 * OpenStreetMap raster tiles with a dark CSS filter so the game stays playable.
 */
import * as L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet';

export const BASEMAP_STYLES = [
  'https://tiles.openfreemap.org/styles/dark',
  'https://tiles.openfreemap.org/styles/positron',
  'https://tiles.openfreemap.org/styles/liberty',
];
export const RASTER_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openfreemap.org">OpenFreeMap</a> · OpenMapTiles';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function addRaster(m: L.Map): L.Layer {
  return L.tileLayer(RASTER_URL, { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19, className: 'tiles-dark' }).addTo(m);
}

/** Adds the basemap to `m` and returns the layer that ended up in use. */
export function addBasemap(m: L.Map): L.Layer {
  if (!webglAvailable()) return addRaster(m);
  let styleIndex = 0;
  let gl: L.MaplibreGL;
  try {
    gl = L.maplibreGL({ style: BASEMAP_STYLES[0], attributionControl: false });
    gl.addTo(m);
    m.attributionControl.addAttribution(ATTRIBUTION);
  } catch {
    return addRaster(m);
  }
  const lm = gl.getMaplibreMap();
  if (!lm) { // the map had no view yet, so Leaflet deferred onAdd; nothing to hook
    return gl;
  }
  let failed = false;
  lm.on('error', (e: { error?: { message?: string; status?: number; url?: string } }) => {
    // Only a failure to load the *style document* itself moves us on: next style, then raster.
    // Individual tile errors (one missing tile, a slow network) are ignored.
    const msg = e?.error?.message ?? ''; const url = e?.error?.url ?? '';
    if (lm.isStyleLoaded()) return;
    if (!/\/styles\//.test(url) && !/\/styles\/|style/i.test(msg)) return;
    styleIndex++;
    if (styleIndex < BASEMAP_STYLES.length) { lm.setStyle(BASEMAP_STYLES[styleIndex]); return; }
    if (failed) return; failed = true;
    m.removeLayer(gl); addRaster(m);
  });
  return gl;
}
