import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { prepareRealCity, type RealCity } from '@geo/realCity';
import { signedArea } from '@geo/project';
import { Icon } from '@ui/icons';
import { RealCity2D } from './RealCity2D';
import { DEFAULT_INSETS, type MapCommand } from './view';
import type { MapPlayState } from './MapPlaces';
import './real-city.css';

const NeighborhoodPlay = lazy(() => import('./NeighborhoodPlay'));
const ThreeMap = lazy(() => import('./RealCity3D').then(m => ({ default: m.RealCity3D })));
export function RealCityPreview() {
  const app = useRef<HTMLElement>(null), drag = useRef<number | undefined>(undefined), dragged = useRef(false);
  const [mapState, setMapState] = useState<MapPlayState>(), [insets, setInsets] = useState(DEFAULT_INSETS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [city, setCity] = useState<RealCity | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [three, setThree] = useState(true), [unavailable, setUnavailable] = useState(false);
  const [selected, setSelected] = useState<string>(), [night, setNight] = useState(true), [labels, setLabels] = useState(true);
  const [layers, setLayers] = useState(false), [query, setQuery] = useState('');
  const [playing, setPlaying] = useState(false), [expanded, setExpanded] = useState(true), [searching, setSearching] = useState(false);
  const [command, setCommand] = useState<MapCommand>({ n: 0, kind: 'home' });
  const send = (kind: MapCommand['kind']) => setCommand(c => ({ n: c.n + 1, kind }));
  useEffect(() => {
    const abort = new AbortController(); setError('');
    void fetch('/data/lower-east-side.json', { signal: abort.signal }).then(async res => {
      if (!res.ok) throw new Error(`Map download failed (${res.status}).`);
      const data = await res.json() as RealCity;
      if (data.version !== 1 || !data.buildings?.length || !data.streets?.length) throw new Error('The city sample is incomplete.');
      if (!abort.signal.aborted) setCity(prepareRealCity(data));
    }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load the map.'); });
    return () => abort.abort();
  }, [attempt]);
  useEffect(() => {
    const root = app.current;
    if (!root) return;
    const measure = () => {
      const header = root.querySelector('.rc-header')?.getBoundingClientRect(), sheet = root.querySelector('.rc-sheet')?.getBoundingClientRect();
      const mobile = root.clientWidth < 700;
      const next = { top: mobile ? (header?.bottom ?? 100) + 8 : 30, bottom: mobile ? root.clientHeight - (sheet?.top ?? root.clientHeight - 120) + 12 : 30, left: mobile ? 12 : 430, right: 72 };
      setInsets(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root); root.querySelectorAll('.rc-header,.rc-sheet').forEach(el => observer.observe(el));
    measure(); return () => observer.disconnect();
  }, [city, playing]);
  useEffect(() => { const scroll = app.current?.querySelector('.rc-sheet-scroll'); if (scroll) scroll.scrollTop = 0; }, [selected]);
  const building = city?.buildings.find(b => b.id === selected);
  const results = useMemo(() => query.trim().length >= 2 ? city?.buildings.filter(b => b.address !== 'Unnumbered building' && b.address.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) ?? [] : [], [query, city]);
  const select = useCallback((id: string) => { setSelected(id); setLayers(false); setExpanded(true); if (window.matchMedia('(max-width: 699px)').matches) setCommand(c => ({ n: c.n + 1, kind: 'focus' })); }, []);
  const visit = useCallback((id: string) => { setSelected(id); setExpanded(true); setCommand(c => ({ n: c.n + 1, kind: 'focus' })); }, []);
  const noThree = () => { setThree(false); setUnavailable(true); };
  const area = building ? Math.abs(signedArea(building.rings[0])) - building.rings.slice(1).reduce((a, r) => a + Math.abs(signedArea(r)), 0) : 0;
  return <main className={`rc-app ${night ? 'rc-night' : 'rc-day'}`} data-searching={searching} data-playing={playing} data-search-open={searchOpen} ref={app}>
    {city && (three ? <Suspense fallback={<div className="rc-loading">Opening the 3D city…</div>}><ThreeMap city={city} selected={selected} night={night} labels={labels} command={command} insets={insets} play={mapState} onSelect={select} onUnavailable={noThree} /></Suspense> : <RealCity2D city={city} selected={selected} labels={labels} command={command} insets={insets} play={mapState} onSelect={select} />)}
    <header className="rc-header">
      <div className="rc-title"><a href="/" aria-label="Back to Rackets"><Icon name="back" size={20} /></a><div><span className="rc-wordmark">RACKETS <em>CITY LAB</em></span><h1>New York</h1></div><button type="button" className="rc-search-open" aria-label="Search addresses" aria-expanded={searchOpen} onClick={() => { setSearchOpen(x => !x); setQuery(''); setSearching(false); }}><Icon name="search" size={21} /></button></div>
      {searchOpen && <label className="rc-search"><Icon name="search" size={18} /><input aria-label="Find a building by address" placeholder="Find an address" onFocus={() => setSearching(true)} onBlur={() => setSearching(false)} value={query} onChange={e => setQuery(e.target.value)} /><button type="button" aria-label="Clear search" hidden={!query} onClick={() => setQuery('')}>×</button></label>}
      {query && <div className="rc-results" role="region" aria-label="Address results">{query.trim().length < 2 ? <p>Type at least two characters.</p> : results.length ? results.map(b => <button type="button" key={b.id} onClick={() => { visit(b.id); setQuery(''); setSearching(false); setSearchOpen(false); (document.activeElement as HTMLElement)?.blur(); }}><Icon name="you" size={18} /><span>{b.address}<small>Lower East Side</small></span><span>↗</span></button>) : <p>No matching address in this neighborhood.</p>}</div>}
      {mapState && <div className="rc-hud" aria-label="Player status"><span><small>Day {mapState.day} · {mapState.phase}</small><b>{mapState.ap}/{mapState.apMax} h</b></span><span><small>Clean</small><b>${Math.round(mapState.cash).toLocaleString()}</b></span><span><small>Dirty</small><b>${Math.round(mapState.dirty).toLocaleString()}</b></span><span><small>Heat</small><b>{Math.round(mapState.heat)}</b></span></div>}
    </header>
    {!city && <div className="rc-loading" role="status">{error ? <><b>The map couldn’t load.</b><p>{error}</p><button type="button" onClick={() => setAttempt(a => a + 1)}>Try again</button></> : <><span className="rc-loader" /><b>Mapping the Lower East Side…</b></>}</div>}
    {city && <>
      <div className="rc-controls" aria-label="Map controls">
        <button type="button" aria-label={three ? 'Switch to 2D map' : 'Switch to 3D map'} aria-pressed={three} disabled={unavailable} onClick={() => setThree(t => !t)}><b>{three ? '3D' : '2D'}</b></button>
        <button type="button" aria-label="Map appearance" aria-expanded={layers} onClick={() => setLayers(x => !x)}><Icon name="map" size={22} /></button>
        <button type="button" aria-label={playing ? 'Find my player' : 'Recenter neighborhood'} onClick={() => send(playing ? 'player' : 'home')}><Icon name="you" size={22} /></button>
        <div className="rc-controls-separator" />
        <button className="rc-rail-zoom" type="button" aria-label="Zoom in" onClick={() => send('in')}><span className="rc-zoom">+</span></button>
        <button className="rc-rail-zoom" type="button" aria-label="Zoom out" onClick={() => send('out')}><span className="rc-zoom">−</span></button>
      </div>
      {layers && <aside className="rc-appearance" aria-label="Map appearance"><div><b>Map appearance</b><button type="button" aria-label="Close appearance" onClick={() => setLayers(false)}>×</button></div><button type="button" aria-pressed={night} onClick={() => setNight(x => !x)}><Icon name="moon" size={18} />Night lighting<span>{night ? 'On' : 'Off'}</span></button><button type="button" aria-pressed={labels} onClick={() => setLabels(x => !x)}>Street names<span>{labels ? 'On' : 'Off'}</span></button><div className="rc-appearance-zoom"><button type="button" aria-label="Zoom in from appearance" onClick={() => send('in')}>＋ Zoom</button><button type="button" aria-label="Zoom out from appearance" onClick={() => send('out')}>− Zoom</button></div></aside>}
      <section className={`rc-sheet ${building ? 'rc-sheet-selected' : ''}`} data-expanded={expanded} aria-label={building ? 'Selected building' : 'Neighborhood'}>
        <button type="button" className="rc-sheet-toggle" aria-expanded={expanded} aria-label={expanded ? 'Minimize place sheet' : 'Expand place sheet'} onPointerDown={e => { drag.current = e.clientY; dragged.current = false; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={e => { if (drag.current !== undefined && Math.abs(e.clientY - drag.current) > 30) { setExpanded(e.clientY < drag.current); dragged.current = true; } drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }} onClick={() => { if (!dragged.current) setExpanded(x => !x); dragged.current = false; }}><span className="rc-sheet-handle" /><span>{expanded ? 'Swipe down to see more map' : (mapState?.places.find(p => p.buildingId === selected)?.name ?? building?.address ?? 'Explore the neighborhood')}</span></button>
        <div className="rc-sheet-scroll">
        {playing && <Suspense fallback={<p role="status">Opening your neighborhood…</p>}><NeighborhoodPlay city={city} selected={selected} onChoose={visit} onMapState={setMapState} /></Suspense>}
        {building ? <details className="rc-building-details" open={playing ? undefined : true}><summary>Building details · {building.address}</summary><>
          <div className="rc-sheet-heading"><div><span className="rc-eyebrow">● SELECTED BUILDING · LOWER EAST SIDE</span><h2>{building.address}</h2></div><button type="button" className="rc-close" aria-label="Close building details" onClick={() => setSelected(undefined)}>×</button></div>
          <div className="rc-building-facts"><span><strong>{Math.round(building.height)} m</strong>{building.heightSource === 'measured' ? 'Mapped height' : building.heightSource === 'levels' ? 'From floor count' : 'Estimated height'}</span><span><strong>{Math.round(area).toLocaleString()} m²</strong>Building footprint</span><button type="button" onClick={() => send('focus')}><Icon name="you" size={18} />Center</button></div>
          <p className="rc-caption">Real geometry. All game businesses and people are fictional.</p>
        </></details> : !playing && <>
          <span className="rc-eyebrow">MANHATTAN · NEW YORK CITY</span><h2>Lower East Side</h2>
          <p className="rc-summary">{city.buildings.length.toLocaleString()} buildings. A city worth getting lost in.</p>
          <div className="rc-instruction"><span className="rc-tap-icon"><Icon name="you" size={19} /></span><span>Tap a building to explore<small>Drag to move · pinch to zoom{three ? ' and rotate' : ''}</small></span></div>
        </>}
        {!playing && <button type="button" className="rc-primary" onClick={() => setPlaying(true)}>Play this neighborhood <span>↗</span></button>}
        {unavailable && <p className="rc-fallback" role="status">3D isn’t available in this browser. You can explore the same streets in 2D.</p>}
        </div>
      </section>
        <footer className="rc-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a><a href="/data/lower-east-side.json" download>Map data ↗</a></footer>
    </>}
  </main>;
}
