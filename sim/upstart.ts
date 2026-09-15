/**
 * Somebody else starting from nothing, at the same time as you.
 *
 * Every other outfit in the city is already what it is going to be: the Delgados have sixteen
 * blocks on day one and sixteen-ish blocks on day two hundred, and taking them apart is a siege.
 * This is the other shape — a **race**. One person, one corner, no soldiers, and a growth curve
 * that runs whether the player is looking or not.
 *
 * It is a `Faction` and not a new kind of thing, so every system in the game — stance, standing,
 * confrontations, the Commission, `checkDefeated`, the relationship web — reads it without
 * knowing it is special. What is special is only the *curve*: it starts far below everybody and
 * compounds, so where the established families are a wall, this is a clock.
 *
 * The competition is real rather than thematic: `pushNext` takes the block the **player** is most
 * likely to want next — the one they have influence on but have not closed — so the two of you
 * are reaching for the same things at the same time.
 */
import { FACTION_ARCHETYPES } from '@content/names';
import { addInfluence, clamp, factionOf, log, nid } from './util';
import { mkNpc } from './populate';
import type { Rng } from './rng';
import { PLAYER, type Faction, type World } from './types';

export const UPSTART = {
  /** Day they show up. Late enough that the player has a shape, early enough to race them. */
  startDay: 12,
  /** What they open with. One man and a corner. */
  soldiers: 1,
  cash: 2_200,
  /**
   * Compounding growth per day, applied to cash — this is the whole difference from a family.
   *
   * 0.02 and not more. At 0.055 they had eleven soldiers by day 22, which is not an upstart, it
   * is a third family arriving fully formed a fortnight late. The curve has to be visible across
   * a *game*, not across a fortnight.
   */
  growth: 0.02,
  /** …and what they spend it on, which is what makes the curve visible on the map. */
  soldierCost: 1_800,
  /**
   * What a corner is worth to them, per day. Comfortably above a soldier's 60 a day in wages —
   * taking ground has to make them stronger, which is the entire mechanism of a race.
   */
  perBlock: 220,
  /** How often they take a run at a block. Rises with soldiers, so the curve accelerates. */
  pushEvery: 6,
  /** Soldiers at which they stop being an upstart and are simply another outfit. */
  arrived: 12,
  /**
   * Days of wages they keep back before hiring anybody else.
   *
   * Without this they spent every penny on soldiers, could not make payroll, and went cash
   * negative within a month — at which point the ordinary bled-out rule finished them. An outfit
   * that cannot pay the people it just hired is not growing.
   */
  wageDays: 12,
  /** Soldiers at which somebody is made second. Before this, one bullet ends the whole thing. */
  secondAt: 4,
};

/** The one upstart, if there is one yet. */
export function upstart(w: World): Faction | undefined {
  const id = w.upstartId;
  const f = id ? w.factions[id] : undefined;
  return f?.alive ? f : undefined;
}

/** Have they stopped being a curiosity? Read by the UI for the line it puts on their card. */
export const hasArrived = (f: Faction): boolean => f.soldiers >= UPSTART.arrived;

/**
 * Put them on the board: one person, one block, and nothing else.
 *
 * Deliberately on ground nobody holds rather than carved out of an existing family — the point
 * is somebody starting the way the player started, not a fourth established outfit.
 */
export function spawnUpstart(w: World, rng: Rng): Faction | undefined {
  if (w.upstartId) return undefined;
  const open = Object.values(w.blocks).filter(b => !factionOf(w, b.id) && !b.abandoned);
  const home = open.length ? rng.pick(open) : rng.pick(Object.values(w.blocks));
  const arch = rng.pick(FACTION_ARCHETYPES);
  const boss = mkNpc(rng, w, p => nid(w, p), { role: 'boss', homeBlockId: home.id, nerveBias: 70 });
  const id = nid(w, 'f');
  const f: Faction = {
    id, name: `${boss.name.split(' ').slice(-1)[0]}'s people`, short: boss.name.split(' ').slice(-1)[0],
    color: '#c77dff', temperament: 'aggressive', homeDistrictId: w.blocks[home.id].districtId,
    bossId: boss.id, lieutenantIds: [], soldiers: UPSTART.soldiers, cash: UPSTART.cash,
    standing: {}, stance: {}, truceUntil: {}, tributeFrom: {}, alive: true, grudges: [], brokenTruces: 0,
  };
  boss.faction = id;
  for (const other of Object.values(w.factions)) {
    f.standing[other.id] = other.standing[id] = -10;   // nobody likes a new face
    f.stance[other.id] = other.stance[id] = 'tension';
  }
  f.standing[PLAYER] = 0; f.stance[PLAYER] = 'peace';
  w.factions[id] = f;
  w.upstartId = id;
  addInfluence(w, home.id, id, 45);
  void arch;
  log(w, `Somebody nobody had heard of took ${w.blocks[home.id].name} this week. ${boss.name}, apparently, and one other man. Everybody says it will not last.`, 'info', { factionId: id, blockId: home.id });
  return f;
}

/**
 * Their day. Compounding money into soldiers into ground, and the ground they reach for is the
 * ground the player is halfway to — which is what makes this a race rather than scenery.
 */
export function tickUpstart(w: World, rng: Rng): void {
  if (w.day >= UPSTART.startDay && !w.upstartId) { spawnUpstart(w, rng); return; }
  const f = upstart(w); if (!f) return;

  // The curve. Ground pays, and what is in the bank compounds — small, then not small.
  //
  // `perBlock` has to clear a soldier's wages or the whole thing is a slow-motion collapse: the
  // first version paid 80 a block against 60 a man a day, so every corner they took made them
  // poorer, they could not make payroll, and `runFaction` shed a soldier a week until there was
  // one man left. An outfit whose growth makes it weaker is not an upstart.
  //
  // And only *positive* cash compounds. Compounding a negative balance is a debt spiral with
  // extra steps, and it was digging them deeper every day they were already behind.
  const held = Object.values(w.blocks).filter(b => factionOf(w, b.id) === f.id).length;
  f.cash += Math.round(UPSTART.perBlock * held + Math.max(0, f.cash) * UPSTART.growth);
  // …and they keep the payroll back. See `wageDays`.
  const reserve = f.soldiers * 60 * UPSTART.wageDays;
  while (f.cash - UPSTART.soldierCost >= reserve && f.soldiers < 40) { f.cash -= UPSTART.soldierCost; f.soldiers++; }

  // Somebody is made second as soon as there is anybody to make. An outfit whose only named
  // person is the boss dies outright the first time `bossChurn` takes him — which is what was
  // happening by day 40 in every seed, and is not a growth curve, it is a coin flip.
  if (f.soldiers >= UPSTART.secondAt && !f.lieutenantIds.some(id => w.npcs[id]?.alive)) {
    const lt = mkNpc(rng, w, p => nid(w, p), { role: 'lieutenant', homeBlockId: w.npcs[f.bossId]?.homeBlockId, nerveBias: 60 });
    lt.faction = f.id; f.lieutenantIds = [...f.lieutenantIds, lt.id];
    log(w, `${f.short} have a second man now. ${lt.name}, and nobody has heard of him either.`, 'info', { factionId: f.id, npcId: lt.id });
  }

  if (w.day % Math.max(2, UPSTART.pushEvery - Math.floor(f.soldiers / 4)) !== 0) return;
  pushNext(w, f, rng);
}

/** The block they go for: whatever the player is closest to taking and has not taken. */
function pushNext(w: World, f: Faction, rng: Rng): void {
  const contested = Object.values(w.blocks)
    .filter(b => factionOf(w, b.id) !== f.id)
    .map(b => ({ b, mine: b.influence[PLAYER] ?? 0, theirs: b.influence[f.id] ?? 0 }))
    .filter(x => x.mine > 0 && factionOf(w, x.b.id) !== PLAYER)
    .sort((a, b) => b.mine - a.mine);
  const target = contested[0]?.b
    ?? rng.pick(Object.values(w.blocks).filter(b => !factionOf(w, b.id)) .length
      ? Object.values(w.blocks).filter(b => !factionOf(w, b.id))
      : Object.values(w.blocks));
  const before = factionOf(w, target.id);
  addInfluence(w, target.id, f.id, 6 + Math.round(f.soldiers / 2));
  if (before === PLAYER) addInfluence(w, target.id, PLAYER, -4);
  const now = factionOf(w, target.id);
  if (now === f.id && before !== f.id) {
    log(w, `${f.short} have ${target.name} now. They did not have anything a month ago.`, 'warn', { factionId: f.id, blockId: target.id });
  }
  void clamp;
}
