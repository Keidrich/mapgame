import { useState } from 'react';
import { Act } from './components/Act';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HelpSheet } from './components/HelpSheet';
import { BlockSheet } from './components/BlockSheet';
import { BusinessSheet } from './components/BusinessSheet';
import { CrewTab } from './components/CrewTab';
import { EmpireTab } from './components/EmpireTab';
import { ConfrontModal } from './components/ConfrontModal';
import { EventModal } from './components/EventModal';
import { RecapSheet } from './components/RecapSheet';
import { FactionsTab } from './components/FactionsTab';
import { Hud } from './components/Hud';
import { MapView } from './components/Map';
import { MapLayers } from './components/MapLayers';
import { NpcSheet } from './components/NpcSheet';
import { Onboarding } from './components/Onboarding';
import { OpsTab } from './components/OpsTab';
import { SocialTab } from './components/SocialTab';
import { TabBar } from './components/TabBar';
import { Toasts } from './components/Toasts';
import { SceneSheet } from './components/SceneSheet';
import { select } from '@sim/index';
import { fmtMoney } from './derive';
import { closeSheets, markVictorySeen, rebuildOnRealStreets, resetGame, setTab, useStore, useWorld } from './store';
import { Icon } from '@ui/icons';

export function App() {
  const hasWorld = useStore(s => s.world !== null);
  const booting = useStore(s => s.booting);
  if (booting) return <div className="splash"><div className="spinner" /><b>RACKETS</b></div>;
  if (!hasWorld) return <Onboarding />;
  // last line of defence: a crash anywhere below still leaves a page you can read and reload
  return <ErrorBoundary what="the game"><Game /></ErrorBoundary>;
}

function Game() {
  const w = useWorld();
  const tab = useStore(s => s.tab);
  const sheet = useStore(s => s.sheets[s.sheets.length - 1]);
  const victorySeen = useStore(s => s.victorySeen);
  const help = useStore(s => s.help);
  const recap = useStore(s => s.recap);
  const pending = w.pendingEvents.length;
  return (
    <div className="app">
      <Hud />
      <main className="main">
        <MapView />
        {tab === 'map' && <MapLegend />}
        {tab === 'map' && <MapLayers />}
        {tab !== 'map' && (
          <div className="panel" key={tab}>
            <ErrorBoundary what={`the ${tab} tab`} onReset={() => setTab('map')} resetLabel="Back to the map">
              {tab === 'crew' && <CrewTab />}
              {tab === 'ops' && <OpsTab />}
              {tab === 'social' && <SocialTab />}
              {tab === 'factions' && <FactionsTab />}
              {tab === 'empire' && <EmpireTab />}
            </ErrorBoundary>
          </div>
        )}
        {pending > 0
          ? <button type="button" className="fab alert" onClick={() => { /* modal is already open */ }}><Icon name="warn" size={15} /> Resolve events ({pending})</button>
          : <div className="fab" style={{ padding: 0, background: 'none', boxShadow: 'none' }}><Act action={{ type: 'end_day' }} label="End Day" icon="moon" kind="primary" /></div>}
      </main>
      <TabBar />
      {sheet && (
        <ErrorBoundary what="that panel" onReset={closeSheets} resetLabel="Close it">
          {sheet.kind === 'block' && <BlockSheet blockId={sheet.blockId} />}
          {sheet.kind === 'business' && <BusinessSheet businessId={sheet.businessId} />}
          {sheet.kind === 'npc' && <NpcSheet npcId={sheet.npcId} />}
        </ErrorBoundary>
      )}
      {help && <HelpSheet />}
      <SceneSheet />
      {recap && <RecapSheet />}
      {pending > 0 && !recap && <EventModal />}
      {!recap && <ConfrontModal />}
      {w.victory && !victorySeen && (
        <div className="banner" role="status">
          <b>You own the city.</b>
          <p className="small" style={{ margin: '4px 0 8px' }}>{select.playerBlocks(w).length} blocks are yours. The sandbox keeps going — hold it.</p>
          <button type="button" className="btn" style={{ background: '#000', color: '#fff', borderColor: '#000', minWidth: 160 }} onClick={markVictorySeen}>Keep playing</button>
        </div>
      )}
      {w.mapSource === 'hex' && !w.gameOver && <GridBanner />}
      {w.gameOver && <GameOver />}
      <Toasts />
    </div>
  );
}

/** Colour key for the map. A small pill on phones; tap to expand. */
function MapLegend() {
  const w = useWorld();
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 700);
  const rows = [{ id: 'you', color: '#f2c94c', name: w.player.name }, ...Object.values(w.factions).filter(f => f.alive).map(f => ({ id: f.id, color: f.color, name: f.short }))];
  return (
    <button type="button" className={`map-legend${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Map legend">
      {open
        ? rows.map(r => <div key={r.id} className="name"><span className="sw" style={{ background: r.color }} />{r.name}</div>)
        : <>{rows.map(r => <span key={r.id} className="sw" style={{ background: r.color }} />)}<span>Legend</span></>}
    </button>
  );
}

/** A city on the grid is a fallback, never the goal: offer the real streets until the player has them. */
function GridBanner() {
  const w = useWorld();
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const go = async () => { setErr(null); setStatus('Contacting the map server…'); const e = await rebuildOnRealStreets(setStatus); setStatus(null); if (e) setErr(e); };
  return (
    <div className="banner" role="status" style={{ background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--orange)' }}>
      <b>{w.placeName} is on a grid.</b>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>{status ?? (err ? `Still no luck: ${err}.` : 'The real streets could not be mapped when this game started. Rebuilding uses the actual blocks; it restarts the game at day 1 in the same place.')}</p>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-primary grow" disabled={!!status} onClick={() => void go()}>{status ? 'Mapping…' : 'Rebuild on real streets'}</button>
        <button type="button" className="btn btn-ghost" disabled={!!status} onClick={() => setHidden(true)}>Later</button>
      </div>
    </div>
  );
}

function GameOver() {
  const w = useWorld();
  const g = w.gameOver!;
  return (
    <div className="gameover">
      <h1>It's over.</h1>
      <p className="gold bold">{g.reason}</p>
      <p style={{ maxWidth: 420 }}>{g.text}</p>
      <div className="card mt12" style={{ textAlign: 'left', width: '100%', maxWidth: 420 }}>
        <dl className="kv">
          <dt>Days survived</dt><dd>{w.day}</dd>
          <dt>Cash</dt><dd>{fmtMoney(w.player.cash)} clean · {fmtMoney(w.player.dirty)} dirty</dd>
          <dt>Businesses</dt><dd>{w.player.businessIds.length}</dd>
          <dt>Rackets</dt><dd>{w.player.racketIds.length}</dd>
          <dt>Crew</dt><dd>{w.player.crewIds.length}</dd>
          <dt>Blocks held</dt><dd>{select.playerBlocks(w).length}</dd>
          <dt>Busts</dt><dd>{w.player.busts}</dd>
        </dl>
      </div>
      <button type="button" className="btn btn-primary mt16" style={{ minWidth: 200 }} onClick={resetGame}>New game</button>
    </div>
  );
}
