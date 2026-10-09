import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { RealCity } from '@geo/realCity';
import { signedArea } from '@geo/project';
import { Icon } from '@ui/icons';
import { RealCity2D } from './RealCity2D';
import type { MapCommand } from './view';
import './real-city.css';

const ThreeMap = lazy(() => import('./RealCity3D').then(m => ({ default: m.RealCity3D })));
export function RealCityPreview() {
  const [city, setCity] = useState<RealCity | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [three, setThree] = useState(true), [unavailable, setUnavailable] = useState(false);
  const [selected, setSelected] = useState<string>(), [night, setNight] = useState(true), [labels, setLabels] = useState(true);
  const [layers, setLayers] = useState(false), [query, setQuery] = useState('');
  const [command, setCommand] = useState<MapCommand>({ n: 0, kind: 'home' });
  const send = (kind: MapCommand['kind']) => setCommand(c => ({ n: c.n + 1, kind }));
  useEffect(() => {
    const abort = new AbortController(); setError('');
    void fetch('/data/lower-east-side.json', { signal: abort.signal }).then(async res => {
      if (!res.ok) throw new Error(`Map download failed (${res.status}).`);
      const data = await res.json() as RealCity;
      if (data.version !== 1 || !data.buildings?.length || !data.streets?.length) throw new Error('The city sample is incomplete.');
      if (!abort.signal.aborted) setCity(data);
    }).catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load the map.'); });
    return () => abort.abort();
  }, [attempt]);
  const building = city?.buildings.find(b => b.id === selected);
  const results = useMemo(() => query.trim().length >= 2 ? city?.buildings.filter(b => b.address !== 'Unnumbered building' && b.address.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) ?? [] : [], [query, city]);
  const select = (id: string) => { setSelected(id); setLayers(false); };
  const noThree = () => { setThree(false); setUnavailable(true); };
  const area = building ? Math.abs(signedArea(building.rings[0])) - building.rings.slice(1).reduce((a, r) => a + Math.abs(signedArea(r)), 0) : 0;
  return <main className={`rc-app ${night ? 'rc-night' : 'rc-day'}`}>
    {city && (three ? <Suspense fallback={<div className="rc-loading">Opening the 3D city…</div>}><ThreeMap city={city} selected={selected} night={night} labels={labels} command={command} onSelect={select} onUnavailable={noThree} /></Suspense> : <RealCity2D city={city} selected={selected} labels={labels} command={command} onSelect={select} />)}
    <header className="rc-header">
      <div className="rc-title"><a href="/" aria-label="Back to Rackets"><Icon name="back" size={20} /></a><div><span className="rc-wordmark">RACKETS <em>MAP PREVIEW</em></span><h1>New York</h1></div><span className="rc-status-dot" aria-label="Real geography" /></div>
      <label className="rc-search"><Icon name="search" size={18} /><input aria-label="Find a building by address" placeholder="Find an address" value={query} onChange={e => setQuery(e.target.value)} /><button type="button" aria-label="Clear search" hidden={!query} onClick={() => setQuery('')}>×</button></label>
      {query && <div className="rc-results" role="region" aria-label="Address results">{query.trim().length < 2 ? <p>Type at least two characters.</p> : results.length ? results.map(b => <button type="button" key={b.id} onClick={() => { select(b.id); setQuery(''); send('focus'); }}><Icon name="you" size={18} /><span>{b.address}<small>Lower East Side</small></span><span>↗</span></button>) : <p>No matching address in this neighborhood.</p>}</div>}
    </header>
    {!city && <div className="rc-loading" role="status">{error ? <><b>The map couldn’t load.</b><p>{error}</p><button type="button" onClick={() => setAttempt(a => a + 1)}>Try again</button></> : <><span className="rc-loader" /><b>Mapping the Lower East Side…</b></>}</div>}
    {city && <>
      <div className="rc-controls" aria-label="Map controls">
        <button type="button" aria-label={three ? 'Switch to 2D map' : 'Switch to 3D map'} aria-pressed={three} disabled={unavailable} onClick={() => setThree(t => !t)}><b>{three ? '3D' : '2D'}</b></button>
        <button type="button" aria-label="Map appearance" aria-expanded={layers} onClick={() => setLayers(x => !x)}><Icon name="map" size={22} /></button>
        <button type="button" aria-label="Recenter neighborhood" onClick={() => send('home')}><Icon name="you" size={22} /></button>
        <div className="rc-controls-separator" />
        <button type="button" aria-label="Zoom in" onClick={() => send('in')}><span className="rc-zoom">+</span></button>
        <button type="button" aria-label="Zoom out" onClick={() => send('out')}><span className="rc-zoom">−</span></button>
      </div>
      {layers && <aside className="rc-appearance" aria-label="Map appearance"><div><b>Map appearance</b><button type="button" aria-label="Close appearance" onClick={() => setLayers(false)}>×</button></div><button type="button" aria-pressed={night} onClick={() => setNight(x => !x)}><Icon name="moon" size={18} />Night lighting<span>{night ? 'On' : 'Off'}</span></button><button type="button" aria-pressed={labels} onClick={() => setLabels(x => !x)}>Street names<span>{labels ? 'On' : 'Off'}</span></button></aside>}
      <section className="rc-sheet" aria-label={building ? 'Selected building' : 'Neighborhood'}>
        <div className="rc-sheet-handle" />
        {building ? <>
          <div className="rc-sheet-heading"><div><span className="rc-eyebrow">LOWER EAST SIDE</span><h2>{building.address}</h2></div><button type="button" className="rc-close" aria-label="Close building details" onClick={() => setSelected(undefined)}>×</button></div>
          <div className="rc-building-facts"><span><strong>{Math.round(building.height)} m</strong>{building.heightSource === 'measured' ? 'Mapped height' : building.heightSource === 'levels' ? 'From floor count' : 'Estimated height'}</span><span><strong>{Math.round(area).toLocaleString()} m²</strong>Building footprint</span><button type="button" onClick={() => send('focus')}><Icon name="you" size={18} />Center</button></div>
          <p className="rc-caption">Real building geometry. Gameplay will use fictional businesses and people.</p>
        </> : <>
          <span className="rc-eyebrow">MANHATTAN · NEW YORK CITY</span><h2>Lower East Side</h2>
          <p className="rc-summary">{city.buildings.length.toLocaleString()} buildings. A city worth getting lost in.</p>
          <div className="rc-instruction"><span className="rc-tap-icon"><Icon name="you" size={19} /></span><span>Tap a building to explore<small>Drag to move · pinch to zoom{three ? ' and rotate' : ''}</small></span></div>
        </>}
        {unavailable && <p className="rc-fallback" role="status">3D isn’t available in this browser. You can explore the same streets in 2D.</p>}
        <footer className="rc-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a><a href="/data/lower-east-side.json" download>Map data ↗</a></footer>
      </section>
    </>}
  </main>;
}
