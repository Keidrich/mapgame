import { useMemo, useState } from 'react';
import { select } from '@sim/index';
import type { Holding, HoldingSort } from '@sim/select';
import { fmtMoney } from '@ui/derive';
import { openSheet, useWorld } from '@ui/store';
import { Info, Term } from './Info';
import { Icon, IconTile } from '@ui/icons';

/**
 * The empire ledger: every business, racket and production in one table.
 *
 * Each of the three used to live on its own card on its own tab, showing whatever that tab
 * happened to know — the racket card knew its income, the block sheet knew saturation, the
 * inventory knew whether a production had a foreman — and nothing put them side by side. A player
 * with twenty holdings could not answer "which of these is being crowded out" or "which of these
 * is running itself" without opening twenty sheets.
 *
 * All of it is read from `select.holdings`, including the sort, so what is on screen is what the
 * sim says and the ordering is a thing a test can assert rather than a detail of this component.
 * Mobile-first: the table is one row per holding with the numbers stacked under the name, and it
 * scrolls sideways in its own container rather than pushing the page about.
 */
const SORTS: { id: HoldingSort; label: string }[] = [
  { id: 'income', label: 'Income' },
  { id: 'trouble', label: 'Trouble' },
  { id: 'saturation', label: 'Crowding' },
  { id: 'kind', label: 'Kind' },
  { id: 'where', label: 'Where' },
  { id: 'name', label: 'Name' },
];

export function Holdings() {
  const w = useWorld();
  const [by, setBy] = useState<HoldingSort>('income');
  const [only, setOnly] = useState<'all' | 'trouble'>('all');
  const rows = useMemo(() => {
    const all = select.sortHoldings(select.holdings(w), by);
    return only === 'trouble' ? all.filter(r => r.flags.length > 0 || r.saturation < 1 || !r.auto.good) : all;
  }, [w, by, only]);
  const t = select.holdingsTotals(w);

  if (!t.count) return <p className="small muted">You hold nothing yet. Buy a business, protect one, or start a racket.</p>;

  return (
    <>
      <div className="brief">
        <div className="brief-head"><Icon name="empire" size={13} /> Holdings<span className="n">{t.count}</span></div>
        <div className="row between">
          <b>{t.count} holding{t.count === 1 ? '' : 's'}</b>
          <b className="green">{fmtMoney(t.income)}/day</b>
        </div>
        <div className="small muted mt4">
          {fmtMoney(t.income - t.dirty)} clean · {fmtMoney(t.dirty)} <Term id="dirty">dirty</Term>
          {t.automated > 0 && <> · {t.automated} running {t.automated === 1 ? 'itself' : 'themselves'}</>}
          {t.synergies > 0 && <> · <span className="green">{t.synergies} feeding each other</span></>}
          {t.crowded > 0 && <> · <span className="orange">{t.crowded} crowded out</span></>}
          {t.trouble > 0 && <> · <span className="red">{t.trouble} needing something</span></>}
        </div>
      </div>

      <div className="chips mt8">
        <span className="tiny muted" style={{ alignSelf: 'center' }}>Sort<Info id="holdings" /></span>
        {SORTS.map(s => (
          <button type="button" key={s.id} className={`chip btn${by === s.id ? ' sel' : ''}`} onClick={() => setBy(s.id)}>{s.label}</button>
        ))}
        <button type="button" className={`chip btn${only === 'trouble' ? ' sel' : ''}`} onClick={() => setOnly(o => (o === 'trouble' ? 'all' : 'trouble'))}>
          Needs a look
        </button>
      </div>

      <div className="list mt8">
        {rows.map(r => <Row key={r.id} r={r} />)}
        {!rows.length && <p className="small muted">Nothing needs a look. All of it is earning and none of it is crowded.</p>}
      </div>
    </>
  );
}

function Row({ r }: { r: Holding }) {
  const open = () => openSheet(r.kind === 'production' ? { kind: 'block', blockId: r.blockId } : r.kind === 'business' ? { kind: 'business', businessId: r.id } : { kind: 'block', blockId: r.blockId });
  const crowded = r.saturation < 1;
  return (
    <button type="button" className="listitem" onClick={open}>
      <IconTile of={r.kind} id={r.typeId} size={32} tone={r.income > 0 ? 'gold' : 'muted'} />
      <div className="grow">
        <div className="row between">
          <span className="title">{r.name}</span>
          <span className={r.income > 0 ? 'green' : 'muted'} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(r.income)}/d</span>
        </div>
        <div className="sub">{r.where}</div>
        <div className="chips mt4">
          <span className={`chip ${r.auto.good ? '' : 'orange'}`}><Icon name={autoIcon(r)} size={11} /> {r.auto.label}</span>
          {crowded && <span className="chip orange"><Icon name="down" size={11} /> {Math.round((1 - r.saturation) * 100)}% crowded out</span>}
          {r.synergy && <span className="chip green"><Icon name="link" size={11} /> +{Math.round(r.synergy.bonus * 100)}% {r.synergy.why}</span>}
          {r.flags.map(f => <span key={f} className="chip red"><Icon name="warn" size={11} /> {f}</span>)}
        </div>
      </div>
    </button>
  );
}

const autoIcon = (r: Holding) =>
  r.auto.state === 'foreman' ? 'foreman' : r.auto.state === 'standing' ? 'hot_goods' : r.auto.state === 'unmanned' ? 'warn' : 'hand';
