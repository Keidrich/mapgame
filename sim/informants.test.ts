/**
 * Somebody on the inside, and somebody who will vouch for you.
 *
 * Two claims. An asset costs exactly what any other major concession costs — the same
 * `concessionReason` gate, not a cheaper one — and then keeps paying, which is what separates it
 * from a favour that is spent once. And a referral shortcuts the familiarity floor, which is the
 * one thing nothing else in the game does.
 */
import { describe, expect, it } from 'vitest';
import { ASSET, REFERRAL } from '@content/informants';
import { CONCESSION, FAMILIARITY } from '@content/standing';
import { can, dispatch, generateWorld, select } from './index';
import { activeHelp, assetReason, goneCold, hearsAbout, introduce, referralReason, referrals, tickAssets, turnAsset, warnedBy } from './informants';
import { confrontChance, queueConfrontation } from './combat';
import { doFavour, familiar } from './standing';
import { connect } from './connections';
import { ledgerOf, remember } from './ledger';
import { Rng } from './rng';
import { known, owes, unknown } from './test-util';
import type { Faction, Npc, World } from './types';

const mk = (seed = 61) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });
const anyFaction = (w: World): Faction => Object.values(w.factions).find(f => f.alive)!;

/** Somebody with nothing over them: no ground held, no books read, nobody of theirs in a cellar. */
function clean(w: World, n: Npc): Npc {
  delete w.blocks[n.homeBlockId].influence.player;
  n.tap = undefined; n.ratted = undefined;
  for (const c of select.connectionsOf(w, n)) c.npc.hostage = undefined;
  return n;
}
/** Somebody who lives on a faction's ground, so they are placed to hear about it. */
function placed(w: World, f: Faction): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official && !x.faction)!;
  w.blocks[n.homeBlockId].influence[f.id] = 60;
  w.player.currentBlockId = n.homeBlockId;   // these are face-to-face asks like any other
  return n;
}

describe('an asset costs what any other major concession costs', () => {
  it('being liked is not enough, however liked', () => {
    const w = mk(); const f = anyFaction(w);
    const n = clean(w, known(w, placed(w, f), { trust: CONCESSION.ordinary }));
    const why = assetReason(w, n, 'informant');
    expect(why).toBeDefined();
    expect(why).toMatch(/not a thing you ask a friend for/i);
    expect(can(w, { type: 'turn_asset', npcId: n.id, kind: 'informant' }).ok).toBe(false);
  });

  it('a settled favour opens it', () => {
    const w = mk(); const f = anyFaction(w);
    const n = clean(w, known(w, placed(w, f), { trust: CONCESSION.ordinary }));
    doFavour(w, n);
    expect(assetReason(w, n, 'informant')).toBeUndefined();
    expect(can(w, { type: 'turn_asset', npcId: n.id, kind: 'informant' }).ok).toBe(true);
  });

  it('and so does real leverage', () => {
    const w = mk(); const f = anyFaction(w);
    const n = clean(w, known(w, placed(w, f), { trust: CONCESSION.ordinary }));
    expect(assetReason(w, n, 'informant')).toBeDefined();
    n.ratted = w.day;
    expect(select.leverageOver(w, n)).toBeDefined();
    expect(assetReason(w, n, 'informant')).toBeUndefined();
  });

  it('a stranger is refused before anything else is considered', () => {
    const w = mk(); const f = anyFaction(w);
    const n = unknown(placed(w, f)); n.rel.trust = 90; n.rel.favours = 3;
    expect(assetReason(w, n, 'informant')).toMatch(/never actually dealt|Give it|Make it/);
  });

  it('an informant has to be placed to hear something worth having', () => {
    const w = mk();
    const nobody = clean(w, owes(w, Object.values(w.npcs).find(x => x.alive && !x.crew && !x.faction && !x.official)!));
    for (const b of Object.values(w.blocks)) b.influence = {};
    expect(hearsAbout(w, nobody)).toBeUndefined();
    expect(assetReason(w, nobody, 'informant')).toMatch(/not close enough/i);
    // a pair of hands does not need to hear anything, so that one is still on offer
    expect(assetReason(w, nobody, 'muscle')).toBeUndefined();
  });

  it('somebody already yours is not turned twice', () => {
    const w = mk(); const f = anyFaction(w);
    const n = clean(w, owes(w, placed(w, f)));
    turnAsset(w, n, 'informant');
    expect(assetReason(w, n, 'informant')).toMatch(/already does this/i);
    expect(assetReason(w, n, 'muscle')).toMatch(/already doing something else/i);
  });

  it('it is a standing arrangement, and it says so on their page', () => {
    const w = mk(); const f = anyFaction(w);
    const n = clean(w, owes(w, placed(w, f)));
    const after = dispatch(w, { type: 'turn_asset', npcId: n.id, kind: 'informant' });
    const a = after.npcs[n.id].asset!;
    expect(a.kind).toBe('informant');
    expect(a.factionId).toBe(f.id);
    expect(ledgerOf(after.npcs[n.id]).some(e => e.kind === 'deal')).toBe(true);
    expect(select.assets(after, 'informant').map(x => x.id)).toContain(n.id);
  });
});

describe('what an asset actually pays out', () => {
  it('passive: word before they arrive, and you are standing ready when they do', () => {
    const w = mk(); const f = anyFaction(w);
    const ear = clean(w, owes(w, placed(w, f)));
    turnAsset(w, ear, 'informant');
    // warnChance is below 1, so roll until it fires — the claim is about what a warning does
    let warned: Npc | undefined;
    for (let i = 0; i < 30 && !warned; i++) warned = warnedBy(w, f, new Rng(i));
    expect(warned?.id).toBe(ear.id);
    expect(ear.asset!.used).toBeGreaterThan(0);
    expect(ledgerOf(ear).some(e => e.kind === 'intel')).toBe(true);

    const biz = Object.values(w.businesses)[0];
    const cold = queueConfrontation(w, { factionId: f.id, kind: 'business', war: false, businessId: biz.id, blockId: biz.blockId, text: 'x' });
    const ready = queueConfrontation(w, { factionId: f.id, kind: 'business', war: false, businessId: biz.id, blockId: biz.blockId, warned: ear.id, text: 'x' });
    expect(confrontChance(w, ready, 'fight')).toBe(Math.min(97, confrontChance(w, cold, 'fight') + ASSET.warnedBonus));
  });

  it('no informant placed against that faction means no warning', () => {
    const w = mk(); const f = anyFaction(w);
    const other = Object.values(w.factions).find(x => x.alive && x.id !== f.id)!;
    const ear = clean(w, owes(w, placed(w, other)));
    turnAsset(w, ear, 'informant');
    for (let i = 0; i < 20; i++) expect(warnedBy(w, f, new Rng(i))).toBeUndefined();
  });

  it('active: a pair of hands is worth real odds on a job against their own people', () => {
    const w = mk(); const f = anyFaction(w);
    const hands = clean(w, owes(w, placed(w, f)));
    expect(activeHelp(w, f.id)).toBeUndefined();
    turnAsset(w, hands, 'muscle');
    expect(activeHelp(w, f.id)?.npc.id).toBe(hands.id);
    expect(activeHelp(w, f.id)?.bonus).toBe(ASSET.activeBonus);
    expect(select.assetBonus(w, { factionId: f.id })).toBe(ASSET.activeBonus);
    // and the number the op tree shows is the number that gets rolled. A real crew first: this op
    // has minCrew 2, so with nobody on it the skill sum is zero and both sides clamp to the 3%
    // floor, where the comparison proves nothing.
    const crewIds: string[] = [];
    for (const x of Object.values(w.npcs).filter(x => x.alive && !x.crew && x.id !== hands.id).slice(0, 3)) {
      x.crew = { loyalty: 70, cut: 0, status: 'idle', statusDays: 0, joinedDay: 1 };
      x.skills = { muscle: 9, brains: 9, charm: 9, wheels: 9, tech: 9 };
      w.player.crewIds.push(x.id); crewIds.push(x.id);
    }
    const without = select.opChance(w, 'raid_rival', crewIds, 'loud', {});
    const withHelp = select.opChance(w, 'raid_rival', crewIds, 'loud', { factionId: f.id });
    expect(without).toBeGreaterThan(3);
    expect(withHelp).toBeGreaterThan(without);
  });

  it('an informant nobody calls drifts off', () => {
    const w = mk(); const f = anyFaction(w);
    const ear = clean(w, owes(w, placed(w, f)));
    turnAsset(w, ear, 'informant');
    expect(goneCold(w, ear)).toBe(false);
    w.day += ASSET.goesCold + 1;
    expect(goneCold(w, ear)).toBe(true);
    for (let i = 0; i < 60 && ear.asset; i++) tickAssets(w, new Rng(i));
    expect(ear.asset).toBeUndefined();
    expect(ledgerOf(ear).some(e => e.text.includes('stopped answering'))).toBe(true);
  });

  it('and using one keeps it warm', () => {
    const w = mk(); const f = anyFaction(w);
    const ear = clean(w, owes(w, placed(w, f)));
    turnAsset(w, ear, 'informant');
    w.day += ASSET.goesCold - 1;
    remember(w, ear, 'intel', 'They got word out.');
    w.day += 3;
    expect(goneCold(w, ear)).toBe(false);
  });
});

describe('a referral is the one thing that shortcuts the familiarity floor', () => {
  const pair = (seed = 65) => {
    const w = mk(seed);
    const all = Object.values(w.npcs).filter(n => n.alive && !n.crew && !n.official);
    const [a, b] = all;
    a.connections = []; b.connections = [];
    connect(a, b, 'friend', 'old friend');
    known(w, a, { trust: REFERRAL.minTrust });
    unknown(b);
    w.player.currentBlockId = a.homeBlockId;
    return { w, introducer: a, to: b };
  };

  it('somebody who barely knows you will not put their name to you', () => {
    const { w, introducer, to } = pair();
    unknown(introducer);
    expect(referralReason(w, introducer, to.id)).toMatch(/barely know/i);
    expect(referrals(w, introducer)).toEqual([]);
  });

  it('nor will somebody who knows you and does not rate you', () => {
    const { w, introducer, to } = pair();
    introducer.rel.trust = REFERRAL.minTrust - 1;
    expect(referralReason(w, introducer, to.id)).toMatch(new RegExp(`trust to ${REFERRAL.minTrust}`));
  });

  it('and nobody can introduce you to somebody they do not know', () => {
    const { w, introducer } = pair();
    const stranger = Object.values(w.npcs).find(n => n.alive && !introducer.connections.some(c => c.npcId === n.id) && n.id !== introducer.id)!;
    expect(referralReason(w, introducer, stranger.id)).toMatch(/does not know/i);
  });

  it('a real introduction makes a stranger not a stranger', () => {
    const { w, introducer, to } = pair();
    expect(familiar(w, to)).toBe(false);
    expect(referralReason(w, introducer, to.id)).toBeUndefined();
    expect(referrals(w, introducer).map(n => n.id)).toContain(to.id);
    const trust0 = to.rel.trust;
    introduce(w, introducer, to);
    expect(familiar(w, to)).toBe(true);
    expect(to.rel.contacts).toBeGreaterThanOrEqual(FAMILIARITY.minContacts);
    expect(w.day - to.rel.metDay!).toBeGreaterThanOrEqual(FAMILIARITY.minDays);
    expect(to.rel.trust).toBeGreaterThan(trust0);
    expect(ledgerOf(to).some(e => e.text.includes('vouched for you'))).toBe(true);
  });

  it('which is exactly what it is for: a gate that was shut on familiarity is now open', () => {
    const { w, introducer, to } = pair();
    to.rel.favours = 1;   // they owe you, and it was doing nothing because you were a stranger
    expect(select.concessionReason(w, to, 'protection')).toBeDefined();
    dispatch(w, { type: 'introduce', npcId: introducer.id, toNpcId: to.id });
    introduce(w, introducer, to);
    expect(select.concessionReason(w, to, 'protection')).toBeUndefined();
  });

  it('it costs AP and is refused off-block, like any other face-to-face move', () => {
    const { w, introducer, to } = pair();
    const ap = w.player.ap;
    const after = dispatch(w, { type: 'introduce', npcId: introducer.id, toNpcId: to.id });
    expect(after.player.ap).toBe(ap - REFERRAL.ap);
    expect(select.familiar(after, after.npcs[to.id])).toBe(true);

    const w2 = pair(66);
    w2.w.player.currentBlockId = Object.keys(w2.w.blocks).find(id => id !== w2.introducer.homeBlockId)!;
    const r = can(w2.w, { type: 'introduce', npcId: w2.introducer.id, toNpcId: w2.to.id });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/Walk over first/);
  });

  it('somebody you already know is not on the list', () => {
    const { w, introducer, to } = pair();
    known(w, to);
    expect(referrals(w, introducer).map(n => n.id)).not.toContain(to.id);
    expect(referralReason(w, introducer, to.id)).toMatch(/already know/i);
  });
});
