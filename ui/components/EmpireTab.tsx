import { useMemo, useRef, useState } from 'react';
import { select } from '@sim/index';
import { LAUNDER_RATE, SAFEHOUSE_TIERS } from '@content/rackets';
import { LAY_LOW } from '@content/events';
import { fmtMoney, pct, playerBusinesses, playerRackets, playerSafehouses } from '@ui/derive';
import { focus, getState, importWorld, openSheet, resetGame, toast, useWorld } from '@ui/store';
import { Act, AmountPicker, Disclosure } from './Act';
import { BizRow } from './Rows';
import { RacketCard } from './BusinessSheet';
import { Meter } from './Meter';
import { Info, Term } from './Info';
import { Inventory } from './Inventory';
import { Holdings } from './Holdings';
import { WireSection } from './Wire';
import { Icon } from '@ui/icons';

export function EmpireTab() {
  const w = useWorld();
  const est = select.dailyEstimate(w);
  const share = select.controlShare(w);
  const biz = playerBusinesses(w);
  const rackets = playerRackets(w);
  const safes = playerSafehouses(w);
  const net = est.clean + est.dirty - est.wages - est.rent;
  return (
    <div className="panel-inner">
      <h2>Empire</h2>
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

      <div className="section-title">Holdings<Info id="holdings" /></div>
      <Holdings />

      <Inventory />
      <div className="actions mt8"><Launder /><GoToGround /><TheWall /></div>

      <div className="section-title">Businesses ({biz.length})</div>
      <div className="list">{biz.map(b => <BizRow key={b.id} w={w} biz={b} />)}{biz.length === 0 && <p className="small muted">You own nothing yet. Buy a business or protect one.</p>}</div>

      <WireSection />

      <div className="section-title">Rackets ({rackets.length})</div>
      <div className="list">{rackets.map(r => <RacketCard key={r.id} w={w} r={r} showBiz />)}{rackets.length === 0 && <p className="small muted">No rackets. Start one from a business sheet.</p>}</div>

      <div className="section-title">Safehouses ({safes.length})</div>
      <div className="list">
        {safes.map(s => (
          <button type="button" key={s.id} className="listitem" onClick={() => openSheet({ kind: 'block', blockId: s.blockId })}>
            <span className="ico"><Icon name="safehouse" size={18} /></span>
            <div className="grow"><div className="title">{s.name}</div><div className="sub">{SAFEHOUSE_TIERS[s.tier - 1]?.label} · {w.blocks[s.blockId]?.name} · {s.productionIds.length} productions · {fmtMoney(s.cash)} hidden</div></div>
          </button>
        ))}
        {safes.length === 0 && <p className="small muted">Rent one from any block sheet.</p>}
      </div>

      <Cases />

      <div className="section-title">Log</div>
      <Log />

      <div className="section-title">Save</div>
      <SaveCard />
    </div>
  );
}

function Cases() {
  const w = useWorld();
  const all = (w.cases ?? []).slice().reverse().slice(0, 8);
  if (!all.length) return null;
  return (
    <>
      <div className="section-title">Cold cases ({select.openCases(w).length} open)<Info id="coldCase" /></div>
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
    </>
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
            <div className="mt8"><Act action={{ type: 'lay_low', days }} label={`Go to ground for ${days}d (−${Math.round(days * LAY_LOW.heatPerDay)} heat, ${fmtMoney(days * LAY_LOW.costPerDay)})`} kind="primary" block /></div>
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
