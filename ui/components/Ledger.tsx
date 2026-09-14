import { useState } from 'react';
import { select } from '@sim/index';
import type { LedgerEntry } from '@sim/types';
import { useWorld } from '@ui/store';
import { Term, TermChip } from './Info';
import { Icon } from '@ui/icons';

/**
 * Everything that has passed between you and one person, on one screen.
 *
 * Deliberately one component for everybody. A shopkeeper you have been shaking down and a
 * lieutenant running a district for you have the same *kind* of history with the player — facts
 * you established, things that happened, what each of you owes the other — and the only
 * difference is what is in it. Building a separate screen for crew would have meant maintaining
 * the same thing twice and having them drift, so `dossier()` assembles both and the crew rows
 * simply do not appear for somebody who is not crew.
 *
 * It reads; it never decides. Every number here is the one the sim uses.
 */
export function LedgerPanel({ npcId, collapsed = false }: { npcId: string; collapsed?: boolean }) {
  const w = useWorld();
  const [open, setOpen] = useState(!collapsed);
  const n = w.npcs[npcId]; if (!n) return null;
  const d = select.dossier(w, n);

  return (
    <div className="brief mt12">
      <button type="button" className="row between" style={{ width: '100%', background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <b className="small"><Icon name="accountant" size={13} /> <Term id="ledger">Your history</Term> with {n.name}</b>
        <span className="chip">{open ? '−' : `${d.history.length}`}</span>
      </button>
      {open && (
        <>
          <div className="chips mt8">
            {d.theyOwe > 0 && <TermChip id="favour" tone="var(--green)">They owe you {d.theyOwe === 1 ? 'a favour' : `${d.theyOwe} favours`}</TermChip>}
            {d.youOwe > 0 && <TermChip id="favour" tone="var(--orange)">You owe them {d.youOwe === 1 ? 'one' : String(d.youOwe)}</TermChip>}
            {d.hold && <TermChip id="hold" tone="var(--gold)" note={d.hold.why}>You have a hold</TermChip>}
            {d.theyOwe === 0 && d.youOwe === 0 && !d.hold && <span className="chip muted">Nothing owed either way</span>}
          </div>

          <dl className="kv mt8">
            {d.facts.map((f, i) => (
              <span key={i} style={{ display: 'contents' }}>
                <dt>{f.label}</dt>
                <dd className={f.tone === 'good' ? 'green' : f.tone === 'bad' ? 'orange' : undefined}>{f.value}</dd>
              </span>
            ))}
          </dl>

          <div className="section-title">What has happened</div>
          {d.blank
            ? <p className="small muted">Nothing yet. Deal with them and this fills up — what you did, what they did, and what each of you owes the other.</p>
            : <div className="log">{d.history.map((e, i) => <Line key={i} e={e} />)}</div>}
          <p className="tiny muted mt8">Only the last {select.LEDGER_MAX} things are kept. <Term id="familiarity">How well you know somebody</Term> and <Term id="favour">what they owe you</Term> are what a real ask is weighed against.</p>
        </>
      )}
    </div>
  );
}

const TONE: Record<string, string> = { favour: 'good', deal: 'good', intel: 'good', owed: 'warn', threat: 'warn', harm: 'bad', door: 'bad' };
/** One drawing per kind of line in a dossier, so a page of history can be skimmed by shape. */
const ICON: Record<string, string> = { met: 'crew', read: 'watching', favour: 'gift', owed: 'link', threat: 'intimidate', harm: 'war_strike', deal: 'collect', talk: 'social', intel: 'rat', door: 'warn' };

function Line({ e }: { e: LedgerEntry }) {
  return (
    <div className={`logline ${TONE[e.kind] ?? 'info'}`}>
      <span className="d">D{e.day}</span>
      <span className="row" style={{ alignItems: 'flex-start', gap: 6 }}><Icon name={ICON[e.kind] ?? 'routine'} size={13} style={{ marginTop: 2 }} /> {e.text}</span>
    </div>
  );
}
