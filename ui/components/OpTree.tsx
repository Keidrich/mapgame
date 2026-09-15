import { useMemo } from 'react';
import { select } from '@sim/index';
import type { OpKind } from '@sim/types';
import { OP_DEFS, OP_FAMILIES } from '@content/rackets';
import { fmtMoney } from '@ui/derive';
import { useWorld } from '@ui/store';
import { Info } from './Info';
import { Icon } from '@ui/icons';

/**
 * Every op in the game, laid out by tier, with the ones you cannot run yet shown locked
 * rather than hidden. Edges are drawn from `requires.priorOps`; the other requirement kinds
 * are badges on the node. A locked node's ? explains exactly what is missing, through the
 * same explainer component the glossary uses.
 */
export function OpTree({ selected, onPick }: { selected?: OpKind; onPick: (k: OpKind) => void }) {
  const w = useWorld();
  const rows = useMemo(() => {
    const byTier = new Map<number, OpKind[]>();
    for (const k of Object.keys(OP_DEFS) as OpKind[]) {
      const t = OP_DEFS[k].tier ?? 0;
      if (!byTier.has(t)) byTier.set(t, []);
      byTier.get(t)!.push(k);
    }
    // Inside a tier, the families sit together and lead the row. "Get Inside Their Business",
    // "Wire Fraud" and "Pull Their Wires" are one lane — get in, use it, switch them off — and
    // scattered among the street jobs by tier alone, nothing said so.
    for (const [, list] of byTier) {
      list.sort((a, b) => {
        const fa = OP_DEFS[a].family ?? '~'; const fb = OP_DEFS[b].family ?? '~';
        return fa === fb ? 0 : fa.localeCompare(fb);
      });
    }
    return [...byTier.entries()].sort((a, b) => a[0] - b[0]);
  }, []);
  const done = useMemo(() => new Set(Object.values(w.ops).filter(o => o.status === 'done').map(o => o.kind)), [w.ops]);

  return (
    <div className="optree">
      {rows.map(([tier, kinds], ri) => (
        <div key={tier} className="optier">
          <div className="optier-head">
            <span className="optier-n">{TIER_LABEL[tier] ?? `Tier ${tier}`}</span>
            {ri > 0 && <span className="optier-rule" />}
          </div>
          <div className="opgrid">
            {kinds.map(k => {
              const d = OP_DEFS[k];
              const why = select.opLocked(w, k);
              const prior = d.requires?.priorOps ?? [];
              const badges: string[] = [];
              if (d.requires?.crewCount) badges.push(`${d.requires.crewCount} crew`);
              if (d.requires?.safehouseTier) badges.push(`house T${d.requires.safehouseTier}`);
              if (d.requires?.businessOwned) badges.push('a place of yours');
              if (d.requires?.racketKinds?.length) badges.push('a racket');
              const fam = d.family ? OP_FAMILIES[d.family] : undefined;
              // the first node of a family in this tier carries the group heading
              const leads = !!d.family && kinds.findIndex(x => OP_DEFS[x].family === d.family) === kinds.indexOf(k);
              return (
                <div key={k} className={`opnode${why ? ' locked' : ''}${selected === k ? ' sel' : ''}${done.has(k) ? ' done' : ''}${fam ? ' opfam' : ''}`}>
                  {leads && fam && (
                    <div className="opfam-head">
                      <span className="opfam-n"><Icon name="relay_box" size={12} /> {fam.label}</span>
                      <Info title={fam.label} body={fam.blurb} className="opnode-q" />
                    </div>
                  )}
                  {prior.length > 0 && (
                    <div className="opedge" aria-hidden>
                      <span className="opedge-line" />
                      <span className="opedge-lbl">after {prior.map(p => OP_DEFS[p].label).join(' / ')}</span>
                    </div>
                  )}
                  <button type="button" className="opnode-btn" onClick={() => { if (!why) onPick(k); }} disabled={!!why} aria-label={d.label}>
                    <span className="ico">{why ? <Icon name="lock" size={19} /> : <Icon of="op" id={k} size={19} />}</span>
                    <b>{d.label}</b>
                    <span className="sub">{d.planDays}d · {d.minCrew === 0 ? 'solo ok' : `${d.minCrew}–${d.maxCrew} crew`}{d.cost ? ` · ${fmtMoney(d.cost)}` : ''}</span>
                    {(badges.length > 0 || fam) && (
                      <span className="opbadges">
                        {fam && <span className="opbadge fam">{fam.label}</span>}
                        {badges.map(b => <span key={b} className="opbadge">{b}</span>)}
                      </span>
                    )}
                  </button>
                  {why
                    ? <Info id="opLocked" title={`${d.label}: not yet`} body={why} note={d.blurb} className="opnode-q" />
                    : <Info title={d.label} body={d.blurb} note={`Difficulty ${d.difficulty}, heat +${select.opHeat(w, k)}.${done.has(k) ? ' You have pulled this off before.' : ''}`} className="opnode-q" />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const TIER_LABEL: Record<number, string> = {
  0: 'Street',
  1: 'Once you have something of your own',
  2: 'With a crew and a racket running',
  3: 'With a real safehouse',
  4: 'The big one',
};
