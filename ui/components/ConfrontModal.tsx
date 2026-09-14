import { select } from '@sim/index';
import { OP_DEFS } from '@content/rackets';
import { act, useWorld } from '@ui/store';
import { Info } from './Info';

/**
 * Somebody is in front of you. Nothing else happens until this is answered — and if the day
 * ends without an answer, it lands exactly as it would have before any of this existed.
 *
 * The odds shown are the odds used: `select.confrontChance` is what the reducer rolls against,
 * and it reads the kit you are carrying the same way an op does.
 */
export function ConfrontModal() {
  const w = useWorld();
  const c = select.activeConfrontation(w);
  // a conversation is the same queue entry with a different face: `SceneSheet` renders those
  if (!c || c.kind === 'talk') return null;
  const f = w.factions[c.factionId];
  const options = select.confrontOptions(w, c);
  const carried = select.equippedItems(w);
  // a complication is the same modal with a different heading: it is a job going wrong, not
  // somebody at your door, and the op it belongs to is what is at stake
  const op = c.kind === 'op' && c.opId ? w.ops[c.opId] : undefined;
  const title = op ? `${OP_DEFS[op.kind].icon} ${OP_DEFS[op.kind].label} — mid-job` : `⚠️ ${f?.name ?? 'Somebody'}${c.war ? ' — this is war' : ''}`;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confrontation">
      <div className="modal scene" style={{ borderColor: 'var(--red)' }}>
        <div className="row between">
          <b style={{ fontSize: 17, color: 'var(--red)' }}>{title}</b>
          <Info id={op ? 'complication' : 'confrontation'} />
        </div>
        <p className="mt8">{c.text}</p>
        {carried.length > 0 && (
          <p className="small muted">You are carrying {carried.map(i => `${i.icon} ${i.label}`).join(', ')}.</p>
        )}
        <div className="col mt8">
          {options.map(o => (
            <button type="button" key={o.id} className="opt" disabled={!!o.disabled} onClick={() => act({ type: 'resolve_confrontation', id: c.id, approach: o.id })}>
              <span className="lbl">{o.icon} {o.label} <span className="odds" style={{ float: 'right' }}>{o.chance}%</span></span>
              <span className="det">{o.blurb}</span>
              <span className="stakes"><b className="green">✓ {o.good}</b> <b className="red">✗ {o.bad}</b></span>
              {o.disabled && <span className="cst">{o.disabled}</span>}
            </button>
          ))}
        </div>
        <p className="tiny muted mt8">{op ? 'Leave it until End Day and the crew decide for themselves. That goes worse than any answer here.' : 'Leave it until End Day and they do what they came to do.'}</p>
      </div>
    </div>
  );
}
