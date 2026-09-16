/**
 * Scenes: the face-to-face part of the game. A scene shows what the person says and
 * the approaches on offer with their odds. The reducer resolves the chosen approach
 * with the same odds, so what the player sees is what they get.
 */
import { PLAYER } from './types';
import { APPROACHES, LEDGER_CALLBACK, NEMESIS_OPENING, OPENING, REPUTATION_OPENING, RESULT, type SceneKind } from '@content/lines';
import { hashString, type Rng } from './rng';
import { activeCrewCount } from './util';
import { crewOfBoss, fundReason } from './crews';
import { isNemesis, knowsYou, nemesisName } from './nemesis';
import { ledgerOf } from './ledger';
import { contacts } from './standing';
import { ownerResistance } from './economy';
import type { Business, Id, Npc, World } from './types';
import { bedsTotal } from './fortune';
import { lifestyleAt, standingShow } from './fortune';

export interface SceneOption { id: string; label: string; icon: string; blurb: string; good: string; bad: string; chance: number; costAp: number; costCash: number; disabled?: string }
export interface Scene { kind: SceneKind; npcId: Id; businessId?: Id; line: string; options: SceneOption[] }

export function sceneFor(w: World, kind: SceneKind, npcId: Id, businessId?: Id, otherFactionId?: Id): Scene {
  const n = w.npcs[npcId];
  return { kind, npcId, businessId, line: openingLine(w, kind, n), options: APPROACHES[kind].map(a => ({ ...a, chance: approachChance(w, kind, a.id, n, businessId ? w.businesses[businessId] : undefined, otherFactionId), costAp: kind === 'broker' ? 2 : 1, costCash: kind === 'visit' && a.id === 'drinks' ? 50 : kind === 'broker' && a.id === 'split' ? 4000 : 0, disabled: disabledReason(w, kind, a.id, n, otherFactionId) })) };
}

/**
 * Which entry of a pool this person, on this day, reads from.
 *
 * It was `(w.day + n.id.length) % lines.length`, which is barely a hash: npc ids are `n3`, `n47`,
 * so `id.length` takes about two values across the whole city and **everybody with a two-character
 * id said the same line on the same day**. Filling the pools out would have hidden that rather than
 * fixed it. `hashString` over the id and the salt mixes properly, and is still a pure function of
 * world state — reopening a sheet never rerolls, and a replay of a seed says the same things.
 */
function pick<T>(items: readonly T[], salt: string): T { return items[hashString(salt) % items.length]; }

/** How long ago, in the words somebody would actually use. Fills `{when}` in a callback line. */
function whenAgo(days: number): string {
  if (days <= 0) return 'this morning';
  if (days === 1) return 'yesterday';
  if (days <= 3) return 'the other day';
  if (days <= 9) return 'last week';
  if (days <= 20) return 'a couple of weeks back';
  return 'a while back';
}

/** How recent a thing has to be before somebody opens with it rather than letting it go. */
const CALLBACK_DAYS = 20;
/**
 * How often a recent entry actually gets spoken about, as a percentage.
 *
 * Not every time. A person who opens with the same favour on nine consecutive visits is a worse
 * kind of repetitive than one with a small line pool — so the callback is a *chance*, resolved
 * deterministically from who and when, and on the days it does not fire they simply say whatever
 * their trait was going to say.
 */
const CALLBACK_CHANCE = 45;

/**
 * The last thing that passed between you, if it was recent enough to bring up and today is a day
 * they would. `undefined` otherwise, and the caller says nothing about it.
 *
 * Exported because `sim/conversation.ts` appends a factual `(Last time: ...)` receipt of the same
 * entry, and printing both is saying it twice. One function, asked twice, same answer — rather than
 * threading a flag between two files that can drift apart.
 */
export function ledgerCallback(w: World, n: Npc): { entry: { day: number; kind: string; text: string }; line: string } | undefined {
  // 'met' is excluded: "we have met" is not news to either of you, and it is the one kind that
  // exists for every single person the player has ever spoken to.
  const entry = ledgerOf(n).filter(e => e.kind !== 'met' && w.day - e.day <= CALLBACK_DAYS).slice(-1)[0];
  if (!entry) return undefined;
  const pool = LEDGER_CALLBACK[entry.kind];
  if (!pool?.length) return undefined;
  // Salted with the entry's own day as well as today's, so the line changes when the history does
  // rather than only when the calendar does.
  if (hashString(`cb:${n.id}:${w.day}:${entry.day}`) % 100 >= CALLBACK_CHANCE) return undefined;
  return { entry, line: pick(pool, `cbl:${n.id}:${w.day}:${entry.day}`).replace(/\{when\}/g, whenAgo(w.day - entry.day)) };
}

function openingLine(w: World, kind: SceneKind, n: Npc): string {
  // Somebody with a record reads from their own pool instead of their trait's. A hothead met once
  // and a hothead who has beaten you three times were saying the same six things; see
  // `NEMESIS_OPENING`. Replaces rather than adds, because the record is the thing in the room.
  //
  // `knowsYou` as well as `isNemesis`, because after a succession those two come apart: the city
  // still knows exactly who he is, and he has never been in a room with the person now holding
  // the controls. A man counting your meetings when he has had none with you is the exact bug the
  // split in `sim/legacy.ts` exists to prevent, and this is where it would have shown.
  let line: string;
  if (isNemesis(n) && knowsYou(n)) {
    const wins = n.nemesis?.wins ?? 0;
    // A line that counts the times only comes up when there is a number worth saying out loud.
    const pool = NEMESIS_OPENING[kind].filter(l => wins >= 2 || !l.includes('{wins}'));
    line = pick(pool.length ? pool : NEMESIS_OPENING[kind], `nem:${n.id}:${w.day}`)
      .replace(/\{name\}/g, nemesisName(n))
      .replace(/\{wins\}/g, String(wins));
  } else {
    const table = OPENING[kind];
    const key = n.rel.trust >= 40 && table.friend ? 'friend' : n.rel.fear >= 50 && table.scared ? 'scared' : n.traits.find(t => table[t]) ?? 'default';
    const lines = table[key as keyof typeof table] ?? table.default ?? ['...'];
    line = pick(lines, `open:${kind}:${key}:${n.id}:${w.day}`);
  }
  if (n.grudge && kind !== 'visit') line += ` "And I haven't forgotten last time."`;
  else if (n.grudge) line += ` They are cool with you; the whole block heard about last time.`;
  // What has actually passed between you, before what they notice about you: history first,
  // because it is what they are reacting to, and the coat is only what they see while doing it.
  line += ledgerCallback(w, n)?.line ?? '';
  line += lifestyleLine(w);
  line += reputationLine(w, n);
  if (kind === 'visit') line += gossipLine(w, n);
  if (n.homeBlockId === w.player.homeBlockId && kind === 'visit') line += ` (Home turf.)`;
  return line;
}

/**
 * What a stranger says about a name they have only heard.
 *
 * The same shape as `lifestyleLine` below and deliberately not a second mechanism: read one piece
 * of player state, return a clause or an empty string, let the caller append it. The difference is
 * what it reads. The car and the coat are things in front of them; a reputation is the one thing
 * that arrives before you do — so this fires on a **first** meeting and nowhere else. Somebody who
 * has dealt with you six times knows what you are called, and saying it back at you would be the
 * line that finally made the system look like a system.
 */
function reputationLine(w: World, n: Npc): string {
  if (!w.player.street) return '';
  if (contacts(n) > 0 || n.rel.metDay !== undefined) return '';
  return pick(REPUTATION_OPENING, `rep:${n.id}:${w.day}`).replace(/\{street\}/g, w.player.street);
}

/**
 * What they say about the car, the house and the men waiting outside.
 *
 * The lifestyle ladder is only worth buying if the city can see it, and the cheapest honest proof
 * of that is the first thing somebody says to you. Two rungs is a remark; the whole ladder and
 * people are careful before you have opened your mouth. It reads `standingShow` rather than the
 * individual purchases so a player who spread their money across three ladders is as visible as
 * one who maxed a single one — the thing on show is the life, not the car.
 */
function lifestyleLine(w: World): string {
  const show = standingShow(w);
  if (show < 0.34) return '';
  const car = lifestyleAt(w, 'car'), home = lifestyleAt(w, 'home'), guards = lifestyleAt(w, 'security');
  // pick the one they would actually mention: whatever is in front of them
  if (guards >= 2 && show >= 0.67) return ` They keep glancing past you at the men by the door, and they are being very polite.`;
  if (car >= 2) return ` "That yours out front?" They already know it is.`;
  if (home >= 2) return ` They ask after the house, the way people ask about something they have driven past on purpose.`;
  return ` They take in the coat, the watch, the whole arrangement, and adjust.`;
}

/** How long a block keeps talking about something. */
const GOSSIP_DAYS = 15;

/**
 * What the person in front of you brings up about the neighbourhood.
 *
 * The block's memory used to be told by whoever you happened to be standing in front of, with no
 * check on who it was about — so the man who was mugged reported his own mugging as gossip, and
 * the shopkeeper whose windows went in told you somebody had smashed up his shop. Two fixes, and
 * they are different:
 *
 *   - **Nobody repeats a story about themselves as neighbourhood talk.** They tell it as theirs,
 *     or not at all. That is the sanity check.
 *   - **Their family and their friends absolutely still do**, and now it reads that way: word
 *     travelling along a real tie says whose tie it is, because "their cousin" is the whole reason
 *     the story reached this person at all.
 *
 * Memories from before this shipped carry no subject, so they are told by everybody, exactly as
 * they were. An old save loses nothing.
 */
function gossipLine(w: World, n: Npc): string {
  const mems = (w.blocks[n.homeBlockId]?.memory ?? []).filter(m => w.day - m.day <= GOSSIP_DAYS);
  if (!mems.length) return '';
  const ownPlace = (m: typeof mems[number]) => !!m.about?.businessId && w.businesses[m.about.businessId]?.ownerId === n.id;
  const aboutThem = (m: typeof mems[number]) => m.about?.npcId === n.id || ownPlace(m);

  // their own business, first: they have more to say about it than the street does
  const mine = mems.filter(ownPlace).slice(-1)[0];
  if (mine) return ` They are still sweeping up: ${mine.text}`;
  // anything about them personally, they do not narrate at all
  const theirs = mems.filter(m => m.about?.npcId === n.id).slice(-1)[0];
  const rest = mems.filter(m => !aboutThem(m));
  const mem = rest.slice(-1)[0];
  if (!mem) return theirs ? ` They do not bring up what happened to them, and neither does anybody else while you are standing there.` : '';

  const about = mem.about?.npcId ? w.npcs[mem.about.npcId] : undefined;
  const tie = about ? n.connections.find(c => c.npcId === about.id)?.label : undefined;
  return tie
    ? ` They will not let it go — that is their ${tie}: ${mem.text}`
    : ` Everybody is still talking about it: ${mem.text}`;
}

function disabledReason(w: World, kind: SceneKind, id: string, n: Npc, otherFactionId?: Id): string | undefined {
  if (kind === 'broker' && id === 'split' && w.player.cash < 4000) return 'Needs $4,000 clean.';
  if (kind === 'broker' && id === 'favour') { const f = n.faction ? w.factions[n.faction] : undefined; const o = otherFactionId ? w.factions[otherFactionId] : undefined; if (!f || !o) return 'No faction.'; if (!(f.owed ?? 0) && f.standing[PLAYER] < 30 && o.standing[PLAYER] < 30) return 'Nobody here owes you anything yet (standing 30+, or a favour owed).'; }
  if (kind === 'threaten' && id === 'crew' && activeCrewCount(w) === 0) return 'No crew to bring.';
  if (kind === 'visit' && id === 'drinks' && w.player.cash < 50) return 'Needs $50.';
  if (kind === 'recruit' && id === 'cut' && w.player.cash < 200) return 'Needs $200 up front.';
  if (kind === 'recruit' && id === 'lean' && n.traits.includes('loyal')) return 'Loyal people do not fold.';
  if (kind === 'parley' && id === 'join' && bedsLeftFor(w) <= 0) return 'No room in your safehouses for their boss.';
  if (kind === 'parley' && id === 'fund') { const c = crewOfBoss(w, n.id); if (c) return fundReason(w, c); }
  return undefined;
}

/**
 * 3..97 % — the number the player sees and the number the dice use.
 *
 * `bonus` is what a conversation's opening moves bought: a name you both know that landed, a
 * favour they had not forgotten. It is passed in rather than read off the world because it
 * belongs to one conversation and one closing move, and must not leak into anything else.
 */
export function approachChance(w: World, kind: SceneKind, id: string, n: Npc, biz?: Business, otherFactionId?: Id, bonus = 0): number {
  const p = w.player; const s = p.skills; const crew = activeCrewCount(w);
  const fa = n.faction ? w.factions[n.faction] : undefined; const fb = otherFactionId ? w.factions[otherFactionId] : undefined;
  const temperBonus = (f?: import('./types').Faction) => !f ? 0 : f.temperament === 'diplomatic' ? 12 : f.temperament === 'aggressive' ? -10 : f.temperament === 'paranoid' ? -6 : 0;
  const fear = n.rel.fear, trust = n.rel.trust;
  const has = (t: string) => n.traits.includes(t as Npc['traits'][number]);
  let v = 50;
  switch (`${kind}:${id}`) {
    case 'shakedown:lean': v = 30 + s.muscle * 5 + p.fear * 0.4 + fear * 0.6 + crew * 4 - n.nerve * 0.7 + (has('coward') ? 20 : 0) - (has('hothead') ? 15 : 0); break;
    case 'shakedown:reason': v = 25 + s.charm * 5 + trust * 0.5 + fear * 0.3 + p.respect * 0.4 - n.nerve * 0.4 + (has('greedy') ? 10 : 0) - (has('honest') ? 20 : 0); break;
    case 'shakedown:wreck': v = 45 + s.muscle * 3 + crew * 8 + fear * 0.3 - n.nerve * 0.3 - (has('hothead') ? 10 : 0); break;
    case 'threaten:stare': v = 25 + s.muscle * 6 + p.fear * 0.5 + crew * 3 + fear * 0.4 - n.nerve * 0.6 + (has('coward') ? 20 : 0); break;
    case 'threaten:crew': v = 45 + s.muscle * 3 + crew * 10 + p.fear * 0.4 - n.nerve * 0.5; break;
    case 'threaten:family': v = 30 + s.brains * 6 + s.charm * 2 - n.nerve * 0.4 + (has('coward') ? 15 : 0) - (has('honest') ? 25 : 0); break;
    case 'visit:drinks': v = 55 + s.charm * 4 + (has('gambler') || has('junkie') ? 15 : 0) - (has('quiet') ? 15 : 0); break;
    case 'visit:business': v = 35 + s.brains * 5 + s.charm * 2 + (has('connected') || has('ambitious') ? 15 : 0) - (has('honest') ? 10 : 0); break;
    case 'visit:listen': v = 60 + s.charm * 2 + (has('quiet') ? 20 : 0); break;
    case 'parley:tribute': v = 20 + s.charm * 4 + p.respect * 0.6 + p.fear * 0.4 + crew * 4 - (crewOfBoss(w, n.id)?.strength ?? 3) * 4 + (has('greedy') ? 10 : 0) - (has('hothead') ? 10 : 0); break;
    case 'parley:join': v = 10 + s.charm * 4 + trust * 0.8 + p.respect * 0.7 - (crewOfBoss(w, n.id)?.strength ?? 3) * 3 + (has('ambitious') ? 20 : 0) - (has('loyal') ? 10 : 0); break;
    // A stake is a business proposition, so it reads like one: what you are worth to them, what
    // they think of you, and a strong crew wanting a partner less than a weak one does.
    case 'parley:fund': v = 30 + s.charm * 3 + s.brains * 2 + trust * 0.5 + p.respect * 0.4 + (crewOfBoss(w, n.id)?.mood ?? 0) * 0.2 - (crewOfBoss(w, n.id)?.strength ?? 3) * 3 + (has('greedy') || has('ambitious') ? 15 : 0) - (has('loyal') ? 5 : 0); break;
    case 'parley:warn': v = 25 + s.muscle * 5 + crew * 8 + p.fear * 0.5 - (crewOfBoss(w, n.id)?.strength ?? 3) * 6 + (has('coward') ? 20 : 0) - (has('hothead') ? 10 : 0); break;
    case 'broker:split': v = 25 + s.charm * 4 + p.respect * 0.4 + temperBonus(fa) + temperBonus(fb) + ((fa?.standing[PLAYER] ?? 0) + (fb?.standing[PLAYER] ?? 0)) * 0.15; break;
    case 'broker:lean': v = 15 + s.muscle * 3 + p.fear * 0.5 + crew * 4 - ((fa?.soldiers ?? 0) + (fb?.soldiers ?? 0)) * 0.6 + temperBonus(fa) * 0.5 + temperBonus(fb) * 0.5; break;
    case 'broker:favour': v = 30 + Math.max(fa?.standing[PLAYER] ?? 0, fb?.standing[PLAYER] ?? 0) * 0.6 + ((fa?.owed ?? 0) ? 20 : 0) + s.charm * 2 + temperBonus(fb); break;
    case 'recruit:cut': v = 50 + trust * 0.6 + (has('greedy') || has('ambitious') ? 20 : 0) - (has('loyal') ? 15 : 0); break;
    case 'recruit:promise': v = 25 + s.charm * 5 + trust * 0.6 + p.respect * 0.5 + (has('ambitious') ? 15 : 0) - (has('loyal') ? 10 : 0); break;
    case 'recruit:lean': v = 10 + s.muscle * 3 + fear * 0.8 + p.fear * 0.3 + (has('coward') ? 30 : -10); break;
  }
  if (kind === 'recruit' && n.role === 'owner') v -= ownerResistance(w, n); // walking away from your own place is a big ask
  if (biz && biz.protection && biz.protection.factionId !== 'player' && kind === 'shakedown') v -= 20;
  if (n.grudge && (kind === 'shakedown' || kind === 'threaten' || kind === 'recruit')) v -= 10; // they have their guard up
  if (n.homeBlockId === w.player.homeBlockId) v += 5; // home turf
  return Math.max(3, Math.min(97, Math.round(v + bonus)));
}

export function resultLine(kind: SceneKind, id: string, ok: boolean, rng: Rng): string {
  const lines = RESULT[`${kind}:${id}:${ok ? 'ok' : 'fail'}`] ?? [ok ? 'It works.' : 'It does not work.'];
  return rng.pick(lines);
}

/** The same bed count the reducer enforces, including anything bought. One arithmetic, one place. */
function bedsLeftFor(w: World): number { return bedsTotal(w) - w.player.crewIds.filter(id => w.npcs[id].crew?.status !== 'dead').length; }
