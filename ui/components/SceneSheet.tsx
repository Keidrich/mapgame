import { select, type TalkMove } from '@sim/index';
import { TRAIT_LABELS } from '@content/rackets';
import { act, check, useWorld } from '@ui/store';
import { fmtMoney, initials } from '@ui/derive';
import { Info, Term, TermChip } from './Info';
import { LedgerPanel } from './Ledger';
import { Icon } from '@ui/icons';

/**
 * A conversation.
 *
 * It used to be one screen: their opening line, three approaches, a result. Now it is a short
 * sequence — you can spend a beat dropping a name you both know, or bringing up something out of
 * your history with them, before you ask for anything. Those do not end the conversation; they
 * change the odds on whatever you close with.
 *
 * The conversation itself lives on the world, queued on the confrontation list, so this component
 * holds no state of its own: everything on screen is read back out of the sim, including the
 * reply to the last thing the player said.
 */
export function SceneSheet() {
  const w = useWorld();
  const c = select.activeConfrontation(w);
  if (!c || c.kind !== 'talk' || !c.npcId) return null;
  const n = w.npcs[c.npcId]; if (!n) return null;
  const t = c.talk!;
  const biz = t.businessId ? w.businesses[t.businessId] : undefined;
  // Ask the reducer's own gate what each move would do, rather than guessing here. A closing
  // approach runs the scene it came from, so `resolve_confrontation` already delegates to that
  // scene's rules — which means the menu and the door into this conversation are now asking the
  // identical question. Before this, every approach rendered live and two of a recruit's three
  // would refuse on tap; a player who got in on the strength of a wage still saw "Sell the dream"
  // looking perfectly available.
  const options = (select.confrontOptions(w, c) as unknown as TalkOpt[]).map(o => {
    if (o.disabled) return o;
    const why = check({ type: 'resolve_confrontation', id: c.id, approach: o.id });
    return why.ok ? o : { ...o, disabled: why.reason };
  });
  const openers = options.filter(o => !o.closes);
  const closers = options.filter(o => o.closes && o.id !== 'leave');
  const answer = (id: TalkMove) => act({ type: 'resolve_confrontation', id: c.id, approach: id });

  return (
    <div className="modal-backdrop scene-backdrop" role="dialog" aria-modal="true" aria-labelledby="scene-title">
      <div className="modal scene">
        <div className="scene-head">
          <div className="avatar big">{initials(n.name)}</div>
          <div className="grow">
            <h2 id="scene-title">{n.name}</h2>
            <div className="small muted">{n.role === 'owner' && biz ? `Runs ${biz.name}` : n.role}</div>
            <div className="chips mt4">{n.traits.map(x => <TermChip key={x} id={`trait:${x}`}>{TRAIT_LABELS[x] ?? x}</TermChip>)}</div>
            <div className="small muted mt4"><Term id="trust">Trust</Term> {Math.round(n.rel.trust)} · <Term id="npcfear">Fear</Term> {Math.round(n.rel.fear)} · <Term id="nerve">Nerve</Term> {n.nerve}</div>
          </div>
        </div>

        <p className="scene-line">{c.text}</p>
        {t.reply && <p className="scene-line" style={{ borderLeftColor: t.bonus >= 0 ? 'var(--green)' : 'var(--red)' }}>{t.reply}</p>}
        {t.bonus !== 0 && (
          <p className="tiny" style={{ color: t.bonus > 0 ? 'var(--green)' : 'var(--red)' }}>
            {t.bonus > 0 ? `They are warmer than when you walked in: +${t.bonus} on whatever you ask.` : `That went badly: ${t.bonus} on whatever you ask.`}
          </p>
        )}

        {openers.length > 0 && (
          <>
            <div className="row between mb8 mt8"><span className="tiny muted">Before you ask<Info id="conversation" /> — worth a moment, and it can backfire</span></div>
            <div className="col">{openers.map(o => <Move key={o.id} o={o} onPick={answer} />)}</div>
          </>
        )}

        <div className="row between mb8 mt8"><span className="tiny muted">What you came for<Info id="odds" /></span></div>
        <div className="col">{closers.map(o => <Move key={o.id} o={o} onPick={answer} />)}</div>

        <LedgerPanel npcId={n.id} collapsed />
        <button type="button" className="btn btn-ghost btn-block mt8" onClick={() => answer('leave')}>Leave it</button>
      </div>
    </div>
  );
}

interface TalkOpt { id: TalkMove; label: string; icon: string; blurb: string; good: string; bad: string; chance: number; closes: boolean; costCash?: number; disabled?: string }

function Move({ o, onPick }: { o: TalkOpt; onPick: (id: TalkMove) => void }) {
  return (
    <button type="button" className="opt scene-opt" disabled={!!o.disabled} onClick={() => onPick(o.id)}>
      <span className="lbl"><Icon name={o.icon} size={14} /> {o.label} <span className={`odds ${o.chance >= 65 ? 'good' : o.chance >= 40 ? 'mid' : 'bad'}`}>{o.chance}%</span></span>
      <span className="det">{o.blurb}</span>
      <span className="stakes"><b className="green"><Icon name="check" size={11} /> {o.good}</b> <b className="red"><Icon name="cross" size={11} /> {o.bad}</b></span>
      {(o.disabled || o.costCash) && <span className="cst">{o.disabled ?? fmtMoney(o.costCash!)}</span>}
    </button>
  );
}
