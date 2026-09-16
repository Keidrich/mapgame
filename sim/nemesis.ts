/**
 * The lieutenant who keeps turning up, and what that makes of them.
 *
 * Nothing here is a parallel system. The history is `sim/ledger.ts` — `remember()`, the same
 * logger a shopkeeper's sheet uses, because a lieutenant and a shopkeeper have the same *kind* of
 * history with the player. The magnitude is `content/standing.ts` — a win is worth what it cost
 * to win, through the same `STAKES` table that decides how much fear an act buys. The chair is
 * `sim/politics.ts` — the succession crisis that already existed, with notoriety on the scale.
 * The defection is `sim/agendas.ts` and `doFavour` — the concession gate every other big ask
 * goes through.
 *
 * The one genuinely new thing is `Npc.nemesis`, and it holds one number.
 */
import { FEARED_NAMES, KNOWN_NAMES, MILESTONES, NEMESIS, RESPECTED_NAMES, STREET_NAME } from '@content/nemesis';
import { STAKES, type Stake } from '@content/standing';
import { remember } from './ledger';
import { connectionsOf } from './connections';
import type { Rng } from './rng';
import { hashString } from './rng';
import { PLAYER, type Faction, type Id, type Nemesis, type Npc, type World } from './types';
import { clamp, log } from './util';

/**
 * Their working name. A nickname earned against you **replaces** the given one everywhere.
 *
 * Replaces, not adds. `populate.ts` gives every boss and every lieutenant a nickname at
 * generation (`First "Moose" Last`), and a nemesis is always a lieutenant — so this inserted a
 * second one next to the first on *every* nemesis that ever reached the `named` milestone:
 * `Cassandra "the Nail" "Moose" Booker`. Strip whatever is already in quotes, then insert.
 */
const GIVEN_NICKNAME = /\s*"[^"]*"\s*/;
/**
 * Put an earned name on somebody, in place of whatever they were called before. One function,
 * because the player earns one of these the same way a lieutenant does and there is no reason
 * for two implementations of "what are they called now" to drift apart.
 */
export function withNickname(name: string, nick?: string): string {
  if (!nick) return name;
  const parts = name.replace(GIVEN_NICKNAME, ' ').trim().split(' ');
  return `${parts[0]} "${nick}" ${parts.slice(1).join(' ')}`.trim();
}
export function nemesisName(n: Npc): string { return withNickname(n.name, n.nemesis?.nickname); }

// ---------------------------------------------------------------- and the other direction
/**
 * What the street calls the player. `w.player.street` once they have earned one, their given
 * name until then — and every caller that already reads `select.factionName(w, PLAYER)` gets it
 * without knowing this exists, which is the same trick `nemesisName` plays on the log.
 */
export function playerName(w: World): string { return withNickname(w.player.name, w.player.street); }

/**
 * Have they crossed the line, and what does that make them? Called once a day from the tick.
 *
 * Deterministic from the name, not from a roll, for the same reason the lieutenant's is: a replay
 * of the same seed has to produce the same city, and a street name is part of the city.
 */
export function earnStreetName(w: World): void {
  const p = w.player;
  if (p.street) return;
  if (Math.max(p.fear, p.respect) < STREET_NAME.at) return;
  giveStreetName(w);
}

/**
 * The naming itself, without the threshold in front of it.
 *
 * Split out for the admin panel. Reputation was the one prerequisite in the game with no entry
 * there, so neither a person poking at the build nor the soak bot could reach the reputation
 * opener on purpose — the bot got there only when a war happened to run its fear to 99, which
 * left a coverage row riding on the rng stream. The obvious cheat, "add 60 fear", turned out to
 * rewrite the run around itself: a player everybody is already terrified of never has to go back
 * to anybody, so the bot spent its whole day on strangers and the *history* opener went dark on
 * every seed. Handing over the name alone changes nothing else, which is what a setup cheat is
 * supposed to do. The pool still comes from whatever fear and respect actually are.
 */
export function giveStreetName(w: World): void {
  const p = w.player;
  const pool = p.fear - p.respect >= STREET_NAME.margin ? FEARED_NAMES
    : p.respect - p.fear >= STREET_NAME.margin ? RESPECTED_NAMES
    : KNOWN_NAMES;
  p.street = pool[hashString(p.name + p.background) % pool.length];
  log(w, `Somebody says it to your face and it sticks: they call you ${p.street} now. Nobody asked what was on your birth certificate.`, 'good');
}

/**
 * Somebody the city knows. **Stature, not acquaintance** — this is what the street has decided
 * about them, and it survives a succession because the street does not forget a man when the man
 * he beat dies.
 */
export function isNemesis(n: Npc | undefined): boolean { return !!n?.nemesis && n.nemesis.notoriety >= NEMESIS.known; }
export function notoriety(n: Npc | undefined): number { return n?.nemesis?.notoriety ?? 0; }

/**
 * Whether they have any history with the protagonist **currently holding the controls**.
 *
 * The other half of the split. `isNemesis` asks what the city thinks of them; this asks whether
 * they have ever been in a room with *you*. Before a succession the two always agree, which is why
 * nothing needed to ask the question until now.
 *
 * Read by the dialogue — somebody with a record does not open by counting your meetings when he
 * has not had any with you — and by anything else that wants to speak as though you have met.
 * Defaults to the whole record when `met` is absent, so an old save behaves exactly as it did.
 */
export function knowsYou(n: Npc | undefined): boolean {
  const s = n?.nemesis; if (!s) return false;
  return (s.met ?? s.wins + s.losses) > 0;
}

function start(w: World, n: Npc): Nemesis {
  if (!n.nemesis) n.nemesis = { since: w.day, wins: 0, losses: 0, notoriety: 0, earned: [] };
  return n.nemesis;
}

/** Whoever is actually leading a faction's move on the player today. */
export function leaderFor(w: World, f: Faction, rng: Rng): Npc | undefined {
  const lts = f.lieutenantIds.map(id => w.npcs[id]).filter(n => n?.alive);
  if (!lts.length) return undefined;
  // somebody who already has history with the player is far more likely to be sent again: that
  // is how a recurring antagonist happens at all, rather than a fresh name every time
  const weighted = lts.flatMap(n => Array<Npc>(1 + Math.round(notoriety(n) / 15)).fill(n));
  return rng.pick(weighted);
}

/**
 * The floor their notoriety cannot fall back through: whatever the street has already learned.
 *
 * A milestone is a thing that happened in public — they picked up a name, they turned up with
 * worse people — and losing a fight afterwards does not unhappen it. Without this, a long run of
 * player wins walks an established nemesis back down past their own nickname and the milestones
 * they already paid for silently stop being true.
 */
function earnedFloor(s: Nemesis): number {
  let floor = 0;
  for (const m of MILESTONES) if (s.earned.includes(m.id)) floor = Math.max(floor, m.at);
  return floor;
}

/**
 * One meeting, scored. `stake` is what the meeting actually cost — the same vocabulary the fear
 * system uses — so beating the player in a fight is worth roughly four times talking over them.
 *
 * Three things make a nemesis, and the third was missing for a long time:
 *
 *  1. **What they did to you.** A win against the player, worth `perWin` × the stake.
 *  2. **What you did to them.** A loss shaves `perLossFraction` of what they have, because a
 *     nemesis who keeps losing stops being one — but see the note on that constant for why it is
 *     a fraction and not the flat number it used to be.
 *  3. **That they keep turning up at all.** `perMeeting`, win or lose. Somebody at your door for
 *     the ninth time is a presence whatever happened the previous eight times, and without this
 *     the whole system was unreachable for a player who was winning — which is every player the
 *     game is actually for.
 */
export function scoreMeeting(w: World, n: Npc | undefined, won: boolean, stake: Stake, why: string): void {
  if (!n?.alive || n.crew || n.faction === PLAYER) return;
  const s = start(w, n);
  const mult = STAKES[stake].mult;
  // Both counters, always: `wins + losses` is the outfit's record and `met` is the personal one.
  // They only differ after a succession, and that difference is the whole point of `met`.
  s.met = (s.met ?? s.wins + s.losses) + 1;
  if (won) { s.wins++; s.notoriety += NEMESIS.perWin * mult; }
  else { s.losses++; s.notoriety -= s.notoriety * NEMESIS.perLossFraction * mult; }
  s.notoriety += NEMESIS.perMeeting * mult;
  s.notoriety = clamp(s.notoriety, earnedFloor(s));
  remember(w, n, won ? 'harm' : 'door', why);
  payMilestones(w, n);
}

/**
 * What the notoriety buys. Each milestone fires once, and each is one legible change — a trait,
 * a skill, or a name — so a player reading the log can always say what just happened to them.
 */
function payMilestones(w: World, n: Npc): void {
  const s = n.nemesis!;
  for (const m of MILESTONES) {
    if (s.notoriety < m.at || s.earned.includes(m.id)) continue;
    s.earned.push(m.id);
    if (m.trait && !n.traits.includes(m.trait)) n.traits = [...n.traits, m.trait];
    if (m.skill) n.skills = { ...n.skills, [m.skill.key]: clamp(n.skills[m.skill.key] + m.skill.by, 0, 10) };
    if (m.nickname && !s.nickname) {
      // deterministic: the name comes from the id, not from a roll, so a replay reads the same
      s.nickname = m.nickname[(n.id.length + s.wins + Math.round(s.notoriety)) % m.nickname.length];
      n.notes.push(`They call them ${s.nickname} now.`);
    }
    const line = `${nemesisName(n)} ${m.line}.`;
    remember(w, n, 'harm', line);
    log(w, line, 'warn', { npcId: n.id, factionId: n.faction });
  }
}

/**
 * What a succession does to everybody who had a record against the man who just died.
 *
 * Called once from `succeed()`. The split is written down in full at the top of `sim/legacy.ts`;
 * this is the implementation of it, and the short version is: **the outfit's war carries, the
 * personal thing does not.**
 *
 * Kept, because none of it is about the player as a person:
 *
 *  - `wins` / `losses`, which are what their outfit did to your outfit. The trophy screen's "had
 *    the better of you N times" is a line about the two organisations, not about a man.
 *  - `earned`, `nickname`, and the trait and skill the milestones already paid out. A milestone is
 *    a thing that happened in public, and `earnedFloor` has always said that losing a fight
 *    afterwards does not unhappen it. Neither does dying: the street still calls him the Nail.
 *  - Their ledger, and the faction-level standing and stance, which are not touched here at all
 *    because they never belonged to the protagonist in the first place.
 *
 * Reset, because all of it is:
 *
 *  - `notoriety` is cut to `SUCCESSION.nemesisKeeps` of itself, floored at what the street already
 *    knows (`earnedFloor`). This is deliberately the **mirror of `SUCCESSION.inherits`**: the heir
 *    keeps a fraction of the outfit's respect and fear because the name carries and the person does
 *    not, and a nemesis keeps a fraction of their notoriety for exactly the same reason from the
 *    other side. Notoriety is defined as what a win *against the player* is worth to them, and the
 *    player is somebody else now.
 *  - `met` goes to zero. They have not met you. This is the part with teeth: it is what stops a
 *    lieutenant with a nine-meeting record opening a conversation by counting them.
 *  - `since` becomes today, because that is when this — the thing between them and *you* — starts.
 *
 * A grudge (`Npc.grudge`) is deliberately left alone. It carries a `reason` naming a concrete
 * thing that was done to their business or their people, and the outfit did that; it is not the
 * personal-familiarity currency this function exists to reset.
 */
export function inheritNemeses(w: World, keeps: number): void {
  for (const n of Object.values(w.npcs)) {
    const s = n.nemesis; if (!s) continue;
    s.notoriety = clamp(Math.max(earnedFloor(s), s.notoriety * keeps));
    s.met = 0;
    s.since = w.day;
  }
}

/** What their record against you adds to their case for the chair. Read by `tickCrisis`. */
export function successionWeight(n: Npc): number { return notoriety(n) * NEMESIS.successionWeight; }

/**
 * Who a faction would actually put forward when the boss goes down. The two with the strongest
 * case, and a record against the player is a large part of that case — a lieutenant who has been
 * beating you in public is exactly who the soldiers would follow.
 */
export function candidatesFor(w: World, f: Faction): Npc[] {
  const lts = f.lieutenantIds.map(id => w.npcs[id]).filter(n => n?.alive);
  return lts.slice().sort((a, b) =>
    (successionWeight(b) + b.skills.muscle + b.skills.charm) - (successionWeight(a) + a.skills.muscle + a.skills.charm));
}

/**
 * Lieutenant-vs-lieutenant. An `ambition` agenda used to mean one thing — a chair, eventually —
 * and every ambitious lieutenant in the city wanted the same one. Sometimes what they actually
 * want is the person standing between them and it, and the connections graph says who that is:
 * somebody they know is a far better target for a quiet move than a stranger two districts away.
 */
export function schemeTarget(w: World, n: Npc, rng: Rng): Id | undefined {
  const f = n.faction ? w.factions[n.faction] : undefined;
  if (!f || n.role !== 'lieutenant') return undefined;
  const peers = f.lieutenantIds.map(id => w.npcs[id]).filter(x => x?.alive && x.id !== n.id);
  if (!peers.length) return undefined;
  const known = new Set(connectionsOf(w, n).map(c => c.npc.id));
  const close = peers.filter(x => known.has(x.id));
  return rng.pick(close.length ? close : peers).id;
}

/**
 * A scheme coming off. The rival is pushed out of the faction — not killed; this is politics —
 * and the schemer takes their standing with it. Called from the agenda milestone, so it runs on
 * the sim's own clock whether or not the player is anywhere near it.
 */
export function resolveScheme(w: World, n: Npc, rng: Rng): boolean {
  const f = n.faction ? w.factions[n.faction] : undefined;
  const rival = n.agenda?.target ? w.npcs[n.agenda.target] : undefined;
  if (!f || !rival?.alive || rival.faction !== f.id) return false;
  const mine = n.skills.brains + n.skills.charm + notoriety(n) / 10;
  const theirs = rival.skills.brains + rival.skills.charm + notoriety(rival) / 10;
  if (rng.int(0, 100) > 50 + (mine - theirs) * 4) {
    log(w, `${nemesisName(n)} moved on ${nemesisName(rival)} inside ${f.short} and it did not come off. They are the one on the outside now.`, 'info', { factionId: f.id, npcId: n.id });
    n.role = 'soldier'; f.lieutenantIds = f.lieutenantIds.filter(id => id !== n.id);
    return false;
  }
  rival.faction = undefined; rival.role = 'patron';
  f.lieutenantIds = f.lieutenantIds.filter(id => id !== rival.id);
  f.soldiers = Math.max(1, f.soldiers - 1);
  start(w, n).notoriety = clamp(notoriety(n) + 10);
  rival.notes.push(`Pushed out of ${f.short} by ${nemesisName(n)}.`);
  remember(w, rival, 'door', `${nemesisName(n)} took their place in ${f.short}.`);
  log(w, `${nemesisName(n)} has ${nemesisName(rival)} out of ${f.name}. Somebody moved and it was not the boss.`, 'warn', { factionId: f.id, npcId: n.id });
  return true;
}

export { PLAYER };
