import { useMemo, useRef, useState } from 'react';
import { select } from '@sim/index';
import type { ProductKind } from '@sim/types';
import { PRODUCT_INFO, SAFEHOUSE_TIERS } from '@content/rackets';
import { PRODUCTS, fmtMoney, pct, playerBusinesses, playerRackets, playerSafehouses, stashLine, stashTotals } from '@ui/derive';
import { focus, getState, importWorld, openSheet, resetGame, toast, useWorld } from '@ui/store';
import { Act, AmountPicker, Disclosure } from './Act';
import { BizRow } from './Rows';
import { RacketCard } from './BusinessSheet';
import { Meter } from './Meter';

export function EmpireTab() {
  const w = useWorld();
  const est = select.dailyEstimate(w);
  const share = select.controlShare(w);
  const biz = playerBusinesses(w);
  const rackets = playerRackets(w);
  const safes = playerSafehouses(w);
  const totals = stashTotals(w);
  const net = est.clean + est.dirty - est.wages - est.rent;
  return (
    <div className="panel-inner">
      <h2>Empire</h2>
      <div className="card gold">
        <div className="row between"><b>Daily estimate</b><b className={net >= 0 ? 'green' : 'red'}>{fmtMoney(net)}/day</b></div>
        <dl className="kv mt8">
          <dt>Clean income</dt><dd className="green">{fmtMoney(est.clean)}</dd>
          <dt>Dirty income</dt><dd className="orange">{fmtMoney(est.dirty)}</dd>
          <dt>Wages</dt><dd className="red">-{fmtMoney(est.wages)}</dd>
          <dt>Rent</dt><dd className="red">-{fmtMoney(est.rent)}</dd>
        </dl>
        <div className="mt8"><Meter label="City control" value={share * 100} color="var(--gold)" format={v => `${Math.round(v)}%`} /></div>
        <div className="small muted mt8">{select.playerBlocks(w).length} of {Object.keys(w.blocks).length} blocks · own 60% to take the city.</div>
      </div>

      <div className="section-title">Stash · {stashLine(totals)}</div>
      <div className="card">
        <dl className="kv">
          <dt>On you</dt><dd>{stashLine(w.player.stash)}{PRODUCTS.filter(p => w.player.stash[p] > 0 && p !== 'hot_goods').map(p => <span key={p} className="chip" style={{ marginLeft: 4 }}>{PRODUCT_INFO[p].icon} q{select.qualityOf(w.player, p)}</span>)}</dd>
          {safes.map(s => <SafeLine key={s.id} id={s.id} />)}
        </dl>
        <div className="actions mt8">
          <MoveStash />
          <Launder />
        </div>
      </div>

      <div className="section-title">Businesses ({biz.length})</div>
      <div className="list">{biz.map(b => <BizRow key={b.id} w={w} biz={b} />)}{biz.length === 0 && <p className="small muted">You own nothing yet. Buy a business or protect one.</p>}</div>

      <div className="section-title">Rackets ({rackets.length})</div>
      <div className="list">{rackets.map(r => <RacketCard key={r.id} w={w} r={r} showBiz />)}{rackets.length === 0 && <p className="small muted">No rackets. Start one from a business sheet.</p>}</div>

      <div className="section-title">Safehouses ({safes.length})</div>
      <div className="list">
        {safes.map(s => (
          <button type="button" key={s.id} className="listitem" onClick={() => openSheet({ kind: 'block', blockId: s.blockId })}>
            <span className="ico">🏠</span>
            <div className="grow"><div className="title">{s.name}</div><div className="sub">{SAFEHOUSE_TIERS[s.tier - 1]?.label} · {w.blocks[s.blockId]?.name} · {s.productionIds.length} productions · {fmtMoney(s.cash)} hidden</div></div>
          </button>
        ))}
        {safes.length === 0 && <p className="small muted">Rent one from any block sheet.</p>}
      </div>

      <div className="section-title">Log</div>
      <Log />

      <div className="section-title">Save</div>
      <SaveCard />
    </div>
  );
}

function SafeLine({ id }: { id: string }) {
  const w = useWorld(); const s = w.safehouses[id]; if (!s) return null;
  return <><dt>{s.name}</dt><dd>{stashLine(s.stash)} <span className="muted">· {fmtMoney(s.cash)}</span></dd></>;
}

function MoveStash() {
  const w = useWorld();
  const places = [{ id: 'player', label: 'On you' }, ...playerSafehouses(w).map(s => ({ id: s.id, label: s.name }))];
  const [from, setFrom] = useState('player');
  const [to, setTo] = useState(places[1]?.id ?? 'player');
  const [product, setProduct] = useState<ProductKind>('booze');
  const [amount, setAmount] = useState(10);
  const avail = from === 'player' ? w.player.stash[product] : (w.safehouses[from]?.stash[product] ?? 0);
  return (
    <Disclosure label="Move stash" icon="🚚">
      {places.length < 2 && <p className="small muted">Rent a safehouse to have somewhere to move product.</p>}
      <div className="grid2 mb8">
        <div><label className="field">From</label><select className="select" value={from} onChange={e => setFrom(e.target.value)}>{places.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
        <div><label className="field">To</label><select className="select" value={to} onChange={e => setTo(e.target.value)}>{places.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
      </div>
      <div className="chips mb8">{PRODUCTS.map(p => <button type="button" key={p} className={`chip btn${product === p ? ' sel' : ''}`} onClick={() => setProduct(p)}>{PRODUCT_INFO[p].icon} {PRODUCT_INFO[p].label}</button>)}</div>
      <label className="field">Amount (available {Math.round(avail)})</label>
      <AmountPicker presets={[5, 10, 25, Math.max(1, Math.floor(avail))]} prefix="" value={amount} onChange={setAmount} min={1} />
      <div className="mt8"><Act action={{ type: 'move_stash', from, to, product, amount }} label={`Move ${amount} ${PRODUCT_INFO[product].label}`} kind="primary" block /></div>
    </Disclosure>
  );
}

function Launder() {
  const w = useWorld();
  const [amount, setAmount] = useState(1000);
  return (
    <Disclosure label="Launder" icon="🧼">
      <p className="small muted">Dirty {fmtMoney(w.player.dirty)} on hand · laundered today {fmtMoney(w.player.launderedToday)}. Needs a laundering racket.</p>
      <AmountPicker presets={[500, 1000, 5000, Math.max(1, Math.floor(w.player.dirty))]} value={amount} onChange={setAmount} min={1} />
      <div className="mt8"><Act action={{ type: 'launder', amount }} label={`Launder ${fmtMoney(amount)}`} kind="primary" block /></div>
    </Disclosure>
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
        <button type="button" className="btn" onClick={download}>⬇️ Export file</button>
        <button type="button" className="btn" onClick={() => void copy()}>📋 Copy JSON</button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>📂 Import file</button>
        <button type="button" className="btn" onClick={() => setImporting(i => !i)}>📝 Paste JSON</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => onFile(e.target.files?.[0])} />
      </div>
      {importing && (
        <div className="mt8">
          <textarea className="textarea" value={text} onChange={e => setText(e.target.value)} placeholder="Paste a RACKETS save here" />
          <button type="button" className="btn btn-primary btn-block mt8" disabled={!text.trim()} onClick={() => doImport(text)}>Import</button>
        </div>
      )}
      <div className="mt12"><button type="button" className="btn btn-danger btn-block" onClick={() => { if (window.confirm('Start a new game? The current save will be deleted.')) resetGame(); }}>🗑️ New game</button></div>
    </div>
  );
}

export { pct };
