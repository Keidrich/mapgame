/**
 * Somebody on the inside, and somebody who will vouch for you.
 *
 * These are the two "phase 2 leverage" plays the connections graph was built for and then
 * deferred, because when it shipped there was nothing underneath to hang them on. There is now:
 * `leverageOver` and `doFavour` decide who will do something real for you, `familiar` decides
 * whether they know you well enough for it to mean anything, and `remember` writes down what
 * happened. None of that is rebuilt here.
 *
 * The distinction that matters: **a favour is spent, an asset is standing.** Turning somebody
 * costs exactly what any other major concession costs — leverage over them, or a favour they owe
 * you — and then it keeps paying, quietly, until it goes cold.
 */
import { ASSET, REFERRAL } from '@content/informants';
import { FAMILIARITY } from '@content/standing';
import { connectionsOf } from './connections';
import { concessionReason, familiar } from './standing';
import { remember } from './ledger';
import type { Rng } from './rng';
import { hashString } from './rng';
import { PLAYER, type Asset, type Faction, type FactionId, type Id, type Npc, type World } from './types';
import { addHeat, adjustRel, log } from './util';

export type AssetKind = Asset['kind'];

export function assets(w: World, kind?: AssetKind): Npc[] {
  return Object.values(w.npcs).filter(n => n.alive && n.asset && (!kind || n.asset.kind === kind));
}
export function assetOf(n: Npc): Asset | undefined { return n.asset; }

/**
 * Which faction somebody is placed to hear about. Their own if they have one; otherwise whoever
 * runs the ground they live on, because a barman on a faction's block hears what the soldiers say
 * in it. This is why an informant does not need to be a made man to be worth having.
 */
export function hearsAbout(w: World, n: Npc): FactionId | undefined {
  if (n.faction && n.faction !== PLAYER) return n.faction;
  const blk = w.blocks[n.homeBlockId]; if (!blk) return undefined;
  let best: FactionId | undefined; let bv = 0;
  for (const [f, v] of Object.entries(blk.influence)) if (f !== PLAYER && v > bv) { bv = v; best = f; }
  return bv >= 30 ? best : undefined;
}

/**
 * Why they will not do it. Deliberately the same gate as protection or a place in the crew —
 * `concessionReason` — because it is the same size of ask: standing somewhere you are not and
 * telling you what they heard is not a thing anybody does because they like you.
 */
export function assetReason(w: World, n: Npc, kind: AssetKind): string | undefined {
  if (!n.alive) return 'They are gone.';
  if (n.crew) return 'They already work for you.';
  if (n.official) return 'An official is bought, not turned. Pay them.';
  if (n.asset) return n.asset.kind === kind ? `${n.name} already does this for you.` : `${n.name} is already doing something else for you.`;
  const why = concessionReason(w, n, kind === 'informant' ? 'somebody on the inside' : 'a pair of hands when it goes wrong');
  if (why) return why;
  if (kind === 'informant' && !hearsAbout(w, n)) return `${n.name} is not close enough to anybody to hear anything worth having.`;
  return undefined;
}

export function turnAsset(w: World, n: Npc, kind: AssetKind): Asset {
  n.asset = { kind, since: w.day, factionId: kind === 'informant' ? hearsAbout(w, n) : undefined, used: 0 };
  const f = n.asset.factionId ? w.factions[n.asset.factionId] : undefined;
  const line = kind === 'informant'
    ? `They agreed to tell you what they hear${f ? ` around ${f.short}` : ''}.`
    : `They agreed to turn up when it goes wrong.`;
  remember(w, n, 'deal', line);
  adjustRel(w, n, { trust: 4 });
  log(w, `${n.name} is yours now — not on the payroll, but yours. ${line}`, 'good', { npcId: n.id, factionId: n.asset.factionId });
  return n.asset;
}

/**
 * How long *this* person will go without hearing from you. `ASSET.goesCold` plus a fixed offset
 * off their id — see `ASSET.coldSpread` for why it is not one number for everybody.
 */
export function coldAfter(n: Npc): number {
  return ASSET.goesCold + (hashString(n.id) % (ASSET.coldSpread + 1));
}

/** They stop returning calls if you never make any. Read by the tick, not by the player. */
export function goneCold(w: World, n: Npc): boolean {
  const a = n.asset; if (!a) return false;
  return w.day - Math.max(a.since, lastUse(n)) > coldAfter(n);
}
function lastUse(n: Npc): number {
  for (let i = (n.ledger ?? []).length - 1; i >= 0; i--) { const e = n.ledger![i]; if (e.kind === 'intel') return e.day; }
  return n.asset?.since ?? 0;
}

export function tickAssets(w: World, rng: Rng): void {
  for (const n of assets(w)) {
    if (!goneCold(w, n)) continue;
    if (!rng.chance(0.2)) continue;
    const kind = n.asset!.kind;
    n.asset = undefined;
    remember(w, n, 'talk', 'They stopped answering. You had not asked them for anything in weeks.');
    log(w, `${n.name} is not returning calls. Whatever arrangement you had, it has lapsed.`, 'warn', { npcId: n.id });
    void kind;
  }
}

// ---------------------------------------------------------------- passive: early warning
/**
 * Somebody who hears it coming. Called as a faction decides to move on the player, so the warning
 * lands *with* the confrontation rather than after it: the player is standing ready instead of
 * surprised, and `confrontChance` reads that.
 */
export function warnedBy(w: World, f: Faction, rng: Rng): Npc | undefined {
  const ears = assets(w, 'informant').filter(n => n.asset!.factionId === f.id);
  if (!ears.length || !rng.chance(ASSET.warnChance)) return undefined;
  const who = rng.pick(ears);
  who.asset!.used++;
  remember(w, who, 'intel', `They got word to you before ${f.short} moved.`);
  addHeat(w, ASSET.heatPerUse, who.homeBlockId);
  log(w, `${who.name} got a message to you first: ${f.short} are coming. You are not going to be surprised.`, 'good', { npcId: who.id, factionId: f.id });
  return who;
}

// ---------------------------------------------------------------- active: on a job
/** A pair of hands close to the target. Worth real odds on a job against their own people. */
export function activeHelp(w: World, factionId: FactionId | undefined): { npc: Npc; bonus: number } | undefined {
  if (!factionId) return undefined;
  const hands = assets(w, 'muscle').find(n => hearsAbout(w, n) === factionId);
  return hands ? { npc: hands, bonus: ASSET.activeBonus } : undefined;
}
/** Same question, for a job that names a person rather than a faction. */
export function helpAgainst(w: World, target: Npc | undefined): { npc: Npc; bonus: number } | undefined {
  return activeHelp(w, target?.faction && target.faction !== PLAYER ? target.faction : undefined);
}

// ---------------------------------------------------------------- referrals
/**
 * An introduction. The point is the familiarity floor: somebody vouching for you does not make a
 * stranger trust you, it makes you *not a stranger* — which three days and two meetings were
 * otherwise the only way to buy. It is the one thing in the game that shortcuts that, and it
 * costs a real relationship with somebody who actually knows the person.
 */
export function referrals(w: World, introducer: Npc): Npc[] {
  if (!familiar(w, introducer) || introducer.rel.trust < REFERRAL.minTrust) return [];
  return connectionsOf(w, introducer).map(c => c.npc).filter(n => n.alive && !n.crew && !familiar(w, n));
}

export function referralReason(w: World, introducer: Npc, toId: Id): string | undefined {
  if (!introducer.alive) return 'They are gone.';
  if (!familiar(w, introducer)) return `You barely know ${introducer.name} yourself. Their word would not carry.`;
  if (introducer.rel.trust < REFERRAL.minTrust) return `${introducer.name} is not going to put their name to you. Get their trust to ${REFERRAL.minTrust}.`;
  const to = w.npcs[toId];
  if (!to?.alive) return 'They are gone.';
  if (!connectionsOf(w, introducer).some(c => c.npc.id === toId)) return `${introducer.name} does not know ${to.name}.`;
  if (familiar(w, to)) return `You already know ${to.name}.`;
  return undefined;
}

export function introduce(w: World, introducer: Npc, to: Npc): void {
  // dates the acquaintance back rather than setting a flag, so every existing familiarity check
  // reads it without knowing referrals exist at all
  to.rel.metDay = Math.min(to.rel.metDay ?? w.day, w.day - REFERRAL.daysBack);
  to.rel.contacts = Math.max(to.rel.contacts ?? 0, REFERRAL.contacts);
  to.rel.lastContactDay = w.day;
  adjustRel(w, to, { trust: REFERRAL.trust });
  const tie = introducer.connections.find(c => c.npcId === to.id)?.label ?? 'somebody they know';
  remember(w, to, 'met', `${introducer.name}, their ${tie}, vouched for you.`);
  remember(w, introducer, 'deal', `They put their name to you with ${to.name}.`);
  log(w, `${introducer.name} makes a call. ${to.name} will talk to you like somebody they have met, because now they have.`, 'good', { npcId: to.id });
}

export { FAMILIARITY };
