import { useMemo, useRef, useState } from 'react';
import { select } from '@sim/index';
import { LAUNDER_RATE, SAFEHOUSE_TIERS } from '@content/rackets';
import { LAY_LOW } from '@content/events';
import { fmtMoney, pct, playerBusinesses, playerRackets, playerSafehouses } from '@ui/derive';
import { focus, getState, importWorld, openSheet, resetGame, toast, useWorld } from '@ui/store';
import { Act, AmountPicker, Disclosure, Section } from './Act';
import { BizRow } from './Rows';
import { RacketCard } from './BusinessSheet';
import { Meter } from './Meter';
import { Info, Term } from './Info';
import { Inventory } from './Inventory';
import { Holdings } from './Holdings';
import { WireSection } from './Wire';
import { NewsTicker } from './NewsTicker';
import { TrophyScreen } from './TrophyScreen';
import { LIFESTYLE } from '@content/fortune';
import { Icon } from '@ui/icons';

/**
 * The Empire tab is a **hub**, not a page.
 *
 * Measured before this pass: one scroll of 7,866px on an 844px screen — **9.3 screens**, twelve
 * sections deep. The record sat at screen 4.9 and the safehouse list at screen 10. Every one of
 * those sections is something a player wants; none of them is something they want *at the same
 * time as the other eleven*.
 *
 * The decision (see `docs/DESIGN.md` §4.28): **the tab bar does not grow, this tab gets
 * sub-navigation.** Six tabs already spend 65px each of a 390px phone; a seventh would shrink the
 * hit targets to fix a problem that measurement says is not about depth at all — every one of
 * these screens was already one or two taps away. The cost was never taps, it was landing in a
 * nine-screen wall and scrolling to find out whether the thing you wanted was in it.
 *
 * Four views, each a short screen, each answering one question:
 *
 *  - **Money** — what comes in tonight, what you are holding, what to do with it.
 *  - **Holdings** — the things you own: businesses, rackets, safehouses.
 *  - **The city** — what got out, and the file somebody kept on you.
 *  - **You** — the life the money bought, the way out, and the save.
 *
 * `Money` is the default because it is the question a player opens this tab to answer.
 */
export const EMPIRE_VIEWS = [
  { id: 'money', label: 'Money', icon: 'cash' },
  { id: 'holdings', label: 'Holdings', icon: 'empire' },
  // The wire is a lane, not a detail of the money view. It went in with Money on the first cut of
  // this hub and was reported broken within the hour — not because it failed to render, but because
  // a player who plays the wire opens this tab *for the wire* and there was nothing named for it to
  // aim at. A thing with its own cards, its own heat and its own way of earning gets its own view.
  { id: 'wire', label: 'Wire', icon: 'hack' },
  { id: 'city', label: 'City', icon: 'city_hall' },
  { id: 'you', label: 'You', icon: 'person' },
] as const;
export type EmpireView = typeof EMPIRE_VIEWS[number]['id'];

/**
 * `view` is a prop so one can be rendered on its own — by a test walking all four, and by anything
 * that ever wants to open this tab *at* a question rather than at the top of it. With nothing
 * passed, the tab owns its own state, which is the ordinary case.
 */
export function EmpireTab({ view: fixed }: { view?: EmpireView } = {}) {
  const w = useWorld();
  const est = select.dailyEstimate(w);
  const share = select.controlShare(w);
  const biz = playerBusinesses(w);
  const rackets = playerRackets(w);
  const safes = playerSafehouses(w);
  const net = est.clean + est.dirty - est.wages - est.rent;
  // Remembered across a session the same way a fold is, so coming back to Empire comes back to
  // whichever question you were last asking rather than resetting to the top of a list.
  const [own, setOwn] = useState<EmpireView>(() => (readEmpireView() ?? 'money'));
  const view = fixed ?? own;
  const go = (v: EmpireView) => { setOwn(v); writeEmpireView(v); };

  return (
    <div className="panel-inner">
      <h2>Empire</h2>
      <nav className="subnav" aria-label="Empire sections">
        {EMPIRE_VIEWS.map(v => (
          <button type="button" key={v.id} className={`subnav-tab${view === v.id ? ' active' : ''}`}
            onClick={() => go(v.id)} aria-current={view === v.id ? 'page' : undefined}>
            <Icon name={v.icon} size={15} /><span>{v.label}</span>
          </button>
        ))}
      </nav>

      {view === 'money' && (
        <>
          <div className="card gold">
            <div className="row between"><b>Daily estimate<Info title="Daily estimate" body="What tonight should bring in and pay out, before events, raids and incidents. Rackets that need product or a runner can come in under it." /></b><b className={net >= 0 ? 'green' : 'red'}>{fmtMoney(net)}/day</b></div>
            <dl className="kv mt8">
              <dt><Term id="cash">Clean income</Term></dt><dd className="green">{fmtMoney(est.clean)}</dd>
              <dt><Term id="dirty">Dirty income</Term></dt><dd className="orange">{fmtMoney(est.dirty)}</dd>
              <dt><Term id="cut">Wages</Term></dt><dd className="red">-{fmtMoney(est.wages)}</dd>
              <dt>Rent</dt><dd className="red">-{fmtMoney(est.rent)}</dd>
            </dl>
            <div className="mt8"><Meter label={<Term id="control">City control</Term>} value={share * 100} color="var(--gold)" format={v => `${Math.round(v)}%`} /></div>
            <div className="small muted mt8">{select.playerBlocks(w).length} of {Object.keys(w.blocks).length} blocks · own 60% to take the city.</div>
          </div>
          <div className="actions mt8"><Launder /><GoToGround /><TheWall /></div>
          <Inventory />
        </>
      )}

      {view === 'wire' && (
        <>
          <WireSection />
          {/* `WireSection` renders nothing at all when there is no wire, and a blank view is how a
              player concludes a tab is broken. The empty state is the view's job, not its. */}
          {!select.cards(w).length && !select.secrets(w).length && !Math.round(w.player.cyberHeat ?? 0) && (
            <p className="small muted">Nothing on the wire. Cards come out of pockets — a mugging, a pickpocket, somebody careless — and what you learn from getting inside a business is sold from here.</p>
          )}
        </>
      )}

      {view === 'holdings' && (
        <>
          <Section id="holdings" title="Holdings" info={<Info id="holdings" />}><Holdings /></Section>
          <Section id="businesses" title="Businesses" count={biz.length}>
            <div className="list">{biz.map(b => <BizRow key={b.id} w={w} biz={b} />)}{biz.length === 0 && <p className="small muted">You own nothing yet. Buy a business or protect one.</p>}</div>
          </Section>
          <Section id="rackets" title="Rackets" count={rackets.length}>
            <div className="list">{rackets.map(r => <RacketCard key={r.id} w={w} r={r} showBiz />)}{rackets.length === 0 && <p className="small muted">No rackets. Start one from a business sheet.</p>}</div>
          </Section>
          <Section id="safehouses" title="Safehouses" count={safes.length}>
            <div className="list">
              {safes.map(s => (
                <button type="button" key={s.id} className="listitem" onClick={() => openSheet({ kind: 'block', blockId: s.blockId })}>
                  <span className="ico"><Icon name="safehouse" size={18} /></span>
                  <div className="grow"><div className="title">{s.name}</div><div className="sub">{SAFEHOUSE_TIERS[s.tier - 1]?.label} · {w.blocks[s.blockId]?.name} · {s.productionIds.length} productions · {fmtMoney(s.cash)} hidden</div></div>
                </button>
              ))}
              {safes.length === 0 && <p className="small muted">Rent one from any block sheet.</p>}
            </div>
          </Section>
        </>
      )}

      {view === 'city' && (
        <>
          {/* what the city read about it afterwards, the files they have open, and the record */}
          <NewsTicker />
          <Cases />
          <TrophyScreen />
          <Section id="log" title="Log" defaultOpen={false}><Log /></Section>
        </>
      )}

      {view === 'you' && (
        <>
          <Lifestyle />
          <GoStraight />
          <Section id="save" title="Save" defaultOpen={false}><SaveCard /></Section>
        </>
      )}
    </div>
  );
}

/** Which Empire view was last open. A preference, stored like the folds are. */
const EMPIRE_VIEW_KEY = 'rackets.empireView.v1';
function readEmpireView(): EmpireView | undefined {
  try {
    const v = localStorage.getItem(EMPIRE_VIEW_KEY);
    return EMPIRE_VIEWS.some(x => x.id === v) ? (v as EmpireView) : undefined;
  } catch { return undefined; }
}
function writeEmpireView(v: EmpireView) { try { localStorage.setItem(EMPIRE_VIEW_KEY, v); } catch { /* a preference nobody can store is still one for this session */ } }

function Cases() {
  const w = useWorld();
  const all = (w.cases ?? []).slice().reverse().slice(0, 8);
  if (!all.length) return null;
  return (
    <Section id="cases" title="Cold cases" count={select.openCases(w).length} info={<Info id="coldCase" />}>
      <div className="list">
        {all.map(c => { const wit = c.witnessId ? w.npcs[c.witnessId] : undefined; return (
          <div key={c.id} className="card" style={{ padding: 10, opacity: c.status === 'open' ? 1 : 0.6 }}>
            <div className="row between"><b><Icon name="casefile" size={14} /> {c.title}</b><span className={`chip ${c.status === 'charged' ? 'red' : ''}`}>{c.status === 'open' ? `day ${c.day}` : c.status}</span></div>
            <div className="mt8"><Meter label={<Term id="evidence">Evidence</Term>} value={c.evidence} color={c.evidence >= 60 ? 'var(--red)' : 'var(--orange)'} /></div>
            <div className="small muted mt8">
              {c.status === 'open' && (wit ? <>Witness: <button type="button" className="chip btn" onClick={() => openSheet({ kind: 'npc', npcId: wit.id })}>{wit.name}</button> · scare them (fear 40+), pay them, or make them go away. </> : 'No witness talking. ')}
              {c.status === 'open' && 'The captain buries paper; a lawyer slows it. Charges at 100.'}
            </div>
          </div>); })}
      </div>
    </Section>
  );
}

function Launder() {
  const w = useWorld();
  const [amount, setAmount] = useState(1000);
  return (
    <Disclosure label="Launder" icon="laundering">
      <p className="small muted"><Term id="dirty">Dirty</Term> {fmtMoney(w.player.dirty)} on hand · laundered today {fmtMoney(w.player.launderedToday)}. Needs a laundering racket, which converts at {Math.round(LAUNDER_RATE * 100)} cents on the dollar up to a daily cap.</p>
      <Fixers />
      <AmountPicker presets={[500, 1000, 5000, Math.max(1, Math.floor(w.player.dirty))]} value={amount} onChange={setAmount} min={1} />
      <div className="mt8"><Act action={{ type: 'launder', amount }} label={`Launder ${fmtMoney(amount)}`} kind="primary" block /></div>
    </Disclosure>
  );
}

/**
 * Something to *do* when the heat ladder fires. The warning has said "lay low" since the game had
 * a heat meter, and until now there was no such thing — the only answers were paying somebody or
 * waiting. This one is paid for in your own turns.
 */
function GoToGround() {
  const w = useWorld();
  const [days, setDays] = useState(3);
  const under = select.layingLow(w);
  return (
    <Disclosure label={under ? `Laying low (${select.layLowLeft(w)}d)` : 'Lay low'} icon="safehouse">
      <p className="small muted">
        <Term id="layLow">Off the street</Term> for a few days. Heat comes off fast because nobody can find you to add to it — and you get nothing done while you are gone: no <Term id="ap">AP</Term>, no legwork, and the street rates you a little lower for being nowhere. {fmtMoney(LAY_LOW.costPerDay)} a day.
      </p>
      {under
        ? <p className="small mt8">You surface on day {w.player.layLowUntil}.</p>
        : <>
            <AmountPicker presets={[LAY_LOW.minDays, 3, 5, LAY_LOW.maxDays]} value={days} onChange={setDays} prefix="" min={LAY_LOW.minDays} max={LAY_LOW.maxDays} />
            <div className="mt8"><Act action={{ type: 'lay_low', days }} label={`Go to ground for ${days}d (−${Math.min(Math.round(w.player.heat), Math.round(days * LAY_LOW.heatPerDay))} heat, ${fmtMoney(days * LAY_LOW.costPerDay)})`} kind="primary" block /></div>
          </>}
    </Disclosure>
  );
}

/**
 * The hole in the wall: a bust takes 80% of what is on you, and one person has one pocket.
 * Capacity falls with every body on the books, so it is a solo hedge by construction.
 */
function TheWall() {
  const w = useWorld();
  const [amount, setAmount] = useState(500);
  const cap = select.cacheCap(w);
  const held = w.player.cache ?? 0;
  const why = select.cacheReason(w);
  return (
    <Disclosure label="The wall" icon="lockpicks">
      <p className="small muted">
        <Term id="cache">Somewhere only you know</Term>. {fmtMoney(held)} in it{cap > 0 ? ` of ${fmtMoney(cap)}` : ''}. A bust usually cannot reach it — usually.
      </p>
      {why
        ? <p className="small mt8">{why}</p>
        : <>
            <AmountPicker presets={[250, 500, 1000, Math.max(1, Math.min(select.cacheCapLeft(w), Math.floor(w.player.dirty)))]} value={amount} onChange={setAmount} min={1} />
            <div className="row mt8" style={{ gap: 6 }}>
              <Act action={{ type: 'cache', amount }} label={`Put ${fmtMoney(amount)} away`} kind="primary" />
              <Act action={{ type: 'cache', amount, take: true }} label="Take it back" kind="ghost" />
            </div>
          </>}
      {held > 0 && why && <div className="mt8"><Act action={{ type: 'cache', amount: held, take: true }} label={`Take back ${fmtMoney(held)}`} kind="primary" block /></div>}
    </Disclosure>
  );
}

/**
 * The other way this ends: laundering all the way out.
 *
 * Deliberately a progress report and not a button. Every condition has to hold *at once* and keep
 * holding — `sim/legacy.ts` counts the days — so the screen's job is to say which one you are
 * failing today, which is the only useful thing it could say.
 */
function GoStraight() {
  const w = useWorld();
  const why = select.goStraightReason(w);
  const days = w.player.cleanSince ?? 0;
  const loved = select.lovedOne(w);
  if (!loved && w.player.cash < select.GO_STRAIGHT.cash / 3) return null;   // not a conversation yet
  return (
    <>
      <div className="section-title">Getting out<Info id="goStraight" /></div>
      <div className="card" style={{ padding: 10 }}>
        {why
          ? <p className="small muted">{why}</p>
          : <p className="small gold">Everything is in order. {days} of {select.GO_STRAIGHT.days} quiet days. Keep it like this and you are out.</p>}
        {!why && (
          <div className="meterbar mt8"><div className="meterfill" style={{ width: `${Math.min(100, (days / select.GO_STRAIGHT.days) * 100)}%` }} /></div>
        )}
        {loved && <p className="tiny faint mt8">{select.lovedStatus(w)}</p>}
      </div>
    </>
  );
}

/**
 * What a fortune is for, in one place: the life, the legitimacy, and the headroom. Everything
 * here is a sink — see `content/fortune.ts` — and every one of them spends into a number the rest
 * of the game already reads, which is why none of them has a screen of its own.
 */
function Lifestyle() {
  const w = useWorld();
  const [spend, setSpend] = useState(10_000);
  return (
    <Section id="lifestyle" title="What it is all for" info={<Info id="lifestyle" />}>
      <div className="col" style={{ gap: 6 }}>
        {(Object.keys(LIFESTYLE) as (keyof typeof LIFESTYLE)[]).map(k => {
          const at = select.lifestyleAt(w, k);
          const next = select.nextStep(w, k);
          return (
            <div key={k} className="card" style={{ padding: 10 }}>
              <div className="row between">
                <b>{k === 'home' ? 'Where you live' : k === 'car' ? 'What you drive' : 'Who is with you'}</b>
                <span className="small muted">{at} of {LIFESTYLE[k].length}</span>
              </div>
              {at > 0 && <div className="small gold mt4">{LIFESTYLE[k][at - 1].label}</div>}
              {next
                ? <>
                    <p className="small muted mt8">{next.label} — {next.blurb} <span className="gold">+{next.respect} respect, +{next.fear} fear</span></p>
                    <div className="mt8"><Act action={{ type: 'buy_lifestyle', kind: k }} label={`${next.label} (${fmtMoney(next.cost)})`} kind="primary" block /></div>
                  </>
                : <p className="small muted mt8">There is nothing above this.</p>}
            </div>
          );
        })}
      </div>

      <div className="actions mt8">
        <Disclosure label="Look respectable" icon="lawyer">
          <p className="small muted">
            <Term id="legitimacy">Respectable</Term> {Math.round(select.legitimacy(w))} — every point of heat you draw is multiplied by {select.legitimacyHeatMult(w).toFixed(2)}. It fades a little every day, so it is something you keep paying for rather than something you buy.
          </p>
          <AmountPicker presets={[5_000, 25_000, 100_000, Math.max(5_000, Math.floor(w.player.cash))]} value={spend} onChange={setSpend} min={5_000} />
          <div className="mt8"><Act action={{ type: 'buy_legitimacy', amount: spend }} label={`Give away ${fmtMoney(spend)} (+${Math.round(select.legitimacyGain(w, spend))})`} kind="primary" block /></div>
        </Disclosure>
        <Disclosure label="More room" icon="safehouse">
          <p className="small muted">Permanent headroom on what you already have. Beds decide how many people you can keep; places decide how much you can make and hold.</p>
          {(['crew', 'safehouse'] as const).map(k => {
            const price = select.ceilingPrice(w, k);
            return (
              <div key={k} className="mt8">
                {price === undefined
                  ? <p className="small muted">{k === 'crew' ? 'Beds' : 'Places'}: nothing more to buy.</p>
                  : <Act action={{ type: 'buy_ceiling', kind: k }} label={`${k === 'crew' ? 'Two more beds' : 'Room for another place'} (${fmtMoney(price)})`} block />}
              </div>
            );
          })}
          <p className="tiny faint mt8">Beds: {select.bedsTotal(w)} · places: {w.player.safehouseIds.length} of {select.safehouseLimit(w)}</p>
        </Disclosure>
      </div>
    </Section>
  );
}

/**
 * The name on everything.
 *
 * `rename` has existed as an action since the beginning and had no control anywhere, so a player
 * who typed their name wrong at the start carried it for the whole game. The street name beside it
 * is not editable on purpose: that one is earned, and the game decides it.
 */
function YourName() {
  const w = useWorld();
  const [name, setName] = useState(w.player.name);
  const changed = name.trim() && name.trim() !== w.player.name;
  return (
    <div className="mt8">
      <div className="row" style={{ gap: 6 }}>
        <input className="input grow" value={name} maxLength={40} aria-label="Your name"
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        {changed && <Act action={{ type: 'rename', name: name.trim() }} label="Rename" small />}
      </div>
      {w.player.street && <p className="tiny faint mt4">The street calls you &quot;{w.player.street}&quot;. That one you do not get to pick.</p>}
    </div>
  );
}

/** Before you can afford a laundering racket, a fixer will wash a little at a worse rate. */
function Fixers() {
  const w = useWorld();
  const fixers = select.fixersKnown(w);
  if (!fixers.length) return null;
  return (
    <div className="mt8">
      <p className="small muted">No capacity of your own yet? A <Term id="fixer">fixer</Term> will take a smaller amount at a worse rate:</p>
      <div className="list">
        {fixers.map(n => (
          <button type="button" key={n.id} className="listitem" onClick={() => openSheet({ kind: 'npc', npcId: n.id })}>
            <div className="grow">
              <div className="title">{n.name}</div>
              <div className="small muted">{Math.round(select.fixerRate(n.rel.trust) * 100)}c on the dollar · {fmtMoney(select.fixerCapLeft(w, n))} left today · {w.blocks[n.homeBlockId]?.name ?? 'somewhere close'}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Log() {
  const w = useWorld();
  const [all, setAll] = useState(false);
  const entries = useMemo(() => w.log.slice().reverse(), [w.log]);
  const shown = all ? entries : entries.slice(0, 25);
  return (
    <div className="log">
      {shown.map((e, i) => {
        const hasRef = !!(e.refs && (e.refs.blockId || e.refs.businessId || e.refs.npcId));
        return hasRef
          ? <button type="button" key={i} className={`logline ${e.tone} ref`} onClick={() => focus(e.refs!)}><span className="d">D{e.day}</span><span>{e.text}</span></button>
          : <div key={i} className={`logline ${e.tone}`}><span className="d">D{e.day}</span><span>{e.text}</span></div>;
      })}
      {entries.length > 25 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(a => !a)}>{all ? 'Show less' : `Show all ${entries.length}`}</button>}
    </div>
  );
}

function SaveCard() {
  const w = useWorld();
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const json = () => JSON.stringify(getState().world);
  const download = () => {
    const blob = new Blob([json()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `rackets-${w.placeName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-day${w.day}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(json()); toast('Save copied to clipboard.', 'good'); }
    catch { setImporting(true); setText(json()); toast('Clipboard blocked — copy the text below.', 'warn'); }
  };
  const doImport = (src: string) => { const err = importWorld(src); if (err) toast(err, 'bad'); else { toast('Save imported.', 'good'); setImporting(false); setText(''); } };
  const onFile = (f: File | undefined) => { if (!f) return; f.text().then(doImport); };
  return (
    <div className="card">
      <p className="small muted">Autosaves after every action. Seed {w.seed} · {w.placeName} · day {w.day}.</p>
      <YourName />
      <div className="actions">
        <button type="button" className="btn" onClick={download}><Icon name="download" size={14} /> Export file</button>
        <button type="button" className="btn" onClick={() => void copy()}><Icon name="copy" size={14} /> Copy JSON</button>
        <button type="button" className="btn" onClick={() => file.current?.click()}><Icon name="upload" size={14} /> Import file</button>
        <button type="button" className="btn" onClick={() => setImporting(i => !i)}><Icon name="note" size={14} /> Paste JSON</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => onFile(e.target.files?.[0])} />
      </div>
      {importing && (
        <div className="mt8">
          <textarea className="textarea" value={text} onChange={e => setText(e.target.value)} placeholder="Paste a RACKETS save here" />
          <button type="button" className="btn btn-primary btn-block mt8" disabled={!text.trim()} onClick={() => doImport(text)}>Import</button>
        </div>
      )}
      <div className="mt12"><button type="button" className="btn btn-danger btn-block" onClick={() => { if (window.confirm('Start a new game? The current save will be deleted.')) resetGame(); }}><Icon name="trash" size={14} /> New game</button></div>
    </div>
  );
}

export { pct };
