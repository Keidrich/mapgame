/**
 * The dead time between decisions.
 *
 * Walking across the city costs legwork and produces one line: "You walk from J8 to K7." That is
 * most of a turn, every turn, for the whole game. These are the small things that happen on the
 * way — rare enough that they stay small, varied enough that the walk stops being a loading bar.
 *
 * Deliberately **not** a second event deck. `sim/events.ts` draws a card at End Day and asks the
 * player to decide something; these resolve themselves as you pass, and the most any of them does
 * is move a number you already have or leave a name in your pocket. If one of these ever needs a
 * modal it belongs in the event deck instead.
 */
import { CARD_STALE_AT } from '@content/events';
import { remember } from './ledger';
import { connectionsOf } from './connections';
import { hunters } from './legacy';
import type { Rng } from './rng';
import { PLAYER, type Block, type Npc, type World } from './types';
import { addHeat, adjustRel, heatNote, log, money } from './util';

/** Chance per move. Low on purpose: this is texture, and texture that fires often is noise. */
export const ENCOUNTER_CHANCE = 0.13;

type Encounter = { weight: number; run: (w: World, b: Block, rng: Rng) => boolean };

/** Somebody the player actually knows, on this block or connected to somebody on it. */
function familiarFace(w: World, b: Block, rng: Rng): Npc | undefined {
  const here = b.businessIds.flatMap(id => w.businesses[id]?.patronIds ?? []).map(id => w.npcs[id]).filter(Boolean);
  const known = here.filter(n => n.alive && n.known && !n.crew);
  return known.length ? rng.pick(known) : undefined;
}

const TABLE: Encounter[] = [
  // --- an old contact, which is the one that makes the city feel inhabited
  { weight: 4, run: (w, b, rng) => {
    const n = familiarFace(w, b, rng); if (!n) return false;
    adjustRel(w, n, { trust: 2 });
    remember(w, n, 'talk', 'Ran into you on the street. Nothing in it; they were glad to see you.');
    log(w, `${n.name} is coming the other way and stops to talk for a minute. Nothing in it. (+2 trust)`, 'info', { npcId: n.id, blockId: b.id });
    return true;
  } },
  // --- a tip: somebody tells you something true about a place near here
  { weight: 3, run: (w, b, rng) => {
    const n = familiarFace(w, b, rng); if (!n) return false;
    const biz = b.businessIds.map(id => w.businesses[id]).filter(x => x && !x.shut && x.ownedBy === 'npc')[0];
    if (!biz) return false;
    biz.casedUntil = Math.max(biz.casedUntil ?? 0, w.day + 3);
    remember(w, n, 'intel', `Told you what they had noticed about ${biz.name}.`);
    log(w, `${n.name} mentions, without being asked, when ${biz.name} is empty and who has the keys. You will remember that. (cased, 3 days)`, 'good', { npcId: n.id, businessId: biz.id, blockId: b.id });
    return true;
  } },
  // --- something on the pavement. Small, and it is the only one that is simply good luck
  { weight: 2, run: (w, b, rng) => {
    const found = rng.int(40, 220);
    w.player.dirty += found;
    log(w, `Somebody dropped a roll outside the shops and did not come back for it. ${money(found)}.`, 'money', { blockId: b.id });
    return true;
  } },
  // --- a near miss with somebody who wants you
  { weight: 3, run: (w, b, rng) => {
    const them = hunters(w)[0] ?? Object.values(w.npcs).find(n => n.alive && n.faction && n.faction !== PLAYER && n.role === 'lieutenant');
    if (!them) return false;
    if (rng.chance(0.5)) {
      const h = addHeat(w, 2, b.id);
      log(w, `A car you have seen before goes past twice. You are in a doorway before the second pass, and it keeps going.${heatNote(h)}`, 'warn', { npcId: them.id, blockId: b.id });
    } else {
      adjustRel(w, them, { fear: 2 }, 'backed');
      log(w, `${them.name} is on the other side of the street. Neither of you does anything. Everybody on the pavement can feel it.`, 'warn', { npcId: them.id, blockId: b.id });
    }
    return true;
  } },
  // --- somebody's cousin, which is the connections graph turning up in the street
  { weight: 2, run: (w, b, rng) => {
    const n = familiarFace(w, b, rng); if (!n) return false;
    const tie = connectionsOf(w, n)[0]; if (!tie) return false;
    tie.npc.known = true;
    if (tie.npc.rel.metDay === undefined) tie.npc.rel.metDay = w.day;
    remember(w, tie.npc, 'met', `${n.name} introduced you on the street.`);
    log(w, `${n.name} is with somebody. "This is ${tie.npc.name}, my ${tie.label}." Now you have met.`, 'info', { npcId: tie.npc.id, blockId: b.id });
    return true;
  } },
  // --- the law, looking at you and not stopping
  { weight: 2, run: (w, b) => {
    if (w.player.heat < 25) return false;
    const h = addHeat(w, 1, b.id);
    log(w, `A patrol car slows right down, has a good look at you, and carries on. Somebody wrote something down.${heatNote(h)}`, 'warn', { blockId: b.id });
    return true;
  } },
];

/**
 * One move across the city. Returns whether anything happened, so the caller can say so.
 *
 * Every entry may decline — there is nobody on this block worth meeting, the player is not hot
 * enough to be looked at — and a decline rolls on, so a quiet corner is quiet rather than
 * producing whatever the table's fallback would have been.
 */
export function onTheWay(w: World, blockId: string, rng: Rng): boolean {
  const b = w.blocks[blockId]; if (!b) return false;
  if (w.gameOver || !rng.chance(ENCOUNTER_CHANCE)) return false;
  const pool = TABLE.flatMap(e => Array<Encounter>(e.weight).fill(e));
  for (let tries = 0; tries < 4; tries++) {
    const pick = rng.pick(pool);
    if (pick.run(w, b, rng)) return true;
  }
  return false;
}
void CARD_STALE_AT;
