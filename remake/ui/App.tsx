/**
 * RACKETS: Remake — the whole app. Mounted by the original's `App` when the Remake tab is picked,
 * and loaded lazily, so neither game carries the other's code until it is wanted.
 */
import './remake.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { APPROACH_INFO } from '@r/content/world';
import { select, PLAYER } from '@r/sim/index';
import { Icon } from '@ui/icons';
import { setMode } from '@ui/mode';
import { act, boot, closeRecap, closeSheets, dismissToast, focusBlock, leaveGame, openSheet, quitGame, setLayer, setTab, useUi, useWorld, viewCity, type Layer, type Tab } from './store';
import { CityMap } from './components/CityMap';
import { NpcFace } from './components/Faces';
import { mute } from './components/tone';
import { JobSheet, FactionSheet } from './components/JobFaction';
import { PersonSheet } from './components/PersonSheet';
import { BlockSheet, BusinessSheet } from './components/PlaceSheets';
import { Start } from './components/Start';
import { RegionSheet } from './components/Region';
import { CrewTab, EmpireTab, JobsTab, PeopleTab, RivalsTab } from './components/Tabs';
import { Do, Meter, Section, Sheet, fmt } from './components/kit';

const FONTS = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&display=swap';
/** The display and press faces, linked once; body text is the system face. Offline before the
 *  first load, the game falls back to condensed and serif system faces and still reads. */
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
      </main>
      <Hud />
      {/* ending the day: one capsule, always in the same place, lit once the hours are spent */}
      <div className={`r-endday${w.player.ap === 0 ? ' ready' : ''}`}>
        {w.events.length ? <span className="r-decide">{w.events.length} to decide</span> : <Do action={{ type: 'end_day' }} label="End the day" icon="moon" />}
      </div>
      <nav className="r-tabbar" aria-label="Sections">
        {TABS.map(t => {
          const badge = t.id === 'jobs' ? ready || offers : t.id === 'crew' ? Object.values(w.hostages).filter(h => h.holder !== PLAYER).length : 0;
          return (
            <button type="button" key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={24} strokeWidth={tab === t.id ? 2 : 1.6} />
              <span>{t.label}</span>
              {badge ? <i>{badge}</i> : null}
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
 * The ledger bar. The day, set large, is the page number; beside it the city and your rank with
 * how far to the next. Under that, the four figures the whole game turns on, as a ledger line:
 * clean, dirty, the hours left in the day, heat. A figure that moves shows by how much, briefly.
 */
function Hud() {
  const w = useWorld();
  const p = w.player;
  const rank = select.rankOf(w);
  const next = select.nextRank(w);
  const n = select.notoriety(w);
  const pct = next ? Math.max(0, Math.min(100, ((n - rank.at) / (next.at - rank.at)) * 100)) : 100;
  const hot = p.heat >= 60;
  return (
    <header className="r-top">
      <div className="r-top-row">
        <button type="button" className="r-dayno" onClick={() => openSheet({ kind: 'menu' })} aria-label={`Day ${w.day}. Menu`}><span>Day</span><b>{w.day}</b></button>
        <button type="button" className="r-who" onClick={() => setTab('empire')} aria-label="Your empire">
          <b>{p.nick ? `"${p.nick}"` : p.name} · {select.cityName(w, select.currentCity(w))}</b>
          <span>{rank.label}{next ? <><i title={`${next.at - n} more fear and respect to ${next.label}`}><u style={{ width: `${pct}%` }} /></i>{next.label}</> : null}</span>
        </button>
        <button type="button" className="r-iconbtn" onClick={() => openSheet({ kind: 'menu' })} aria-label="Menu"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="3.5" cy="9" r="1.6" fill="currentColor" /><circle cx="9" cy="9" r="1.6" fill="currentColor" /><circle cx="14.5" cy="9" r="1.6" fill="currentColor" /></svg></button>
      </div>
      <dl className="r-ledger">
        <Figure kind="clean" label="Clean" value={p.cash} />
        <Figure kind="dirty" label="Dirty" value={p.dirty} />
        <div className={`hours${p.ap === 0 ? ' out' : ''}`} title={`${p.ap} of ${p.apMax} hours left today`}>
          <dt>Hours</dt>
          <dd aria-label={`${p.ap} of ${p.apMax}`}>{p.apMax <= 10 ? Array.from({ length: p.apMax }, (_, i) => <i key={i} className={i < p.ap ? 'on' : ''} />) : `${p.ap}/${p.apMax}`}</dd>
        </div>
        <div className={`heat${hot ? ' hot' : ''}`} title={`Heat ${Math.round(p.heat)} of 100`}>
          <dt>Heat</dt><dd>{Math.round(p.heat)}</dd>
          <u><s style={{ width: `${Math.min(100, p.heat)}%` }} /></u>
        </div>
      </dl>
    </header>
  );
}

/** One money figure on the ledger line; when it changes, the change shows beside it for a moment. */
function Figure({ kind, label, value }: { kind: string; label: string; value: number }) {
  const prev = useRef(value);
  const [deltas, setDeltas] = useState<{ id: number; n: number }[]>([]);
  useEffect(() => {
    const d = value - prev.current; prev.current = value;
    if (!d) return;
    const id = Date.now() + Math.random();
    setDeltas(x => [...x.slice(-1), { id, n: d }]);
    const t = setTimeout(() => setDeltas(x => x.filter(y => y.id !== id)), 1600);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className={kind}>
      <dt>{label}</dt><dd>{fmt(value)}</dd>
      {deltas.map(d => <span key={d.id} className={`r-delta ${d.n > 0 ? 'up' : 'down'}`}>{d.n > 0 ? '+' : '−'}{fmt(Math.abs(d.n))}</span>)}
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
  // the map draws the city you are in — or one you are only looking at, from the region sheet
  const looking = useUi(s => s.viewCity);
  const shown = looking && looking !== cityId && w.region?.cities.some(c => c.id === looking && c.founded) ? looking : cityId;
  const view = useMemo(() => select.cityView(w, shown), [w, shown]);
  const lay = LAYERS.find(l => l.id === layer) ?? LAYERS[0];
  return (
    <div className="r-mapwrap">
      <CityMap w={view} layer={layer} focus={focus} selected={sel} onBlock={id => { setSel(id); openSheet({ kind: 'block', id }); }} />
      <div className="r-map-top">
        {shown !== cityId && <button type="button" className="r-viewing" onClick={() => viewCity(undefined, w.player.blockId)}><span>Looking at {select.cityName(w, shown)}</span><b>Back to {select.cityName(w, cityId)}</b></button>}
        {headline && shown === cityId && <div className="r-paper"><span>Courier</span><b>{headline.text}</b></div>}
        {shown === cityId && <LeadStrip />}
      </div>
      <div className="r-map-tools">
        <button type="button" className="r-tool on" onClick={() => setLayer(LAYERS[(LAYERS.findIndex(l => l.id === layer) + 1) % LAYERS.length].id)} aria-label={`Map shows: ${lay.label}. Tap for the next.`}><Icon name="territory" size={20} strokeWidth={1.8} /><small>{lay.short}</small></button>
        <button type="button" className="r-tool" onClick={() => focusBlock(w.player.blockId)} aria-label="Where am I"><Icon name="you" size={20} strokeWidth={1.8} /><small>Me</small></button>
        <button type="button" className="r-tool" onClick={() => openSheet({ kind: 'region' })} aria-label="The region"><Icon name="legwork" size={20} strokeWidth={1.8} /><small>Region</small></button>
      </div>
      {shown === cityId && <button type="button" className="r-here-card" onClick={() => openSheet({ kind: 'block', id: here.id })}>
        <span className="r-kicker">You are on</span>
        <b>{here.name}</b>
        <span className="r-note">{w.districts[here.districtId].name} · {select.businessesIn(w, here.id).length} places · {select.holderName(w, here.id)}</span>
      </button>}
      {layer === 'control' && <div className="r-legend">
        <span><i style={{ background: 'var(--amber)' }} />You</span>
        {factions.map(f => <span key={f.id}><i style={{ background: mute(f.color) }} />{f.short}</span>)}
      </div>}
    </div>
  );
}

/**
 * The next step: the tutorial, as one line on the map. It names a real person, place or tab, and a
 * tap goes there. The step shown is `select.nextLead` — the first that is not done and not waiting
 * on something — and a step that is waiting says what on. The whole line folds out below it.
 */
function LeadStrip() {
  const w = useWorld();
  const [open, setOpen] = useState(false);
  const all = select.leads(w);
  const todo = all.filter(l => !l.done);
  const next = select.nextLead(w);
  if (!todo.length || !next) return null;
  const done = all.length - todo.length;
  const go = (l: select.Lead) => {
    setOpen(false);
    if (l.npcId) openSheet({ kind: 'person', id: l.npcId });
    else if (l.businessId) openSheet({ kind: 'business', id: l.businessId });
    else if (l.tab) setTab(l.tab);
    else if (l.blockId) openSheet({ kind: 'block', id: l.blockId });
  };
  return (
    <div className={`r-leads${open ? ' open' : ''}`}>
      <button type="button" className="r-lead-top" onClick={() => go(next)}>
        <span className="r-kicker">Next<u><s style={{ width: `${(done / all.length) * 100}%` }} /></u><em>{done} of {all.length}</em></span>
        <b>{next.text}</b>
        {next.blocked && <span className="r-why">{next.blocked}</span>}
      </button>
      <button type="button" className="r-lead-more" aria-expanded={open} aria-label={open ? 'Hide the steps' : 'Every step'} onClick={() => setOpen(o => !o)}><Icon name={open ? 'caret_up' : 'down'} size={18} strokeWidth={2} /></button>
      {open && <ol className="r-lead-list">{all.map(l => <li key={l.id} className={l.done ? 'done' : l.id === next.id ? 'now' : ''}><button type="button" disabled={l.done} onClick={() => go(l)}><span className="r-tick">{l.done ? <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}</span><b>{l.text}</b><span>{!l.done && l.blocked ? l.blocked : l.why}</span></button></li>)}</ol>}
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
        <div className="r-card-head">{n ? <NpcFace n={n} size={52} tint={f ? `${mute(f.color)}55` : undefined} /> : <span className="r-bizicon big"><Icon name="note" size={26} /></span>}<div className="grow"><div className="r-kicker">Day {w.day}{w.events.length > 1 ? ` · 1 of ${w.events.length}` : ''}</div><h2 id="r-ev-title">{e.title}</h2></div></div>
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
 * The night report: a page from the ledger. The courier's headline, what came in and went out as
 * figures with the net under a rule, and everything that happened, each line marked by what kind
 * of news it is. No stars and no fanfare — the numbers are the reward.
 */
function RecapCard() {
  const w = useWorld();
  const r = useUi(s => s.recap)!;
  const net = r.clean + r.dirty - r.spent;
  return (
    <div className="r-modal" role="dialog" aria-modal="true" aria-labelledby="r-recap-title">
      <div className="r-card paper">
        <div className="r-paper-mast"><span>Night of day {r.day}{r.away ? ` · ${r.away} day${r.away > 1 ? 's' : ''} away` : ''}</span><span>{w.city.name}</span></div>
        <h2 id="r-recap-title" className="r-headline">{r.headline ?? `${w.city.name} sleeps.`}</h2>
        <div className="r-ledger-rows">
          <div><span>Clean in</span><b className="green">{fmt(r.clean)}</b></div>
          <div><span>Dirty in</span><b className="orange">{fmt(r.dirty)}</b></div>
          <div><span>Paid out</span><b>{r.spent ? `−${fmt(r.spent)}` : fmt(0)}</b></div>
          {r.washed > 0 && <div><span>Washed</span><b>{fmt(r.washed)}</b></div>}
          <div className="net"><span>The night</span><b className={net > 0 ? 'green' : net < 0 ? 'orange' : undefined}>{net > 0 ? '+' : net < 0 ? '−' : ''}{fmt(Math.abs(net))}</b></div>
          <div><span>Heat</span><b style={r.heat >= 60 ? { color: 'var(--heat)' } : undefined}>{r.heat}</b></div>
        </div>
        {r.lines.length > 0 && <ul className="r-recap-lines">{r.lines.map((l, i) => <li key={i} className={l.tone}>{l.text}</li>)}</ul>}
        <button type="button" className="r-btn primary block big" onClick={closeRecap} autoFocus>{w.events.length ? `Decide (${w.events.length})` : 'Morning'}</button>
      </div>
    </div>
  );
}

function WinCard() {
  const w = useWorld();
  return (
    <div className="r-modal" role="dialog" aria-modal="true"><div className="r-card paper">
      <div className="r-paper-mast"><span>Day {w.day}</span><span>{w.city.name}</span></div>
      <div className="r-ending">The city is yours</div>
      <p className="r-card-text">Half of {w.city.name} answers to you{Object.values(w.factions).every(f => !f.alive) ? ', and every outfit that stood against you is gone' : ''}. The game goes on — hold it.</p>
      <Do action={{ type: 'seen_win' }} label="Keep going" kind="primary" block />
    </div></div>
  );
}

function OverCard() {
  const w = useWorld();
  const o = w.over!;
  const title = { kingpin: 'Kingpin', straight: 'Out clean', dead: 'Dead', convicted: 'Convicted', broke: 'Finished' }[o.ending];
  const won = o.ending === 'kingpin' || o.ending === 'straight';
  return (
    <div className="r-modal" role="dialog" aria-modal="true"><div className="r-card paper">
      <div className="r-paper-mast"><span>{won ? 'You made it' : 'The end'} · day {o.day}</span><span>{w.city.name}</span></div>
      <div className={`r-ending${won ? '' : ' lost'}`}>{title}</div>
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
  const [tools, setTools] = useState(false);
  return (
    <Sheet title={w.city.name} kicker={`Seed ${w.seed} · day ${w.day}`}>
      <p className="r-motto-line">“{w.city.motto}”</p>
      <Meter value={select.controlShare(w) * 100} label="Your share of the city" right={`${(select.controlShare(w) * 100).toFixed(1)}% of ${Object.keys(w.blocks).length} blocks — half wins it`} />
      <div className="r-menu">
        <button type="button" onClick={() => openSheet({ kind: 'help' })}><Icon name="help" size={20} /> How to play</button>
        <button type="button" onClick={() => openSheet({ kind: 'region' })}><Icon name="legwork" size={20} /> The region</button>
        <button type="button" onClick={leaveGame}><Icon name="city_hall" size={20} /> Your cities<em>this one stays saved</em></button>
        <button type="button" onClick={() => { closeSheets(); setMode('original'); }}><Icon name="map" size={20} /> The original RACKETS</button>
      </div>
      <div className="r-menu">
        <button type="button" aria-expanded={tools} onClick={() => setTools(t => !t)}><Icon name="wrench" size={20} /> Testing tools<em>{w.cheated ? 'used on this save' : tools ? 'hide' : ''}</em></button>
        <button type="button" className="danger" onClick={() => (sure ? quitGame() : setSure(true))}><Icon name="trash" size={20} /> {sure ? 'Tap again: this city is gone for good' : 'Delete this city'}</button>
      </div>
      {tools && <Section title="Testing tools">
        <p className="r-note">For trying a system without playing weeks to reach it. Each one marks this save as tested.</p>
        <div className="r-inline-actions">{select.CHEATS.map(c => <Do key={c.kind} action={{ type: 'cheat', what: c.kind }} label={c.label} small />)}</div>
      </Section>}
      <p className="r-note" style={{ marginTop: 18 }}>The Remake saves on its own, separately from the original game. You can keep three cities. While the app is closed a day passes every six hours, up to three, and the careful choice is made for you.</p>
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
