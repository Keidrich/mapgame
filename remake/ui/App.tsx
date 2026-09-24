/**
 * RACKETS: Remake — the whole app. Mounted by the original's `App` when the Remake tab is picked,
 * and loaded lazily, so neither game carries the other's code until it is wanted.
 */
import './remake.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { APPROACH_INFO } from '@r/content/world';
import { select, PLAYER } from '@r/sim/index';
import { Icon } from '@ui/icons';
import { setMode } from '@ui/mode';
import { act, boot, closeRecap, closeSheets, dismissToast, focusBlock, leaveGame, openSheet, quitGame, setLayer, setTab, useUi, useWorld, type Layer, type Tab } from './store';
import { CityMap } from './components/CityMap';
import { Face, NpcFace } from './components/Faces';
import { JobSheet, FactionSheet } from './components/JobFaction';
import { PersonSheet } from './components/PersonSheet';
import { BlockSheet, BusinessSheet } from './components/PlaceSheets';
import { Start } from './components/Start';
import { RegionSheet } from './components/Region';
import { CrewTab, EmpireTab, JobsTab, PeopleTab, RivalsTab } from './components/Tabs';
import { Do, Meter, Sheet, fmt } from './components/kit';
import { GBag, GBolt, GCash, GChevron, GFlame, GLayers, GStar, GTrophy } from './components/GameIcons';

const FONTS = 'https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@500;600;700;800;900&display=swap';
/** The two faces, linked once; if they cannot load the game falls back to rounded system fonts. */
function useFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTS}"]`)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONTS;
    document.head.appendChild(l);
  }, []);
}

export function RemakeApp() {
  useFonts();
  useEffect(() => { void boot(); }, []);
  const booting = useUi(s => s.booting);
  const has = useUi(s => !!s.world);
  if (booting) return <div className="r-root"><div className="r-splash"><b>RACKETS</b><span>Loading your city…</span></div></div>;
  return <div className="r-root">{has ? <Game /> : <Start />}</div>;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map', label: 'City', icon: 'map' },
  { id: 'people', label: 'People', icon: 'social' },
  { id: 'crew', label: 'Crew', icon: 'crew' },
  { id: 'jobs', label: 'Jobs', icon: 'ops' },
  { id: 'empire', label: 'Empire', icon: 'empire' },
  { id: 'rivals', label: 'Rivals', icon: 'factions' },
];

function Game() {
  const w = useWorld();
  const tab = useUi(s => s.tab);
  const sheet = useUi(s => s.sheets[s.sheets.length - 1]);
  const recap = useUi(s => s.recap);
  const paused = select.pendingJob(w);
  const ready = Object.values(w.jobs).filter(j => j.status === 'ready').length;
  const offers = Object.values(w.jobs).filter(j => j.status === 'offer').length;
  return (
    <div className="r-game">
      <Hud />
      <main className="r-main">
        {tab === 'map' ? <MapScreen /> : (
          <div className="r-panel">
            {tab === 'people' && <PeopleTab />}
            {tab === 'crew' && <CrewTab />}
            {tab === 'jobs' && <JobsTab />}
            {tab === 'empire' && <EmpireTab />}
            {tab === 'rivals' && <RivalsTab />}
          </div>
        )}
        {/* the end of the day: a big moon, glowing once the day's energy is spent */}
        <div className={`g-endday${w.player.ap === 0 ? ' ready' : ''}`}>
          {w.events.length ? <span className="g-decide">{w.events.length} to decide</span> : <Do action={{ type: 'end_day' }} label="End day" icon="moon" kind="primary" />}
        </div>
      </main>
      <nav className="r-tabbar" aria-label="Sections">
        {TABS.map(t => {
          const badge = t.id === 'jobs' ? ready || offers : t.id === 'crew' ? Object.values(w.hostages).filter(h => h.holder !== PLAYER).length : 0;
          return (
            <button type="button" key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <span className="g-tile"><Icon name={t.icon} size={22} strokeWidth={tab === t.id ? 2.2 : 1.7} /></span>
              <span>{t.label}</span>
              {badge ? <i className={t.id === 'jobs' && ready ? 'hot' : t.id === 'crew' ? 'hot' : ''}>{badge}</i> : null}
            </button>
          );
        })}
      </nav>
      {sheet && (
        <>
          {sheet.kind === 'block' && <BlockSheet id={sheet.id} />}
          {sheet.kind === 'business' && <BusinessSheet id={sheet.id} />}
          {sheet.kind === 'person' && <PersonSheet id={sheet.id} />}
          {sheet.kind === 'job' && <JobSheet id={sheet.id} />}
          {sheet.kind === 'faction' && <FactionSheet id={sheet.id} />}
          {sheet.kind === 'menu' && <MenuSheet />}
          {sheet.kind === 'help' && <HelpSheet />}
          {sheet.kind === 'region' && <RegionSheet />}
        </>
      )}
      {recap && <RecapCard />}
      {!recap && paused?.complication && <ComplicationCard />}
      {!recap && !paused && w.events.length > 0 && <EventCard />}
      {w.won && !w.wonSeen && !recap && <WinCard />}
      {w.over && <OverCard />}
      <Toasts />
    </div>
  );
}

/**
 * The HUD, the way mobile games draw it: you on the left with your rank as a level bar, the day on
 * the right, and four pills — clean money, dirty money, the day's energy, heat. Money that changes
 * floats a +/− number off its pill, so a night's takings are something you see land.
 */
function Hud() {
  const w = useWorld();
  const p = w.player;
  const rank = select.rankOf(w);
  const next = select.nextRank(w);
  const n = select.notoriety(w);
  const pct = next ? Math.max(0, Math.min(100, ((n - rank.at) / (next.at - rank.at)) * 100)) : 100;
  const level = select.rankIndex(w) + 1;
  return (
    <header className="g-hud">
      <div className="g-hud-top">
        <button type="button" className="g-avatar" onClick={() => openSheet({ kind: 'menu' })} aria-label="Menu">
          <Face seed={p.face} pronoun="they" age={34} mood="neutral" size={44} tint="#3b2f7a" />
          <span className="g-lvl">{level}</span>
        </button>
        <div className="g-who">
          <b>{p.nick ? `"${p.nick}"` : p.name}</b>
          <div className="g-xp" title={next ? `${next.at - n} more fear and respect to ${next.label}` : 'The top'}><i style={{ width: `${pct}%` }} /><span>{rank.label}{next ? ` · ${n}/${next.at}` : ''}</span></div>
        </div>
        <button type="button" className="g-day" onClick={() => openSheet({ kind: 'menu' })} aria-label={`Day ${w.day}`}><span>DAY</span><b>{w.day}</b></button>
      </div>
      <div className="g-res">
        <Pill kind="clean" icon={<GCash size={26} />} value={p.cash} title="Clean money" />
        <Pill kind="dirty" icon={<GBag size={26} />} value={p.dirty} title="Dirty money" />
        <div className={`g-pill energy${p.ap === 0 ? ' empty' : ''}`} title="Action points left today">
          <GBolt size={26} /><b>{p.ap}/{p.apMax}</b>
        </div>
        <div className={`g-pill heat${p.heat >= 60 ? ' hot' : ''}`} title={`Heat ${Math.round(p.heat)}`}>
          <GFlame size={26} hot={p.heat >= 60} /><b>{Math.round(p.heat)}</b>
          <span className="g-heatbar"><i style={{ width: `${p.heat}%` }} /></span>
        </div>
      </div>
    </header>
  );
}

/** A currency pill that floats the change off it when the number moves. */
function Pill({ kind, icon, value, title }: { kind: string; icon: ReactNode; value: number; title: string }) {
  const prev = useRef(value);
  const [deltas, setDeltas] = useState<{ id: number; n: number }[]>([]);
  useEffect(() => {
    const d = value - prev.current; prev.current = value;
    if (!d) return;
    const id = Date.now() + Math.random();
    setDeltas(x => [...x.slice(-2), { id, n: d }]);
    const t = setTimeout(() => setDeltas(x => x.filter(y => y.id !== id)), 1500);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className={`g-pill ${kind}`} title={title}>
      {icon}<b>{fmt(value)}</b>
      {deltas.map(d => <span key={d.id} className={`g-delta ${d.n > 0 ? 'up' : 'down'}`}>{d.n > 0 ? '+' : '−'}{fmt(Math.abs(d.n))}</span>)}
    </div>
  );
}

const LAYERS: { id: Layer; label: string; short: string }[] = [{ id: 'control', label: 'Who holds it', short: 'Owners' }, { id: 'heat', label: 'Your heat', short: 'Heat' }, { id: 'wealth', label: 'Money', short: 'Money' }, { id: 'police', label: 'Police', short: 'Police' }];

function MapScreen() {
  const w = useWorld();
  const layer = useUi(s => s.layer);
  const focus = useUi(s => s.focus);
  const [sel, setSel] = useState<string | undefined>();
  const here = w.blocks[w.player.blockId];
  const headline = w.news[w.news.length - 1];
  const factions = Object.values(w.factions).filter(f => f.alive);
  const cityId = select.currentCity(w);
  // the map draws the city you are in; the others are a train ride away (the region sheet)
  const view = useMemo(() => select.cityView(w, cityId), [w, cityId]);
  return (
    <div className="r-mapwrap">
      <CityMap w={view} layer={layer} focus={focus} selected={sel} onBlock={id => { setSel(id); openSheet({ kind: 'block', id }); }} />
      {headline && <div className="r-paper"><span>{select.cityName(w, cityId).toUpperCase()} COURIER · DAY {headline.day}</span><b>{headline.text}</b></div>}
      <LeadStrip />
      {/* round tools down the right edge: the overlay cycles on a tap, like a game's view toggle */}
      <div className="r-map-tools">
        <button type="button" className="g-fab" onClick={() => setLayer(LAYERS[(LAYERS.findIndex(l => l.id === layer) + 1) % LAYERS.length].id)} aria-label={`Map overlay: ${LAYERS.find(l => l.id === layer)?.label}. Tap for the next.`}><GLayers size={24} /><small>{LAYERS.find(l => l.id === layer)?.short}</small></button>
        <button type="button" className="g-fab" onClick={() => focusBlock(w.player.blockId)} aria-label="Where am I"><Icon name="you" size={24} strokeWidth={2} /><small>Me</small></button>
        <button type="button" className="g-fab gold" onClick={() => openSheet({ kind: 'region' })} aria-label="The region"><Icon name="map" size={24} strokeWidth={2.2} /><small>Region</small></button>
      </div>
      <button type="button" className="r-here-card" onClick={() => openSheet({ kind: 'block', id: here.id })}>
        <span className="r-kicker">You are on{Object.keys(w.cities ?? {}).length ? ` · ${select.cityName(w, cityId)}` : ''}</span>
        <b>{here.name}</b>
        <span className="r-note">{w.districts[here.districtId].name} · {select.businessesIn(w, here.id).length} places · {select.holderName(w, here.id)}</span>
      </button>
      {layer === 'control' && <div className="r-legend">
        <span><i style={{ background: '#f0a841' }} />You</span>
        {factions.map(f => <span key={f.id}><i style={{ background: f.color }} />{f.short}</span>)}
      </div>}
    </div>
  );
}

/**
 * The next thing worth doing, pointing at a real person or place. One line on the map, and a tap
 * away from the whole list. Read off the world every render (`select.leads`), so it cannot drift.
 */
function LeadStrip() {
  const w = useWorld();
  const [open, setOpen] = useState(false);
  const all = select.leads(w);
  const todo = all.filter(l => !l.done);
  if (!todo.length) return null;
  const go = (l: select.Lead) => {
    setOpen(false);
    if (l.npcId) openSheet({ kind: 'person', id: l.npcId });
    else if (l.businessId) openSheet({ kind: 'business', id: l.businessId });
    else if (l.tab) setTab(l.tab);
    else if (l.blockId) openSheet({ kind: 'block', id: l.blockId });
  };
  return (
    <div className={`r-leads${open ? ' open' : ''}`}>
      <QuestRing done={all.length - todo.length} of={all.length} />
      <button type="button" className="r-lead-top" onClick={() => go(todo[0])}>
        <span className="r-kicker">Quest</span>
        <b>{todo[0].text}</b>
      </button>
      <button type="button" className="r-lead-more" aria-expanded={open} aria-label="All quests" onClick={() => setOpen(o => !o)}><Icon name={open ? 'caret_up' : 'down'} size={20} strokeWidth={2.4} /></button>
      {open && <ol className="r-lead-list">{all.map(l => <li key={l.id} className={l.done ? 'done' : ''}><button type="button" disabled={l.done} onClick={() => go(l)}><GStar size={22} dim={!l.done} /><b>{l.text}</b><span>{l.why}</span></button></li>)}</ol>}
    </div>
  );
}

/** How far along the quest line you are, as a ring. */
function QuestRing({ done, of }: { done: number; of: number }) {
  const r = 18, c = 2 * Math.PI * r;
  return (
    <div className="g-quest-ring" aria-label={`${done} of ${of} done`}>
      <svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r={r} fill="#110f2a" stroke="#2c2862" strokeWidth="5" /><circle cx="22" cy="22" r={r} fill="none" stroke="#ffcc33" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(done / Math.max(1, of)) * c} ${c}`} /></svg>
      <b>{done}/{of}</b>
    </div>
  );
}

function EventCard() {
  const w = useWorld();
  const e = w.events[0];
  const n = e.npcId ? w.npcs[e.npcId] : undefined;
  const f = e.factionId ? w.factions[e.factionId] : undefined;
  return (
    <div className="r-modal" role="dialog" aria-modal="true" aria-labelledby="r-ev-title">
      <div className="r-card">
        <div className="r-card-head">{n ? <NpcFace n={n} size={52} tint={f ? `${f.color}55` : undefined} /> : <span className="r-bizicon big"><Icon name="note" size={28} /></span>}<div><div className="r-kicker">Day {w.day}{w.events.length > 1 ? ` · 1 of ${w.events.length}` : ''}</div><h2 id="r-ev-title">{e.title}</h2></div></div>
        <p className="r-card-text">{e.text}</p>
        <div className="r-card-options">
          {e.options.map(o => (
            <button type="button" key={o.id} className="r-option" disabled={!!o.disabled} onClick={() => act({ type: 'resolve_event', eventId: e.id, optionId: o.id })}>
              <b>{o.label}</b><span>{o.disabled ?? o.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ComplicationCard() {
  const w = useWorld();
  const j = select.pendingJob(w)!;
  const c = j.complication!;
  return (
    <div className="r-modal" role="dialog" aria-modal="true" aria-labelledby="r-cx-title">
      <div className="r-card danger">
        <div className="r-kicker">{j.title} · going in {APPROACH_INFO[j.approach ?? 'quiet'].label.toLowerCase()}</div>
        <h2 id="r-cx-title">{c.title}</h2>
        <p className="r-card-text">{c.text}</p>
        <div className="r-card-options">
          {c.options.map(o => {
            const chance = select.complicationOdds(w, j, o.id);
            return (
              <button type="button" key={o.id} className="r-option" onClick={() => act({ type: 'answer', jobId: j.id, optionId: o.id })}>
                <b>{o.label} <span className={`r-odds ${chance >= 65 ? 'good' : chance >= 40 ? 'mid' : 'bad'}`}>{chance}%</span></b>
                <span>{o.skill} check · take ×{o.payout}{o.heat ? ` · heat +${o.heat}` : ''}{o.safe ? ' · the safe choice' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The end of the day as a reward screen: stars for how the day went, the takings as tiles that pop
 * in one by one, the day's headline, and everything that happened in a list. Three stars is a day
 * that made money and cooled off; one is a day that cost you.
 */
function RecapCard() {
  const w = useWorld();
  const r = useUi(s => s.recap)!;
  const net = r.clean + r.dirty - r.spent;
  const stars = net > 0 ? (r.heat < 40 ? 3 : 2) : 1;
  return (
    <div className="r-modal" role="dialog" aria-modal="true" aria-labelledby="r-recap-title">
      <div className="r-card paper">
        <div className="g-burst" />
        <div className="r-paper-mast">Day {r.day} complete{r.away ? ` · ${r.away} day${r.away > 1 ? 's' : ''} away` : ''}</div>
        <div className="g-stars">{[0, 1, 2].map(i => <GStar key={i} size={i === 1 ? 54 : 42} dim={i >= stars} />)}</div>
        <h2 id="r-recap-title" className="r-headline">{r.headline ?? `${w.city.name} sleeps`}</h2>
        <div className="g-reward">
          <div><GCash size={30} /><b className="green">{fmt(r.clean)}</b><span>Clean</span></div>
          <div><GBag size={30} /><b className="orange">{fmt(r.dirty)}</b><span>Dirty</span></div>
          <div><Icon name="cash" size={28} /><b>−{fmt(r.spent)}</b><span>Paid out</span></div>
          <div><GFlame size={30} hot={r.heat >= 60} /><b>{r.heat}</b><span>Heat</span></div>
          {r.washed > 0 && <div><Icon name="laundering" size={28} /><b>{fmt(r.washed)}</b><span>Washed</span></div>}
        </div>
        {r.lines.length > 0 && <ul className="r-recap-lines">{r.lines.map((l, i) => <li key={i} className={l.tone}>{l.text}</li>)}</ul>}
        <button type="button" className="r-btn primary block big" onClick={closeRecap} autoFocus>{w.events.length ? `Decide (${w.events.length})` : 'Next day'} <GChevron size={20} /></button>
      </div>
    </div>
  );
}

function WinCard() {
  const w = useWorld();
  return (
    <div className="r-modal" role="dialog" aria-modal="true"><div className="r-card paper">
      <div className="g-burst" />
      <div className="r-paper-mast">Victory</div>
      <div className="g-stars"><GTrophy size={84} /></div>
      <h2 className="r-headline">THE CITY HAS A NEW OWNER</h2>
      <p className="r-card-text">Half of {w.city.name} answers to you{Object.values(w.factions).every(f => !f.alive) ? ', and every outfit that stood against you is gone' : ''}. The game goes on — hold it.</p>
      <Do action={{ type: 'seen_win' }} label="Keep going" kind="primary" block />
    </div></div>
  );
}

function OverCard() {
  const w = useWorld();
  const o = w.over!;
  const title = { kingpin: 'Kingpin', straight: 'Out clean', dead: 'Dead', convicted: 'Convicted', broke: 'Finished' }[o.ending];
  return (
    <div className="r-modal" role="dialog" aria-modal="true"><div className="r-card paper">
      {(o.ending === 'kingpin' || o.ending === 'straight') && <div className="g-burst" />}
      <div className="r-paper-mast">{o.ending === 'kingpin' || o.ending === 'straight' ? 'You made it' : 'Game over'} · day {o.day}</div>
      <div className="g-stars">{o.ending === 'kingpin' || o.ending === 'straight' ? <GTrophy size={76} /> : [0, 1, 2].map(i => <GStar key={i} size={i === 1 ? 50 : 40} dim />)}</div>
      <h2 className="r-headline">{title.toUpperCase()}</h2>
      <p className="r-card-text">{o.text}</p>
      <div className="r-stats">
        <div><span>Days</span><b>{o.day}</b></div>
        <div><span>Worth</span><b>{fmt(select.netWorth(w))}</b></div>
        <div><span>Blocks</span><b>{select.playerBlocks(w).length}</b></div>
        <div><span>Rank</span><b>{select.rankOf(w).label}</b></div>
      </div>
      <button type="button" className="r-btn primary block" onClick={quitGame}>A new city</button>
    </div></div>
  );
}

function Toasts() {
  const toasts = useUi(s => s.toasts);
  return <div className="r-toasts" aria-live="polite">{toasts.map(t => <button type="button" key={t.id} className={`r-toast ${t.tone}`} onClick={() => dismissToast(t.id)}>{t.text}</button>)}</div>;
}

function MenuSheet() {
  const w = useWorld();
  const [sure, setSure] = useState(false);
  return (
    <Sheet title={w.city.name} kicker={`Seed ${w.seed} · day ${w.day}`}>
      <p className="r-note">“{w.city.motto}”</p>
      <div className="r-rel">
        <Meter value={select.controlShare(w) * 100} label="Your share of the city" right={`${(select.controlShare(w) * 100).toFixed(1)}% of ${Object.keys(w.blocks).length} blocks — half wins it`} />
      </div>
      <button type="button" className="r-btn block" onClick={() => openSheet({ kind: 'help' })}><Icon name="help" size={16} /> How to play</button>
      <button type="button" className="r-btn block" onClick={() => { closeSheets(); setMode('original'); }}><Icon name="map" size={16} /> Back to the original RACKETS</button>
      <button type="button" className="r-btn block" onClick={leaveGame}><Icon name="city_hall" size={16} /> Your cities — this one stays saved</button>
      <button type="button" className={`r-btn block ${sure ? 'danger' : 'ghost'}`} onClick={() => (sure ? quitGame() : setSure(true))}>{sure ? 'Tap again: this city is gone for good' : 'Delete this city'}</button>
      <p className="r-note">The Remake saves on its own, separately from the original game. You can keep three cities. While the app is closed a day passes every six hours, up to three, and the careful choice is made for you.</p>
      {void PLAYER}
    </Sheet>
  );
}

function HelpSheet() {
  return (
    <Sheet title="How to play" kicker="RACKETS: Remake">
      <ol className="r-help">
        <li><b>The city is yours to take.</b> It was generated for you: every block, business and person. Tap any block on the map to see who holds it and what is there.</li>
        <li><b>Meet people.</b> Tap a place, then its owner. <i>Talk</i> builds trust and sizes them up; <i>Lean on them</i> builds fear. Every button shows its odds, and “why these odds” shows the arithmetic.</li>
        <li><b>Protection</b> is the first money. A frightened or friendly owner pays you a daily cut. Keep it fair (15% or less) or they resent it.</li>
        <li><b>Rackets</b> run out of places you protect or own, and earn every night. Put crew on them as runners — a racket nobody minds earns 60%.</li>
        <li><b>Dirty and clean.</b> Most money is dirty. Buying businesses, officials and a lawyer need clean. The fixer washes by hand; a laundering racket washes every night while it is switched on.</li>
        <li><b>Crew</b> come from the regulars. Build trust, then recruit. Beds come from safehouses. Crew level up; a good one can run a whole district.</li>
        <li><b>Jobs</b> arrive from people who trust you, from grudges you know about, and from wars. You can case any place yourself. Every job shows its odds per approach; big ones stop halfway and ask.</li>
        <li><b>Ground.</b> Influence builds where you run things, faster the more you stack on one block, and a block you hold deeply bleeds into its neighbours — that is how you take parks and empty streets. Half the city wins it.</li>
        <li><b>Heat</b> cools by itself; past 60 the police raid, at 100 they come for you. <b>Case files</b> do not cool while witnesses talk — deal with the witnesses, the DA and the judge.</li>
        <li><b>Rivals</b> play the same game. Beef costs you rackets and places; war costs lives, maybe yours. Tribute and sit-downs buy peace.</li>
      </ol>
    </Sheet>
  );
}
