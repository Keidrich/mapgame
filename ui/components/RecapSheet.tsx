import { useMemo } from 'react';
import type { LogEntry } from '@sim/types';
import { fmtMoney } from '@ui/derive';
import { closeRecap, focus, useStore, useWorld } from '@ui/store';

const ORDER: Record<LogEntry['tone'], number> = { bad: 0, warn: 1, money: 2, good: 3, info: 4 };
const ICON: Record<LogEntry['tone'], string> = { bad: '🔴', warn: '🟠', money: '💵', good: '🟢', info: '·' };

/** The overnight report: money in and out, heat, and everything that happened, worst first. Shown before the day's events. */
export function RecapSheet() {
  const w = useWorld();
  const recap = useStore(s => s.recap)!;
  const p = w.player;
  const entries = useMemo(() => {
    const raw = w.log.slice(recap.logStart).filter(e => !/^Day \d+\. Took in/.test(e.text));
    return raw.map((e, i) => ({ e, i })).sort((a, b) => ORDER[a.e.tone] - ORDER[b.e.tone] || a.i - b.i).map(x => x.e);
  }, [w.log, recap.logStart]);
  const nights = recap.toDay - recap.fromDay;
  const dCash = p.cash - recap.cashBefore, dDirty = p.dirty - recap.dirtyBefore;
  const delta = (v: number) => <span className={v > 0 ? 'green' : v < 0 ? 'red' : 'muted'}>{v > 0 ? '+' : v < 0 ? '−' : ''}{fmtMoney(Math.abs(v))}</span>;
  const shown = entries.slice(0, 40);
  const pending = w.pendingEvents.length;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="recap-title">
      <div className="modal">
        <div className="event-kind">{recap.idle ? `While you were away · ${nights} night${nights === 1 ? '' : 's'}` : `Night of day ${recap.fromDay}`}</div>
        <h2 id="recap-title">{recap.idle ? `Day ${w.day}. The city kept moving.` : `Morning, day ${w.day}.`}</h2>
        <dl className="kv">
          <dt>Clean cash</dt><dd>{fmtMoney(p.cash)} <span className="small">({delta(dCash)})</span></dd>
          <dt>Dirty cash</dt><dd>{fmtMoney(p.dirty)} <span className="small">({delta(dDirty)})</span></dd>
          <dt>Heat</dt><dd><span className={p.heat >= 60 ? 'red' : p.heat >= 45 ? 'orange' : ''}>{Math.round(p.heat)}</span> <span className="small muted">was {Math.round(recap.heatBefore)}</span></dd>
        </dl>
        {shown.length > 0 && (
          <div className="list mt8">
            {shown.map((e, i) => (
              <button type="button" key={i} className="listitem" style={{ minHeight: 0, alignItems: 'flex-start' }} onClick={() => { if (e.refs) focus(e.refs); }} disabled={!e.refs || !(e.refs.blockId || e.refs.businessId || e.refs.npcId)}>
                <span style={{ width: 18, flex: 'none' }}>{ICON[e.tone]}</span>
                <span className={`small ${e.tone === 'bad' ? 'red' : e.tone === 'warn' ? 'orange' : e.tone === 'money' ? 'gold' : e.tone === 'good' ? 'green' : ''}`} style={{ textAlign: 'left' }}>{nights > 1 && <span className="muted">Day {e.day} · </span>}{e.text}</span>
              </button>
            ))}
            {entries.length > shown.length && <p className="small muted">…and {entries.length - shown.length} more in the log (Empire tab).</p>}
          </div>
        )}
        {shown.length === 0 && <p className="small muted mt8">A quiet night.</p>}
        <button type="button" className="btn btn-primary mt12" style={{ width: '100%' }} onClick={closeRecap}>{pending ? `On to today (${pending} thing${pending === 1 ? '' : 's'} to deal with)` : `Start day ${w.day}`}</button>
      </div>
    </div>
  );
}
