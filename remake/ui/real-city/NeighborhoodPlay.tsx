import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealCity } from '@geo/realCity';
import { can, dispatch, select, type Action, type World } from '@r/sim/index';
import { geographyId, newRealCityWorld, repairRealCityPlaces } from '@r/sim/realCity';
import { decodeSave, readSave, saveWorld, savePlacementRepair } from './save';

import { Icon } from '@ui/icons';
import { BUSINESSES } from '@r/content/world';
import type { MapPlayState } from './MapPlaces';

let repaired = false;
let boot: Promise<World> | undefined;
function load(city: RealCity) {
  return boot ??= readSave().then(async value => {
    if (value === undefined) return newRealCityWorld(city);
    const original = decodeSave(value, geographyId(city));
    const result = repairRealCityPlaces(original, city);
    if (result.world !== original) { await savePlacementRepair(original, result.world); repaired = result.moved > 0; }
    return result.world;
  }).catch(error => { boot = undefined; throw error; });
}
export default function NeighborhoodPlay({ city, selected, onChoose, onMapState }: { city: RealCity; selected?: string; onChoose(id: string): void; onMapState(state: MapPlayState): void }) {
  const [world, setWorld] = useState<World>(), [error, setError] = useState(''), [saved, setSaved] = useState('Opening save…');
  const [browse, setBrowse] = useState(false), [filter, setFilter] = useState('Nearby');
  const current = useRef<World | undefined>(undefined), revision = useRef(0);
  const persist = (w: World) => {
    const rev = ++revision.current; setSaved('Saving…');
    void saveWorld(w).then(() => { if (revision.current === rev) setSaved('Saved on this device'); }, () => { if (revision.current === rev) setSaved('Save failed — keep this tab open'); });
  };
  useEffect(() => {
    let active = true;
    void load(city).then(w => {
      if (!active) return;
      current.current = w; setWorld(w); persist(w);
      const first = w.businesses[w.blocks[w.player.blockId].businessIds[0]];
      if (first?.buildingId) onChoose(first.buildingId);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Your save could not be opened.'); });
    return () => { active = false; };
  }, [city, onChoose]);
  const act = (action: Action) => {
    if (!current.current || !can(current.current, action).ok) return;
    const next = dispatch(current.current, action); current.current = next; boot = Promise.resolve(next); setWorld(next); persist(next);
  };
  const mapPlaces = useMemo(() => world ? select.realCityPlaces(world) : [], [world]);
  useEffect(() => {
    if (world) onMapState({ places: mapPlaces, player: world.blocks[world.player.blockId].center, day: world.day, phase: world.phase ?? 'day', ap: world.player.ap, apMax: world.player.apMax, cash: world.player.cash, dirty: world.player.dirty, heat: world.player.heat });
  }, [world, mapPlaces, onMapState]);
  useEffect(() => { setBrowse(false); }, [selected]);
  if (error) return <div className="rc-game" role="alert"><b>Couldn’t open the neighborhood</b><p>{error}</p><small>No existing save was replaced. Reload to retry.</small></div>;
  if (!world) return <p role="status">Opening your neighborhood…</p>;
  const places = select.businessesAtBuilding(world, selected ?? '');
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const button = (action: Action, label: string) => { const q = can(world, action); return <button type="button" key={label} disabled={!q.ok} title={q.why} onClick={() => act(action)}>{label}{!q.ok && <small> · {q.why}</small>}</button>; };
  return <div className="rc-game" aria-label="Playable neighborhood">
    <div className="rc-discovery-nav"><button type="button" aria-pressed={!browse} onClick={() => setBrowse(false)}>Place</button><button type="button" aria-pressed={browse} onClick={() => setBrowse(true)}>Nearby places <span>{mapPlaces.length}</span></button></div>
    {(browse || !places.length) && <section className="rc-discovery" aria-label="Find a storefront">
      <h3>{!browse && selected ? city.buildings.find(b => b.id === selected)?.address : 'Make your next move'}</h3><p className="rc-game-note">{!browse && selected ? 'No playable storefront in this building yet. Choose a nearby place.' : 'Tap a place on the map or choose one nearby.'}</p>
      <div className="rc-filters" aria-label="Filter places">{['Nearby', 'Food & drink', 'Shops', 'Your places'].map(f => <button type="button" key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>
      <div className="rc-nearby-cards">{mapPlaces.filter(p => filter === 'Your places' ? p.yours : filter === 'Food & drink' ? ['bar','diner','restaurant','nightclub'].includes(p.type) : filter === 'Shops' ? ['corner_store','pawn','pharmacy','electronics','boutique','jeweller'].includes(p.type) : true).map(p => <button type="button" key={p.id} aria-label={`View ${p.name}`} onClick={() => { onChoose(p.buildingId); setBrowse(false); }}><span className="rc-card-icon"><Icon of="business" id={p.type} size={22} /></span><strong>{p.name}</strong><small>{BUSINESSES[p.type].label} · {p.here ? 'On your block' : `${p.travel} h away`}</small><small>{city.buildings.find(b => b.id === p.buildingId)?.address}</small></button>)}</div>
      {filter === 'Your places' && !mapPlaces.some(p => p.yours) && <p className="rc-game-note">Places you own or protect will appear here. Meet a local owner to get started.</p>}
    </section>}
    {!browse && places.map(b => <article className="rc-place" key={b.id}>
      <span className="rc-place-kind"><Icon of="business" id={b.type} size={20} />{BUSINESSES[b.type].label}{b.blockId === world.player.blockId && <small> · You are here</small>}</span><h3>{b.name}</h3><small>{city.buildings.find(site => site.id === b.buildingId)?.address}</small><p className="rc-owner">Owner: {select.fullName(world.npcs[b.ownerId])}</p>
      {b.blockId !== world.player.blockId ? <div className="rc-place-actions">{button({ type: 'travel', blockId: b.blockId }, `Visit · ${select.travelCost(world, b.blockId)} h`)}</div> : <div className="rc-place-actions">{(['chat', 'protect'] as const).map(kind => {
        const action: Action = { type: 'scene', kind, npcId: b.ownerId, businessId: b.id }, q = select.quote(world, kind, b.ownerId, { businessId: b.id }), allowed = can(world, action);
        return <button type="button" key={kind} disabled={!allowed.ok} onClick={() => act(action)}>{q.label}<small>{q.ap} h{q.cash ? ` · ${money(q.cash)}` : ''} · {q.chance}%</small>{!allowed.ok && <small>{allowed.why}</small>}{allowed.ok && <small>Risk: {q.risk}</small>}</button>;
      })}</div>}
      <details><summary>Action details</summary>{(['chat', 'protect'] as const).map(kind => { const q = select.quote(world, kind, b.ownerId, { businessId: b.id }); return <p className="rc-game-note" key={kind}><b>{q.label}</b> · {q.gain} Risk: {q.risk}</p>; })}</details>
    </article>)}
    {world.events.map(event => <section key={event.id} className="rc-game-event"><b>{event.title}</b><p>{event.text}</p>{event.options.map(o => <div key={o.id}>{button({ type: 'resolve_event', eventId: event.id, optionId: o.id }, o.label)}<small>{o.hint}</small></div>)}</section>)}
    {Object.values(world.jobs).filter(j => j.status === 'paused').map(j => <section className="rc-game-event" key={j.id}><b>{j.title}</b>{j.complication?.options.map(o => button({ type: 'answer', jobId: j.id, optionId: o.id }, o.label))}</section>)}
    {world.over && <p role="status">{world.over.text}</p>}
    <div className="rc-game-clock">{button({ type: 'nightfall' }, 'Nightfall')}{button({ type: 'end_day' }, 'End day')}</div>
    <p className="rc-game-note rc-location">You are at {world.blocks[world.player.blockId].name}. Selecting a building looks at it; Visit moves you there.</p>
    <p className="rc-game-note" role="status">{world.log.at(-1)?.text}</p>
    {repaired && <p className="rc-game-note">Storefront locations corrected. Your progress is kept.</p>}
    <small role="status">{saved}</small>
    <details><summary>Latest activity</summary><ol className="rc-game-log">{world.log.slice(-6).reverse().map((l, i) => <li key={`${world.day}-${i}`}>Day {l.day} · {l.text}</li>)}</ol></details>
  </div>;
}
