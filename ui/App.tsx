import { Act } from './components/Act';
import { BlockSheet } from './components/BlockSheet';
import { BusinessSheet } from './components/BusinessSheet';
import { CrewTab } from './components/CrewTab';
import { EmpireTab } from './components/EmpireTab';
import { EventModal } from './components/EventModal';
import { FactionsTab } from './components/FactionsTab';
import { Hud } from './components/Hud';
import { MapView } from './components/Map';
import { NpcSheet } from './components/NpcSheet';
import { Onboarding } from './components/Onboarding';
import { OpsTab } from './components/OpsTab';
import { TabBar } from './components/TabBar';
import { Toasts } from './components/Toasts';
import { select } from '@sim/index';
import { fmtMoney } from './derive';
import { markVictorySeen, resetGame, useStore, useWorld } from './store';

export function App() {
  const hasWorld = useStore(s => s.world !== null);
  const booting = useStore(s => s.booting);
  if (booting) return <div className="splash"><div className="spinner" /><b>RACKETS</b></div>;
  if (!hasWorld) return <Onboarding />;
  return <Game />;
}

function Game() {
  const w = useWorld();
  const tab = useStore(s => s.tab);
  const sheet = useStore(s => s.sheets[s.sheets.length - 1]);
  const victorySeen = useStore(s => s.victorySeen);
  const pending = w.pendingEvents.length;
  return (
    <div className="app">
      <Hud />
      <main className="main">
        <MapView />
        {tab === 'map' && <MapLegend />}
        {tab !== 'map' && (
          <div className="panel" key={tab}>
            {tab === 'crew' && <CrewTab />}
            {tab === 'ops' && <OpsTab />}
            {tab === 'factions' && <FactionsTab />}
            {tab === 'empire' && <EmpireTab />}
          </div>
        )}
        {pending > 0
          ? <button type="button" className="fab alert" onClick={() => { /* modal is already open */ }}>⚠️ Resolve events ({pending})</button>
          : <div className="fab" style={{ padding: 0, background: 'none', boxShadow: 'none' }}><Act action={{ type: 'end_day' }} label="End Day" icon="🌙" kind="primary" /></div>}
      </main>
      <TabBar />
      {sheet?.kind === 'block' && <BlockSheet blockId={sheet.blockId} />}
      {sheet?.kind === 'business' && <BusinessSheet businessId={sheet.businessId} />}
      {sheet?.kind === 'npc' && <NpcSheet npcId={sheet.npcId} />}
      {pending > 0 && <EventModal />}
      {w.victory && !victorySeen && (
        <div className="banner" role="status">
          <b>🏆 You own the city.</b>
          <p className="small" style={{ margin: '4px 0 8px' }}>{select.playerBlocks(w).length} blocks are yours. The sandbox keeps going — hold it.</p>
          <button type="button" className="btn btn-sm" style={{ background: '#000', color: '#fff', borderColor: '#000' }} onClick={markVictorySeen}>Keep playing</button>
        </div>
      )}
      {w.gameOver && <GameOver />}
      <Toasts />
    </div>
  );
}

function MapLegend() {
  const w = useWorld();
  return (
    <div className="map-legend" aria-hidden="true">
      <div><span className="sw" style={{ background: '#f2c94c' }} />{w.player.name}</div>
      {Object.values(w.factions).filter(f => f.alive).map(f => <div key={f.id}><span className="sw" style={{ background: f.color }} />{f.short}</div>)}
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
