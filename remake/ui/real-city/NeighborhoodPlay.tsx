import { useEffect, useRef, useState } from 'react';
import type { RealCity } from '@geo/realCity';
import { can, dispatch, select, type Action, type World } from '@r/sim/index';
import { geographyId, newRealCityWorld } from '@r/sim/realCity';
import { decodeSave, readSave, saveWorld } from './save';

let boot: Promise<World> | undefined;
function load(city: RealCity) {
  return boot ??= readSave().then(value => value === undefined ? newRealCityWorld(city) : decodeSave(value, geographyId(city)));
}
export default function NeighborhoodPlay({ city, selected, onChoose }: { city: RealCity; selected?: string; onChoose(id: string): void }) {
  const [world, setWorld] = useState<World>(), [error, setError] = useState(''), [saved, setSaved] = useState('Opening save…');
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
  if (error) return <div className="rc-game" role="alert"><b>Couldn’t open the neighborhood</b><p>{error}</p><small>No existing save was replaced. Reload to retry.</small></div>;
  if (!world) return <p role="status">Opening your neighborhood…</p>;
  const places = select.businessesAtBuilding(world, selected ?? '');
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const button = (action: Action, label: string) => { const q = can(world, action); return <button type="button" key={label} disabled={!q.ok} title={q.why} onClick={() => act(action)}>{label}{!q.ok && <small> · {q.why}</small>}</button>; };
  return <div className="rc-game" aria-label="Playable neighborhood">
    <div className="rc-game-status"><strong>Day {world.day} · {world.phase ?? 'day'}</strong><span>{world.player.ap}/{world.player.apMax} hours</span><span>{money(world.player.cash)} clean</span><span>{money(world.player.dirty)} dirty</span><span>Heat {Math.round(world.player.heat)}</span></div>
    <small role="status">{saved} · separate campaign</small>
    <p className="rc-game-note">{Object.keys(world.blocks).length} playable blocks · {Object.keys(world.businesses).length} fictional businesses. The rest of the city stays explorable.</p>
    <label htmlFor="rc-place-picker">Find a fictional storefront</label>
    <select id="rc-place-picker" value={places[0]?.id ?? ''} onChange={e => { const b = world.businesses[e.target.value]; if (b?.buildingId) onChoose(b.buildingId); }}>
      <option value="" disabled>Choose a place…</option>
      {Object.values(world.businesses).sort((a, b) => a.name.localeCompare(b.name)).map(b => <option key={b.id} value={b.id}>{b.blockId === world.player.blockId ? 'Here · ' : ''}{b.name}</option>)}
    </select>
    {!places.length && <p className="rc-game-note">This building is scenery in the first playable slice. Choose a storefront above.</p>}
    {places.map(b => <article className="rc-place" key={b.id}>
      <h3>{b.name}</h3><small>Owner: {select.fullName(world.npcs[b.ownerId])} · fictional</small>
      <p className="rc-game-note">{world.blocks[b.blockId].name} · {b.blockId === world.player.blockId ? 'You are here' : 'Visit this block to meet the owner'}</p>
      {b.blockId !== world.player.blockId ? <div className="rc-place-actions">{button({ type: 'travel', blockId: b.blockId }, `Visit · ${select.travelCost(world, b.blockId)} h`)}</div> : <div className="rc-place-actions">{(['chat', 'protect'] as const).map(kind => {
        const action: Action = { type: 'scene', kind, npcId: b.ownerId, businessId: b.id }, q = select.quote(world, kind, b.ownerId, { businessId: b.id }), allowed = can(world, action);
        return <button type="button" key={kind} disabled={!allowed.ok} onClick={() => act(action)}>{q.label}<small>{q.ap} h{q.cash ? ` · ${money(q.cash)}` : ''} · {q.chance}%</small><small>{allowed.ok ? q.gain : allowed.why}</small>{allowed.ok && <small>Risk: {q.risk}</small>}</button>;
      })}</div>}
    </article>)}
    {world.events.map(event => <section key={event.id} className="rc-game-event"><b>{event.title}</b><p>{event.text}</p>{event.options.map(o => <div key={o.id}>{button({ type: 'resolve_event', eventId: event.id, optionId: o.id }, o.label)}<small>{o.hint}</small></div>)}</section>)}
    {Object.values(world.jobs).filter(j => j.status === 'paused').map(j => <section className="rc-game-event" key={j.id}><b>{j.title}</b>{j.complication?.options.map(o => button({ type: 'answer', jobId: j.id, optionId: o.id }, o.label))}</section>)}
    {world.over && <p role="status">{world.over.text}</p>}
    <div className="rc-game-clock">{button({ type: 'nightfall' }, 'Nightfall')}{button({ type: 'end_day' }, 'End day')}</div>
    <p className="rc-game-note">You are at {world.blocks[world.player.blockId].name}. Selecting a building looks at it; Visit moves you there.</p>
    <p className="rc-game-note" role="status">{world.log.at(-1)?.text}</p>
    <details><summary>Latest activity</summary><ol className="rc-game-log">{world.log.slice(-6).reverse().map((l, i) => <li key={`${world.day}-${i}`}>Day {l.day} · {l.text}</li>)}</ol></details>
  </div>;
}
