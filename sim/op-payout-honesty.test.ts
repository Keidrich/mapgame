/**
 * Every op, resolved, checking that the result card is not lying.
 *
 * This file exists because of a player report: *"I was supposed to get a payout from my rat and I
 * saw how much but I didn't actually receive the money."* Chasing that one op found nothing — and
 * then sweeping the whole roster found that **every op on the wire under-reported its heat by about
 * half**, because `cyberHeat()` calls `addHeat` from inside a case body and the result card only
 * ever knew about `res.heat`. `wire_fraud` printed **+11 while the bar moved 19.8**.
 *
 * It is the same failure the heat pass fixed for the ordinary path — "the number in the log is the
 * number that happened" — surviving in the one lane whose entire cost *is* heat, because the fix
 * was applied at one spot and the wire adds heat at another. One op at a time is how it hid; the
 * whole roster at once is how it was found, so that is what this holds.
 *
 * Deliberately not a snapshot of amounts: payouts roll, and pinning them would fail on every
 * balance change. The invariant is **agreement** — what the card says against what actually moved.
 */
import { describe, expect, it } from 'vitest';
import { OP_DEFS } from '@content/rackets';
import { dispatch, generateWorld, type Op, type OpKind, type World } from './index';
import { resolveOp } from './ops';
import { openIntel } from './intel';
import { Rng } from './rng';

const KINDS = Object.keys(OP_DEFS) as OpKind[];
/** Everything the player can be paid in that is money. The cache counts: it is still theirs. */
const purse = (w: World) => w.player.cash + w.player.dirty + (w.player.cache ?? 0);

function world(seed: number): World {
  let w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed });
  w.pendingEvents = []; w.day = 60;
  for (const what of ['unlock', 'reveal', 'rackets', 'own_block', 'safehouse'] as const) w = dispatch(w, { type: 'cheat', what } as never);
  w = dispatch(w, { type: 'cheat', what: 'cash', amount: 500_000 } as never);
  for (const p of Object.values(w.npcs).filter(x => x.alive && !x.crew && !x.official).slice(0, 6)) {
    p.crew = { loyalty: 80, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
    p.role = 'crew'; p.known = true; p.skills = { muscle: 8, brains: 8, charm: 8, wheels: 8, tech: 8 };
    w.player.crewIds.push(p.id);
  }
  // an arrangement in place, so the wire ops that read one have something to read
  const mark = Object.values(w.npcs).find(n => n.alive && !n.crew)!;
  mark.ratted = w.day - 1;
  openIntel(w, mark, new Rng(3));
  if (mark.intel) mark.intel.on = true;
  return w;
}
function targetFor(w: World, kind: OpKind): Partial<Op> {
  switch (OP_DEFS[kind].target) {
    case 'business': return { targetBusinessId: Object.values(w.businesses).find(b => !b.shut)?.id };
    case 'npc': return { targetNpcId: Object.values(w.npcs).find(n => n.alive && !n.crew)?.id };
    case 'block': return { targetBlockId: Object.keys(w.blocks)[0] };
    case 'faction': return { targetFactionId: Object.keys(w.factions)[0] };
    case 'district': return { targetDistrictId: Object.keys(w.districts)[0] };
    case 'case': return { targetCaseId: (w.cases ?? [])[0]?.id };
    default: return {};
  }
}
/** A rigged die: the first 1..100 draw is the op's own outcome roll. */
function rigged(seed: number, win: boolean): Rng {
  const rng = new Rng(seed); const real = rng.int.bind(rng); let first = true;
  rng.int = ((lo: number, hi: number) => { if (first && lo === 1 && hi === 100) { first = false; return win ? 1 : 100; } return real(lo, hi); }) as typeof rng.int;
  return rng;
}

interface Run { cardCash: number; gotCash: number; cardHeat: number; gotHeat: number; text: string; success: boolean }
/** One op, forced to an outcome, with what the card claimed and what the world did. */
function run(kind: OpKind, win: boolean, seed: number): Run | undefined {
  const w = world(seed * 17);
  const def = OP_DEFS[kind];
  const op = {
    id: `o-${kind}`, kind, status: 'ready', launched: true,
    crewIds: w.player.crewIds.slice(0, Math.max(def.minCrew, 1)),
    planDays: 0, daysLeft: 0, createdDay: w.day, ...targetFor(w, kind),
  } as Op;
  w.ops[op.id] = op; w.player.opIds.push(op.id);
  const cash0 = purse(w), heat0 = w.player.heat;
  resolveOp(w, op, rigged(seed * 31, win));
  let res = w.ops[op.id].result;
  if (!res) {
    // a tier-2 job can stop and ask; answer it the way a player would and let it finish
    const c = (w.confrontations ?? [])[0];
    if (c) dispatch(w, { type: 'resolve_confrontation', id: c.id, approach: 'fight' });
    res = w.ops[op.id].result;
  }
  if (!res) return undefined;
  return { cardCash: res.cash, gotCash: purse(w) - cash0, cardHeat: res.heat, gotHeat: w.player.heat - heat0, text: res.text, success: res.success };
}

describe('every op resolves at all', () => {
  it.each(KINDS)('%s finishes and leaves a result, win or lose', kind => {
    for (const win of [true, false]) expect(run(kind, win, 1), `${kind} ${win ? 'win' : 'lose'}`).toBeDefined();
  });
});

describe('the money on the card is the money in the purse', () => {
  it.each(KINDS)('%s pays what it says it paid', kind => {
    for (const win of [true, false]) {
      const r = run(kind, win, 1)!;
      // The reported bug, generalised: a card that names a figure the player never receives.
      expect(Math.abs(r.gotCash - r.cardCash), `${kind} ${win ? 'win' : 'lose'}: card $${r.cardCash}, purse moved $${Math.round(r.gotCash)}`).toBeLessThan(1);
    }
  });
});

describe('the heat on the card is the heat on the bar', () => {
  it.each(KINDS)('%s charges what it says it charges', kind => {
    for (const win of [true, false]) {
      const r = run(kind, win, 1)!;
      // Within a point and a half: `addHeat` rounds, and the bar clamps at 0 and 100.
      expect(Math.abs(r.gotHeat - r.cardHeat), `${kind} ${win ? 'win' : 'lose'}: card ${r.cardHeat}, bar moved ${r.gotHeat.toFixed(1)}`).toBeLessThan(1.5);
    }
  });

  it.each(KINDS)('%s reports a fall as a fall, never as a cheerful plus', kind => {
    // Some jobs take attention *off* you — `synth_identity` drops the bar by four, a frame moves it
    // onto somebody else — and the card used to clamp its own guess above zero and print "+2" while
    // the bar fell. Whether a given roll nets out negative depends on the job's own rating, so the
    // rule is stated as an implication rather than pinned to one op and one seed.
    for (const win of [true, false]) {
      const r = run(kind, win, 1)!;
      if (r.gotHeat < -0.5) expect(r.cardHeat, `${kind}: bar fell ${r.gotHeat.toFixed(1)} and the card said +${r.cardHeat}`).toBeLessThan(0);
    }
  });

  it('holds hardest on the wire, which is where it broke', () => {
    // Every one of these calls `cyberHeat` from inside its own case body, which is the heat the
    // card never used to see. If a new wire op is added and forgets, this is what says so.
    for (const kind of ['rat', 'wire_fraud', 'digital_strike', 'sim_swap', 'crypto_wash'] as OpKind[]) {
      const r = run(kind, true, 1)!;
      expect(Math.abs(r.gotHeat - r.cardHeat), `${kind}: card ${r.cardHeat}, bar moved ${r.gotHeat.toFixed(1)}`).toBeLessThan(1.5);
      expect(r.gotHeat, `${kind} put no heat on the bar at all`).toBeGreaterThan(0);
    }
  });
});

describe('a job that names money in its prose', () => {
  it.each(KINDS)('%s either pays what it names or says plainly that it is goods', kind => {
    for (const win of [true, false]) {
      const r = run(kind, win, 1)!;
      const named = r.text.match(/\$[\d,]+/);
      if (!r.success || !named || r.cardCash !== 0 || Math.abs(r.gotCash) >= 1) continue;
      // The two that legitimately pay in goods say so — "~$51,000 of hot goods. Fence them." — and
      // the `~` is doing real work: it marks an estimate of what a crate is worth rather than a
      // promise of cash. Anything else naming a figure it does not pay is the reported bug.
      expect(r.text, `${kind}: names ${named[0]} and pays nothing`).toMatch(/~\$|crates|hot goods|fence/i);
    }
  });
});
