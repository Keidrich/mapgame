import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealCity } from '@geo/realCity';
import { can, dispatch, select, type Action, type World } from '@r/sim/index';
import { geographyId, newRealCityWorld, repairRealCityPlaces } from '@r/sim/realCity';
import { decodeSave, readSave, saveWorld, savePlacementRepair } from './save';

import { Icon } from '@ui/icons';
import type { MapPlayState } from './MapPlaces';
import * as cityPlay from '@r/sim/realCityPlay';
import { BlockOverview } from './BlockOverview';
import { pointInRing } from '@geo/project';
import { CrewPanel, JobsPanel, EmpirePanel, type GameTab } from './ManagementPanels';

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
export default function NeighborhoodPlay({ city, selected, onChoose, onMapState, tab, onTab }: { city: RealCity; selected?: string; onChoose(id: string): void; onMapState(state: MapPlayState): void; tab: GameTab; onTab(tab:GameTab):void }) {
  const [world, setWorld] = useState<World>(), [error, setError] = useState(''), [saved, setSaved] = useState('Opening save…');
  const [browse, setBrowse] = useState(false);
  const [feedback,setFeedback] = useState<ReturnType<typeof cityPlay.actionFeedback>>();
  const decisions = useRef<HTMLDivElement>(null);
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
      onChoose(w.player.blockId);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Your save could not be opened.'); });
    return () => { active = false; };
  }, [city, onChoose]);
  const act = (action: Action) => {
    if (!current.current || !can(current.current, action).ok) return;
    const before = current.current, next = dispatch(before, action); setFeedback(cityPlay.actionFeedback(before,next,action)); current.current = next; boot = Promise.resolve(next); setWorld(next); persist(next);
  };
  const mapPlaces = useMemo(() => world ? cityPlay.mapPlaces(world) : [], [world]);
  useEffect(() => {
    if (world) onMapState({ places: mapPlaces, territories: cityPlay.territories(world), jobs: Object.values(world.jobs).filter(j => ['offer','ready','paused'].includes(j.status)).length, crew: world.player.crewIds.length, player: world.blocks[world.player.blockId].center, day: world.day, phase: world.phase ?? 'day', ap: world.player.ap, apMax: world.player.apMax, cash: world.player.cash, dirty: world.player.dirty, heat: world.player.heat });
  }, [world, mapPlaces, onMapState]);
  useEffect(() => { setBrowse(false); }, [selected,tab]);
  if (error) return <div className="rc-game" role="alert"><b>Couldn’t open the neighborhood</b><p>{error}</p><small>No existing save was replaced. Reload to retry.</small></div>;
  if (!world) return <p role="status">Opening your neighborhood…</p>;
  const selectedBuilding = city.buildings.find(b=>b.id===selected);
  const blockId = world.blocks[selected??'']?.id ?? (selectedBuilding ? Object.values(world.blocks).find(b=>pointInRing(selectedBuilding.center,b.poly))?.id : world.player.blockId);
  const blocks = Object.values(world.blocks).map(b=>select.realCityBlock(world,b.id)!).sort((a,b)=>a.travel-b.travel||a.block.name.localeCompare(b.block.name));
  const button = (action: Action, label: string) => { const q = can(world, action); return <button type="button" key={label} disabled={!q.ok} title={q.why} onClick={() => act(action)}>{label}{!q.ok && <small> · {q.why}</small>}</button>; };
  return <div className="rc-game" aria-label="Playable neighborhood">
    {feedback && <div className="rc-feedback" role="status"><button type="button" aria-label="Dismiss action result" onClick={()=>setFeedback(undefined)}>×</button><strong>Action complete</strong><div>{feedback.changes.map((change,i)=><span key={i}>{change}</span>)}</div><details><summary>What happened</summary><p>{feedback.message}</p></details></div>}
    {world.events.length>0 && <button type="button" className="rc-pending" onClick={()=>decisions.current?.scrollIntoView({block:'start'})}>{world.events.length} decision{world.events.length===1?'':'s'} waiting · Resolve now ↓</button>}
    {tab==='Crew' && <CrewPanel world={world} act={act} onChoose={onChoose}/>}
    {tab==='Jobs' && <JobsPanel world={world} act={act} onChoose={onChoose}/>}
    {tab==='Empire' && <EmpirePanel world={world} act={act} onChoose={onChoose}/>}
    {tab==='City' && <>
      {browse && <button type="button" className="rc-back-row" onClick={()=>setBrowse(false)}><Icon name="back" size={18}/>Back to block</button>}

      {browse ? <section aria-label="Browse blocks" className="rc-block-list">{blocks.map(({block,businesses,here,travel})=><button type="button" className="rc-business-row" key={block.id} onClick={()=>{onChoose(block.id);setBrowse(false);}}><span className="rc-business-icon"><Icon name="map" size={22}/></span><span className="rc-row-copy"><strong>{block.name}</strong><small>{businesses.length} businesses · {here?'You are here':travel?`${travel} h away`:'Free walk'}</small></span><span className="rc-row-chevron">›</span></button>)}</section> : blockId ? <BlockOverview key={blockId} world={world} blockId={blockId} city={city} act={act} onJobs={()=>onTab('Jobs')} onBrowse={()=>setBrowse(true)}/> : <div className="rc-empty"><b>Beyond the playable neighborhood</b><p>Explore the city, or return to a playable block.</p><button type="button" onClick={()=>onChoose(world.player.blockId)}>Back to my block</button></div>}
    </>}
    <div ref={decisions}>{world.events.map(event => <section key={event.id} className="rc-game-event"><b>{event.title}</b><p>{event.text}</p>{event.options.map(o => <div key={o.id}>{button({ type: 'resolve_event', eventId: event.id, optionId: o.id }, o.label)}<small>{o.hint}</small></div>)}</section>)}
    {Object.values(world.jobs).filter(j => j.status === 'paused' && tab!=='Jobs').map(j => <section className="rc-game-event" key={j.id}><b>{j.title}</b>{j.complication?.options.map(o => button({ type: 'answer', jobId: j.id, optionId: o.id }, o.label))}</section>)}
    </div>
    {world.over && <p role="status">{world.over.text}</p>}
    <section className="rc-day-controls" aria-label="Day controls"><header><Icon name="moon" size={18}/><strong>Day {world.day} · {world.phase??'day'}</strong><small>{world.player.ap}/{world.player.apMax} h left</small></header><div className="rc-game-clock">{button({type:'nightfall'},'Nightfall')}{button({type:'end_day'},'End day')}</div></section>
    {repaired && <p className="rc-game-note">Storefront locations corrected. Your progress is kept.</p>}
    <small role="status">{saved}</small>
    <details><summary>Latest activity</summary><ol className="rc-game-log">{world.log.slice(-6).reverse().map((l, i) => <li key={`${world.day}-${i}`}>Day {l.day} · {l.text}</li>)}</ol></details>
  </div>;
}
