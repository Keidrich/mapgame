/**
 * The record. Everything you did, according to things that were already written down.
 *
 * **No new state.** Every line below is computed from `w.log`, the ledgers `remember()` has been
 * filling since the standing pass, `w.ops`, `w.factions` and the counters the player object has
 * always carried. If a trophy is wrong, the fix is in whatever system stopped writing its line —
 * not here, and never a new field to track it.
 *
 * That constraint is what makes this worth having rather than a scoreboard: it can only report
 * what the game actually recorded at the time, so it reads like a file somebody kept on you.
 */
import { OP_DEFS } from '@content/rackets';
import { LANDMARKS } from '@content/landmarks';
import { notoriety } from './nemesis';
import { PLAYER, type World } from './types';

export interface Trophy {
  id: string;
  label: string;
  /** The answer, or undefined when it never happened — an empty row is part of the record too. */
  value?: string;
  /** When, for the ones that have a day. */
  day?: number;
  detail?: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function trophies(w: World): Trophy[] {
  const done = Object.values(w.ops).filter(o => o.status === 'done');
  const out: Trophy[] = [];

  // --- firsts, off the ops log
  const firstOp = done.slice().sort((a, b) => a.createdDay - b.createdDay)[0];
  out.push({ id: 'first_job', label: 'First job', value: firstOp && OP_DEFS[firstOp.kind].label, day: firstOp?.createdDay });

  const firstHit = done.filter(o => o.kind === 'hit').sort((a, b) => a.createdDay - b.createdDay)[0];
  out.push({ id: 'first_hit', label: 'First body', value: firstHit ? 'Somebody stopped being a problem' : undefined, day: firstHit?.createdDay });

  // --- biggest score, off the log lines the resolver already writes
  let best = 0, bestLine = '';
  for (const e of w.log) {
    const m = e.text.match(/\$([\d,]+)/g);
    if (!m || !/in the bag|goes clean|\bgot away\b|came out|^Moved|Bank Job|Count Room/i.test(e.text)) continue;
    for (const raw of m) {
      const n = Number(raw.replace(/[$,]/g, ''));
      if (n > best) { best = n; bestLine = e.text; }
    }
  }
  out.push({ id: 'biggest', label: 'Biggest score', value: best ? money(best) : undefined, detail: bestLine.slice(0, 120) || undefined });

  // --- the law
  out.push({ id: 'busts', label: 'Times they took you', value: w.player.busts ? String(w.player.busts) : 'Never' });
  const closest = w.log.filter(e => /^BUSTED\./.test(e.text)).slice(-1)[0];
  out.push({ id: 'closest', label: 'Closest call', value: closest ? 'The task force came through everything at once' : undefined, day: closest?.day });

  // --- outfits
  const gone = Object.values(w.factions).filter(f => f.defeatedDay);
  out.push({ id: 'destroyed', label: 'Outfits finished', value: String(gone.filter(f => f.defeatedBy === PLAYER).length), detail: gone.length ? gone.map(f => f.short).join(', ') : undefined });

  // --- people
  const worst = Object.values(w.npcs).filter(n => n.nemesis).sort((a, b) => notoriety(b) - notoriety(a))[0];
  out.push({ id: 'nemesis', label: 'Worst enemy', value: worst && notoriety(worst) >= 20 ? worst.name : undefined, detail: worst && notoriety(worst) >= 20 ? `Had the better of you ${worst.nemesis!.wins} time${worst.nemesis!.wins === 1 ? '' : 's'}` : undefined });
  out.push({ id: 'crew', label: 'People who worked for you', value: String(w.player.crewEver) });
  const lost = Object.values(w.npcs).filter(n => !n.alive && n.crew?.status === 'dead').length;
  out.push({ id: 'lost', label: 'People you lost', value: lost ? String(lost) : 'None' });

  // --- the ledger: the single longest history with anybody
  const longest = Object.values(w.npcs).filter(n => n.ledger?.length).sort((a, b) => (b.ledger!.length) - (a.ledger!.length))[0];
  out.push({ id: 'oldest', label: 'Longest history', value: longest?.name, detail: longest ? `${longest.ledger!.length} things between you, going back to day ${longest.ledger![0].day}` : undefined });

  // --- reach
  out.push({ id: 'landmarks', label: 'Landmarks worked', value: String(LANDMARKS.filter(l => done.some(o => o.kind === l.op)).length) + ` of ${LANDMARKS.length}` });
  out.push({ id: 'kinds', label: 'Kinds of job pulled', value: `${new Set(done.map(o => o.kind)).size} of ${Object.keys(OP_DEFS).length}` });
  out.push({ id: 'name', label: 'What they call you', value: w.player.street ? `"${w.player.street}"` : undefined });
  if (w.player.succeededFrom?.length) out.push({ id: 'line', label: 'You took over from', value: w.player.succeededFrom.join(', ') });

  return out;
}
