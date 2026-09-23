import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { resolveBasemap } from './Map';
import {
  BACKGROUND_DEFS, CUSTOM_BUDGET, CUSTOM_SKILL_MAX, CUSTOM_SKILL_MIN, SKILL_BLURBS, SKILL_LABELS, SKILL_ORDER, START_TRAITS, legalCustomSkills, remaining,
} from '@content/backgrounds';
import { BIG_CITIES } from '@content/cities';
import { boxSpanM, generateWorld, jitterOrigin, placePrecision, shouldJitter } from '@sim/index';
import type { PlacePrecision } from '@sim/index';
import { Rng } from '@sim/rng';
import type { LatLng, Player, Skills, StartTraitId } from '@sim/types';
import { newGame } from '@ui/store';
import { gridChunk, loadChunk, reason } from '@ui/net/chunks';
import { chunkBounds, chunkKeyAt, chunkNeighbors, type GeoChunk } from '@geo/chunks';
import { Icon, iconMarkup } from '@ui/icons';
import { TitleTabs } from './TitleTabs';

type Mode = 'geo' | 'search' | 'pick';
/**
 * `lat`/`lng` is where the game will actually start. For a city-level pick that is a
 * corner of the city rather than its pin: `base` keeps the pin, `corner` says which side
 * of town, and the dice button below rolls another one.
 */
interface Place { lat: number; lng: number; name: string; precision: PlacePrecision; base?: LatLng; spanM?: number; corner?: string; sector?: number }

/** Desktops have no GPS: they ask a network service, which is the half that usually fails. */
const GEO_ERRORS: Record<number, string> = {
  1: 'Your browser blocked the location request. Allow location for this site (the padlock in the address bar), then try again — or just search for where you are.',
  2: 'Your device could not work out where it is. Laptops and desktops have no GPS and guess from wi-fi, which often fails. Search for your city instead.',
  3: 'Finding you took too long. Try again, or search for your city.',
  0: 'Your browser never answered. The permission bubble may still be waiting at the top of the window — or this computer simply cannot work out where it is. Search for your city instead.',
};
/** Chrome does not start the `timeout` clock until the permission prompt is answered, so a prompt nobody
 *  clicks hangs for ever. Our own watchdog is the only thing that ends that wait. */
const GEO_WATCHDOG_MS = 20000;

/**
 * Move a city-level pick a few km into one corner of the city. Exact addresses and the
 * device's own position are never moved: those are where the player meant.
 */
function toCorner(p: Place, avoidSector?: number): Place {
  if (!shouldJitter(p.precision)) return p;
  const base = p.base ?? { lat: p.lat, lng: p.lng };
  // the map is the same for everyone, but which corner you get is not: seeded fresh each roll
  const rng = new Rng(Math.floor(Math.random() * 0x7fffffff));
  const span = p.spanM;
  const c = jitterOrigin(base, rng, { avoidSector, maxM: span ? Math.max(1500, Math.min(span / 3, 5000)) : undefined });
  return { ...p, lat: c.origin.lat, lng: c.origin.lng, base, corner: c.label, sector: c.sector };
}

export function Onboarding() {
  const [name, setName] = useState('');
  const [bg, setBg] = useState<Player['background']>('charm');
  const [maker, setMaker] = useState<'preset' | 'custom'>('preset');
  // point-buy starts flat at the floor: every point above it is the player's own choice
  const [custom, setCustom] = useState<Skills>(() => legalCustomSkills({}));
  const [trait, setTrait] = useState<StartTraitId>('connected');
  const left = remaining(custom);
  const customReady = left === 0;
  const [mode, setMode] = useState<Mode>('search');
  const [place, setPlace] = useState<Place | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [geoState, setGeoState] = useState<'idle' | 'asking' | 'ok' | 'failed'>('idle');

  const locate = async () => {
    if (!navigator.geolocation) { setGeoState('failed'); setStatus('This browser has no location service at all. Search for a place instead.'); return; }
    if (typeof window !== 'undefined' && window.isSecureContext === false) { setGeoState('failed'); setStatus('Location only works on a secure (https) connection. Search for a place instead.'); return; }
    setBusy(true); setGeoState('asking'); setStatus('Asking your browser where you are — say yes to the permission prompt.');
    try {
      // a permission already refused never prompts again: say so rather than spinning
      const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
      if (perm?.state === 'denied') { setBusy(false); setGeoState('failed'); setStatus(GEO_ERRORS[1]); return; }
    } catch { /* Safari and older browsers have no permissions API; just ask */ }
    let settled = false;
    const give = (state: 'ok' | 'failed', text: string) => { if (settled) return; settled = true; setBusy(false); setGeoState(state); setStatus(text); };
    const watchdog = setTimeout(() => give('failed', GEO_ERRORS[0]), GEO_WATCHDOG_MS);
    navigator.geolocation.getCurrentPosition(
      pos => { clearTimeout(watchdog); if (settled) return; give('ok', ''); setPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Where you are', precision: 'device' }); },
      err => { clearTimeout(watchdog); give('failed', GEO_ERRORS[err.code] ?? `Could not get your location (${err.message}). Search for a place instead.`); },
      { enableHighAccuracy: false, timeout: GEO_WATCHDOG_MS, maximumAge: 600000 },
    );
  };
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true); setStatus('Searching…'); setResults([]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q.trim())}&limit=5`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as { lat: string; lon: string; display_name: string; class?: string; type?: string; addresstype?: string; boundingbox?: string[] }[];
      const out: Place[] = rows.map(r => ({
        lat: Number(r.lat), lng: Number(r.lon), name: r.display_name.split(',').slice(0, 2).join(',').trim(),
        precision: placePrecision(r), spanM: boxSpanM(r.boundingbox),
      }));
      setResults(out); setStatus(out.length ? '' : 'Nothing found. Try another name or a random city.');
    } catch (e) { setStatus(`Search failed (${(e as Error).message}). Pick on the map or use a random city.`); }
    setBusy(false);
  };
  const random = () => {
    const c = BIG_CITIES[Math.floor(Math.random() * BIG_CITIES.length)];
    setPlace(toCorner({ ...c, precision: 'city' }));
    setStatus('');
  };
  /** Same city, another part of town: never the corner you are standing in now. */
  const reroll = () => { setPlace(p => (p ? toCorner(p, p.sector) : p)); setStatus(''); };
  const [building, setBuilding] = useState<string | null>(null);
  const skipRef = useRef(false);
  const [buildStart, setBuildStart] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => { if (!building) return; setBuildStart(s => s || Date.now()); const iv = setInterval(() => tick(t => t + 1), 1000); return () => clearInterval(iv); }, [building]);
  useEffect(() => { if (!building) setBuildStart(0); }, [building]);
  const [failed, setFailed] = useState<string | null>(null);
  const start = async (useGrid = false) => {
    if (!place || building) return;
    const origin: LatLng = { lat: place.lat, lng: place.lng };
    setBuilding('Contacting the map server…'); setFailed(null);
    skipRef.current = false;
    let city: GeoChunk | undefined; const extra: GeoChunk[] = []; let note = '';
    const startKey = chunkKeyAt(origin);
    if (!useGrid) {
      try {
        const skip = new Promise<never>((_, reject) => { const iv = setInterval(() => { if (skipRef.current) { clearInterval(iv); reject(new Error('skipped')); } }, 200); });
        // one attempt, one budget: a dense city centre that cannot answer in 45s is a failure to report, not a longer wait
        city = await Promise.race([loadChunk(startKey, s => setBuilding(s), { attempts: 1, timeoutMs: 25000, budgetMs: 45000, priority: 10 }), skip]);
        // a start near a chunk edge sits at the edge of the known world: warm the close neighbours, but never wait on them
        const near = chunkNeighbors(startKey).filter(k => { const b = chunkBounds(k); const dLat = Math.max(b.south - origin.lat, 0, origin.lat - b.north) * 111320; const dLng = Math.max(b.west - origin.lng, 0, origin.lng - b.east) * 111320 * Math.cos((origin.lat * Math.PI) / 180); return Math.hypot(dLat, dLng) < 450; });
        for (const k of near) void loadChunk(k, undefined, { priority: 1 }).catch(() => { /* they load again when you walk there */ });
      } catch (e) {
        // no silent grid: say what happened and let the player retry or choose the grid
        const why = (e as Error).message === 'skipped' ? 'You stopped the download.' : `Could not map the real streets here: ${reason(e)}.`;
        setBuilding(null); setFailed(why);
        return;
      }
    } else {
      city = gridChunk(startKey);
      note = 'Started on a simple grid by choice. Real streets load as you explore, and you can rebuild on them from the map any time.';
    }
    setBuilding('Populating the city…');
    await new Promise(r => setTimeout(r, 30));
    const w = generateWorld({
      origin, placeName: place.name, playerName: name.trim() || 'Nobody',
      background: maker === 'custom' ? 'custom' : bg,
      custom: maker === 'custom' ? { skills: custom, trait } : undefined,
      chunk: city, extraChunks: extra,
    });
    if (note) w.log.push({ day: 1, text: note, tone: 'warn' });
    setBuilding(null);
    newGame(w);
  };

  return (
    <div className="onboard">
      <TitleTabs current="original" />
      <h1>RACKETS</h1>
      <p className="tag">Build a criminal empire on the real map. Start where you stand.</p>

      <label className="field" htmlFor="ob-name">Your name</label>
      <input id="ob-name" className="input" placeholder="What do they call you?" value={name} onChange={e => setName(e.target.value)} autoComplete="off" maxLength={24} />

      <div className="section-title">Background</div>
      <div className="segment">
        <button type="button" className={maker === 'preset' ? 'on' : ''} onClick={() => setMaker('preset')}>Pick a life</button>
        <button type="button" className={maker === 'custom' ? 'on' : ''} onClick={() => setMaker('custom')}><Icon name="wrench" size={14} /> Build your own</button>
      </div>
      {maker === 'preset' ? (
        <div className="col mt8">
          {BACKGROUND_DEFS.map(b => (
            <button type="button" key={b.id} className={`bg-opt${bg === b.id ? ' on' : ''}`} onClick={() => setBg(b.id)}>
              <b>{b.ico} {b.label}</b><span>{b.blurb}</span>
              {bg === b.id && <span className="bg-detail">{b.detail}</span>}
            </button>
          ))}
        </div>
      ) : (
        <CustomMaker skills={custom} onSkills={setCustom} trait={trait} onTrait={setTrait} />
      )}

      <div className="section-title">Start location</div>
      <div className="segment">
        <button type="button" className={mode === 'geo' ? 'on' : ''} onClick={() => { setMode('geo'); void locate(); }}><Icon name="you" size={14} /> Near me</button>
        <button type="button" className={mode === 'search' ? 'on' : ''} onClick={() => setMode('search')}><Icon name="search" size={14} /> Search</button>
        <button type="button" className={mode === 'pick' ? 'on' : ''} onClick={() => setMode('pick')}><Icon name="map" size={14} /> On the map</button>
      </div>
      {mode === 'search' && (
        <div className="mt8">
          <form className="row" onSubmit={e => { e.preventDefault(); void search(); }}>
            <input className="input grow" placeholder="City, neighbourhood, address…" value={q} onChange={e => setQ(e.target.value)} inputMode="search" enterKeyHint="search" autoComplete="off" aria-label="Search for a place" />
            <button type="submit" className="btn" disabled={busy}>Go</button>
          </form>
          {results.length > 0 && (
            <div className="list mt8">
              {results.map((r, i) => (
                <button type="button" key={i} className={`result${place?.name === r.name ? ' on' : ''}`} onClick={() => setPlace(toCorner(r))}>
                  {r.name}{r.precision === 'city' && <span className="muted small"> · a corner of the city</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {mode === 'geo' && (
        <div className="mt8">
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost grow" disabled={busy} onClick={() => void locate()}>{busy ? 'Finding you…' : geoState === 'idle' ? 'Find me' : 'Try again'}</button>
            {geoState === 'failed' && <button type="button" className="btn btn-ghost" onClick={() => { setMode('search'); setStatus(''); }}>Search instead</button>}
          </div>
          {geoState !== 'failed' && <p className="small muted mt8">On a phone this is your GPS. On a computer the browser guesses from your network, which does not always work — search is the reliable way there.</p>}
        </div>
      )}
      {mode === 'pick' && <PickMap value={place} onPick={(lat, lng) => setPlace({ lat, lng, name: `${lat.toFixed(3)}, ${lng.toFixed(3)}`, precision: 'exact' })} />}
      {status && <p className="small orange mt8">{status}</p>}
      <div className="row mt8">
        <button type="button" className="btn btn-ghost grow" onClick={random}><Icon name="gambling_den" size={14} /> Random big city</button>
      </div>
      {place && (
        <p className="mt8">
          Starting in <b className="gold">{place.name}</b>
          {place.corner && <span>, on <b className="gold">{place.corner}</b></span>}
          {' '}<span className="muted small">({place.lat.toFixed(3)}, {place.lng.toFixed(3)})</span>
        </p>
      )}
      {place && shouldJitter(place.precision) && (
        <button type="button" className="btn btn-ghost btn-block" onClick={reroll}><Icon name="gambling_den" size={14} /> Try a different corner of {place.name}</button>
      )}

      <div className="grow" />
      <div className="onboard-foot">
        {failed && (
          <div className="card mb8" style={{ borderColor: 'var(--red)' }}>
            <b>Streets not mapped.</b>
            <p className="small muted mt8">{failed} The map server is free and sometimes slow; a second try usually works.</p>
            <div className="row mt8" style={{ gap: 8 }}>
              <button type="button" className="btn btn-primary grow" onClick={() => void start(false)}>Try again</button>
              <button type="button" className="btn btn-ghost" onClick={() => void start(true)}>Use a grid instead</button>
            </div>
          </div>
        )}
        <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 52 }} disabled={!place || !!building || (maker === 'custom' && !customReady)} onClick={() => void start(false)}>{building ? 'Building your city…' : place ? `Start in ${place.name}` : 'Start'}</button>
        {!place && <p className="small muted mt8" style={{ textAlign: 'center', margin: '8px 0 0' }}>Pick a starting point first.</p>}
        {place && maker === 'custom' && !customReady && <p className="small orange mt8" style={{ textAlign: 'center', margin: '8px 0 0' }}>{left} point{left === 1 ? '' : 's'} still to spend.</p>}
      </div>
      {building && (
        <div className="building" role="status" aria-live="polite">
          <div className="spinner" />
          <b>Mapping {place?.name}</b>
          <p className="small muted">{building}</p>
          <p className="small muted">Real streets, real blocks, real businesses from OpenStreetMap. Dense cities take longer; the map server is free and sometimes slow. It gives up on its own after 45s{buildStart ? ` · ${Math.round((Date.now() - buildStart) / 1000)}s` : ''}.</p>
          {buildStart > 0 && Date.now() - buildStart > 8000 && !skipRef.current && (
            <button type="button" className="btn btn-ghost mt8" onClick={() => { skipRef.current = true; setBuilding('Stopping…'); }}>Stop and choose</button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Point-buy. Fewer points than any preset and a lower ceiling, in exchange for a trait of
 * your own: broad and pointed, against a preset's spike and its perk.
 */
function CustomMaker({ skills, onSkills, trait, onTrait }: { skills: Skills; onSkills: (s: Skills) => void; trait: StartTraitId; onTrait: (t: StartTraitId) => void }) {
  const left = remaining(skills);
  const set = (k: keyof Skills, v: number) => {
    const next = { ...skills, [k]: Math.max(CUSTOM_SKILL_MIN, Math.min(CUSTOM_SKILL_MAX, v)) };
    if (remaining(next) < 0) return;
    onSkills(next);
  };
  return (
    <div className="mt8">
      <div className="row between">
        <span className="small muted">Spend {CUSTOM_BUDGET} points, {CUSTOM_SKILL_MIN} to {CUSTOM_SKILL_MAX} each.</span>
        <span className={`chip${left === 0 ? '' : ' sel'}`}>{left} left</span>
      </div>
      <div className="col mt8">
        {SKILL_ORDER.map(k => (
          <div key={k} className="buy-row">
            <div className="grow">
              <b>{SKILL_LABELS[k]}</b>
              <span className="small muted" style={{ display: 'block' }}>{SKILL_BLURBS[k]}</span>
            </div>
            <button type="button" className="chip btn" aria-label={`Less ${SKILL_LABELS[k]}`} disabled={skills[k] <= CUSTOM_SKILL_MIN} onClick={() => set(k, skills[k] - 1)}>−</button>
            <b className="buy-value">{skills[k]}</b>
            <button type="button" className="chip btn" aria-label={`More ${SKILL_LABELS[k]}`} disabled={skills[k] >= CUSTOM_SKILL_MAX || left <= 0} onClick={() => set(k, skills[k] + 1)}>+</button>
          </div>
        ))}
      </div>
      <div className="section-title">One thing you bring with you</div>
      <div className="col">
        {START_TRAITS.map(t => (
          <button type="button" key={t.id} className={`bg-opt${trait === t.id ? ' on' : ''}`} onClick={() => onTrait(t.id)}>
            <b>{t.ico} {t.label}</b><span>{t.blurb}</span>
            {trait === t.id && <span className="bg-detail">{t.detail}</span>}
          </button>
        ))}
      </div>
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
    const ro = new ResizeObserver(() => m.resize()); ro.observe(el.current);
    return () => { ro.disconnect(); disposed = true; m.remove(); map.current = null; pin.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!value) { pin.current?.remove(); pin.current = null; return; }
    if (!pin.current) { const node = document.createElement('div'); node.className = 'pin-marker'; node.innerHTML = iconMarkup('you', { size: 26, color: '#f5c542' }); pin.current = new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat([value.lng, value.lat]).addTo(m); }
    else pin.current.setLngLat([value.lng, value.lat]);
  }, [value]);
  return <div><div ref={el} className="pickmap" /><p className="small muted mt8">Tap the map to drop your pin.</p></div>;
}
