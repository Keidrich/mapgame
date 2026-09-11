import { act, check, focus, useWorld } from '@ui/store';
import { fmtMoney } from '@ui/derive';

/** Blocks the screen until the first pending event is resolved. */
export function EventModal() {
  const w = useWorld();
  const ev = w.pendingEvents[0];
  if (!ev) return null;
  const refName = ev.refs.businessId ? w.businesses[ev.refs.businessId]?.name : ev.refs.blockId ? w.blocks[ev.refs.blockId]?.name : ev.refs.npcId ? w.npcs[ev.refs.npcId]?.name : undefined;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ev-title">
      <div className="modal">
        <div className="event-kind">Day {ev.day} · {ev.kind.replace(/_/g, ' ')}{w.pendingEvents.length > 1 && ` · ${w.pendingEvents.length} pending`}</div>
        <h2 id="ev-title">{ev.title}</h2>
        <p className="event-text">{ev.text}</p>
        {refName && <p className="small muted mb8">Concerns: <button type="button" className="chip btn" onClick={() => focus(ev.refs)}>{refName}</button></p>}
        {ev.options.map(o => {
          const action = { type: 'resolve_event' as const, eventId: ev.id, optionId: o.id };
          const a = check(action);
          const costs = [o.costAp ? `${o.costAp} AP` : '', o.costCash ? fmtMoney(o.costCash) : ''].filter(Boolean).join(' · ');
          return (
            <button type="button" key={o.id} className="opt" disabled={!a.ok} onClick={() => act(action)}>
              <span className="lbl">{o.label}</span>
              {o.detail && <span className="det">{o.detail}</span>}
              {costs && <span className="cst">Costs {costs}</span>}
              {!a.ok && <span className="cst">{a.reason}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
