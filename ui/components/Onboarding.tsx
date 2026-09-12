import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { resolveBasemap } from './Map';
import { generateWorld } from '@sim/index';
import type { LatLng, Player } from '@sim/types';
import { newGame } from '@ui/store';
import { loadChunk } from '@ui/net/chunks';
import { chunkKeyAt, type GeoChunk } from '@geo/chunks';

const BACKGROUNDS: { id: Player['background']; label: string; blurb: string; ico: string }[] = [
  { id: 'muscle', label: 'Muscle', blurb: 'You came up on the door. People pay when you ask.', ico: '💪' },
  { id: 'brains', label: 'Brains', blurb: 'Numbers, paper, plans. You see the angles.', ico: '🧠' },
  { id: 'charm', label: 'Charm', blurb: 'Everybody likes you. That is the whole trick.', ico: '🎩' },
];
export const BIG_CITIES: { name: string; lat: number; lng: number }[] = [
  { name: 'New York', lat: 40.7128, lng: -74.006 }, { name: 'London', lat: 51.5074, lng: -0.1278 }, { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 }, { name: 'Mexico City', lat: 19.4326, lng: -99.1332 }, { name: 'Lagos', lat: 6.5244, lng: 3.3792 },
  { name: 'Berlin', lat: 52.52, lng: 13.405 }, { name: 'São Paulo', lat: -23.5505, lng: -46.6333 },
];
type Mode = 'geo' | 'search' | 'pick';
interface Place { lat: number; lng: number; name: string }

export function Onboarding() {
  const [name, setName] = useState('');
  const [bg, setBg] = useState<Player['background']>('charm');
  const [mode, setMode] = useState<Mode>('search');
  const [place, setPlace] = useState<Place | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);

  const locate = () => {
    if (!navigator.geolocation) { setStatus('Geolocation is not available on this device.'); return; }
    setBusy(true); setStatus('Finding you…');
    navigator.geolocation.getCurrentPosition(
      pos => { setBusy(false); setStatus(''); setPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Where you are' }); },
      err => { setBusy(false); setStatus(`Could not get your location (${err.message}). Try search or a random city.`); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true); setStatus('Searching…'); setResults([]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q.trim())}&limit=5`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      const out = rows.map(r => ({ lat: Number(r.lat), lng: Number(r.lon), name: r.display_name.split(',').slice(0, 2).join(',').trim() }));
      setResults(out); setStatus(out.length ? '' : 'Nothing found. Try another name or a random city.');
    } catch (e) { setStatus(`Search failed (${(e as Error).message}). Pick on the map or use a random city.`); }
    setBusy(false);
  };
  const random = () => { const c = BIG_CITIES[Math.floor(Math.random() * BIG_CITIES.length)]; setPlace({ ...c }); setStatus(''); };
  const [building, setBuilding] = useState<string | null>(null);
  const start = async () => {
    if (!place || building) return;
    const origin: LatLng = { lat: place.lat, lng: place.lng };
    setBuilding('Contacting the map server…');
    let city: GeoChunk | undefined; let note = '';
    try {
      city = await loadChunk(chunkKeyAt(origin), s => setBuilding(s));
      if (city.source === 'hex') throw new Error('no street data');
    } catch (e) {
      note = `Could not map the real streets here (${(e as Error).message}). Using a grid instead.`;
      setBuilding(note);
      await new Promise(r => setTimeout(r, 1200));
    }
    setBuilding('Populating the city…');
    await new Promise(r => setTimeout(r, 30));
    const w = generateWorld({ origin, placeName: place.name, playerName: name.trim() || 'Nobody', background: bg, chunk: city });
    if (note) w.log.push({ day: 1, text: note, tone: 'warn' });
    setBuilding(null);
    newGame(w);
  };

  return (
    <div className="onboard">
      <h1>RACKETS</h1>
      <p className="tag">Build a criminal empire on the real map. Start where you stand.</p>

      <label className="field" htmlFor="ob-name">Your name</label>
      <input id="ob-name" className="input" placeholder="What do they call you?" value={name} onChange={e => setName(e.target.value)} autoComplete="off" maxLength={24} />

      <div className="section-title">Background</div>
      <div className="col">
        {BACKGROUNDS.map(b => (
          <button type="button" key={b.id} className={`bg-opt${bg === b.id ? ' on' : ''}`} onClick={() => setBg(b.id)}>
            <b>{b.ico} {b.label}</b><span>{b.blurb}</span>
          </button>
        ))}
      </div>

      <div className="section-title">Start location</div>
      <div className="segment">
        <button type="button" className={mode === 'geo' ? 'on' : ''} onClick={() => { setMode('geo'); locate(); }}>📍 Near me</button>
        <button type="button" className={mode === 'search' ? 'on' : ''} onClick={() => setMode('search')}>🔎 Search</button>
        <button type="button" className={mode === 'pick' ? 'on' : ''} onClick={() => setMode('pick')}>🗺️ On the map</button>
      </div>
      {mode === 'search' && (
        <div className="mt8">
          <form className="row" onSubmit={e => { e.preventDefault(); void search(); }}>
            <input className="input grow" placeholder="City, neighbourhood, address…" value={q} onChange={e => setQ(e.target.value)} inputMode="search" enterKeyHint="search" autoComplete="off" aria-label="Search for a place" />
            <button type="submit" className="btn" disabled={busy}>Go</button>
          </form>
          {results.length > 0 && (
            <div className="list mt8">
              {results.map((r, i) => <button type="button" key={i} className={`result${place?.name === r.name ? ' on' : ''}`} onClick={() => setPlace(r)}>{r.name}</button>)}
            </div>
          )}
        </div>
      )}
      {mode === 'pick' && <PickMap value={place} onPick={(lat, lng) => setPlace({ lat, lng, name: `${lat.toFixed(3)}, ${lng.toFixed(3)}` })} />}
      {status && <p className="small orange mt8">{status}</p>}
      <div className="row mt8">
        <button type="button" className="btn btn-ghost grow" onClick={random}>🎲 Random big city</button>
      </div>
      {place && <p className="mt8">Starting in <b className="gold">{place.name}</b> <span className="muted small">({place.lat.toFixed(3)}, {place.lng.toFixed(3)})</span></p>}

      <div className="grow" />
      <div className="onboard-foot">
        <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 52 }} disabled={!place || !!building} onClick={start}>{building ? 'Building your city…' : place ? `Start in ${place.name}` : 'Start'}</button>
        {!place && <p className="small muted mt8" style={{ textAlign: 'center', margin: '8px 0 0' }}>Pick a starting point first.</p>}
      </div>
      {building && (
        <div className="building" role="status" aria-live="polite">
          <div className="spinner" />
          <b>Mapping {place?.name}</b>
          <p className="small muted">{building}</p>
          <p className="small muted">Real streets, real blocks, real businesses from OpenStreetMap. Ten to twenty seconds.</p>
        </div>
      )}
    </div>
  );
}

function PickMap({ value, onPick }: { value: Place | null; onPick: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pin = useRef<maplibregl.Marker | null>(null);
  const cb = useRef(onPick); cb.current = onPick;
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({ container: el.current, style: { version: 8, sources: {}, layers: [] }, center: value ? [value.lng, value.lat] : [-74.006, 40.7128], zoom: value ? 12 : 2, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
    m.touchZoomRotate.disableRotation();
    let disposed = false;
    void resolveBasemap().then(style => { if (!disposed) m.setStyle(style); });
    m.on('error', () => { /* non-fatal */ });
    m.on('click', (e: maplibregl.MapMouseEvent) => cb.current(e.lngLat.lat, e.lngLat.lng));
    map.current = m;
    return () => { disposed = true; m.remove(); map.current = null; pin.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!value) { pin.current?.remove(); pin.current = null; return; }
    if (!pin.current) { const node = document.createElement('div'); node.className = 'pin-marker'; node.textContent = '📍'; pin.current = new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat([value.lng, value.lat]).addTo(m); }
    else pin.current.setLngLat([value.lng, value.lat]);
  }, [value]);
  return <div><div ref={el} className="pickmap" /><p className="small muted mt8">Tap the map to drop your pin.</p></div>;
}
