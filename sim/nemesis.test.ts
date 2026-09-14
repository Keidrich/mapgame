/**
 * The lieutenant who keeps turning up.
 *
 * Four claims, and each one is really "this reuses the thing that already existed": the history
 * is the same `remember()` a shopkeeper gets, the magnitude is the same `STAKES` table fear uses,
 * the defection is the same `concessionReason` gate protection uses, and the chair is the same
 * succession crisis that was already there.
 */
import { describe, expect, it } from 'vitest';
import { MILESTONES, NEMESIS } from '@content/nemesis';
import { STAKES } from '@content/standing';
import { can, dispatch, generateWorld, select } from './index';
import { candidatesFor, nemesisName, notoriety, resolveScheme, schemeTarget, scoreMeeting, successionWeight } from './nemesis';
import { defectReason } from './defect';
import { resolveConfrontation, queueConfrontation } from './combat';
import { successionOrDeath } from './politics';
import { resolveAgenda } from './agendas';
import { ledgerOf } from './ledger';
import { concessionReason, favours } from './standing';
import { Rng } from './rng';
import { known } from './test-util';
import type { Faction, Npc, World } from './types';

const mk = (seed = 51) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });
const anyFaction = (w: World): Faction => Object.values(w.factions).find(f => f.alive && f.lieutenantIds.length >= 2)!;
const lt = (w: World, f = anyFaction(w)): Npc => w.npcs[f.lieutenantIds[0]];

describe('a lieutenant accumulates a real history, through the same logger everybody else uses', () => {
  it('a meeting writes to their ledger', () => {
    const w = mk(); const n = lt(w);
    expect(ledgerOf(n).length).toBe(0);
    scoreMeeting(w, n, true, 'violence', 'They put two of yours in hospital outside the Blue Room.');
    expect(ledgerOf(n).map(e => e.text)).toContain('They put two of yours in hospital outside the Blue Room.');
    expect(ledgerOf(n)[0].kind).toBe('harm');
  });

  it('and the history screen reads it without knowing anything about nemeses', () => {
    const w = mk(); const n = lt(w);
    scoreMeeting(w, n, true, 'backed', 'They talked over you at a sit-down.');
    const d = select.dossier(w, n);
    expect(d.blank).toBe(false);
    expect(d.history.some(e => e.text.includes('talked over you'))).toBe(true);
  });

  it('a confrontation they led goes on their page, not on an anonymous faction log line', () => {
    const w = mk(); const f = anyFaction(w); const n = lt(w, f);
    const biz = Object.values(w.businesses)[0];
    const c = queueConfrontation(w, { factionId: f.id, kind: 'business', war: false, businessId: biz.id, blockId: biz.blockId, byNpcId: n.id, text: 'They are outside with bats.' });
    resolveConfrontation(w, c, 'absent', new Rng(1));
    expect(n.nemesis).toBeDefined();
    expect(n.nemesis!.wins).toBe(1);
    expect(ledgerOf(n).length).toBeGreaterThan(0);
  });
});

describe('what beating the player makes of them is scaled by what the beating cost', () => {
  it('a win in a shooting is worth several times a win at a table', () => {
    const a = mk(); const na = lt(a);
    const b = mk(); const nb = lt(b);
    scoreMeeting(a, na, true, 'backed', 'talked over you');
    scoreMeeting(b, nb, true, 'violence', 'put one of yours down');
    expect(notoriety(nb)).toBeGreaterThan(notoriety(na) * 2);
    // and it is the same table fear reads, not a second one
    expect(notoriety(nb) / notoriety(na)).toBeCloseTo(STAKES.violence.mult / STAKES.backed.mult, 5);
  });

  it('beating them takes it back', () => {
    const w = mk(); const n = lt(w);
    for (let i = 0; i < 3; i++) scoreMeeting(w, n, true, 'violence', `win ${i}`);
    const peak = notoriety(n);
    scoreMeeting(w, n, false, 'violence', 'you put them down');
    expect(notoriety(n)).toBeLessThan(peak);
    expect(n.nemesis!.losses).toBe(1);
  });

  it('enough of it changes them: a trait, then a stat, then a name', () => {
    const w = mk(); const n = lt(w);
    const traits0 = n.traits.length; const muscle0 = n.skills.muscle;
    for (let i = 0; i < 12; i++) scoreMeeting(w, n, true, 'grave', `win ${i}`);
    expect(notoriety(n)).toBeGreaterThanOrEqual(MILESTONES[2].at);
    expect(n.traits.length).toBeGreaterThan(traits0);
    expect(n.skills.muscle).toBeGreaterThan(muscle0);
    expect(n.nemesis!.nickname).toBeTruthy();
    expect(nemesisName(n)).toContain(`"${n.nemesis!.nickname}"`);
    expect(nemesisName(n)).not.toBe(n.name);
  });

  it('each change fires exactly once, however many times they win after it', () => {
    const w = mk(); const n = lt(w);
    for (let i = 0; i < 30; i++) scoreMeeting(w, n, true, 'grave', `win ${i}`);
    const earned = n.nemesis!.earned;
    expect(new Set(earned).size).toBe(earned.length);
    const nick = n.nemesis!.nickname;
    for (let i = 0; i < 10; i++) scoreMeeting(w, n, true, 'grave', `more ${i}`);
    expect(n.nemesis!.nickname).toBe(nick);
    expect(n.traits.filter(t => t === 'hothead').length).toBe(1);
  });

  it('it is deterministic: the same seed makes the same name', () => {
    const run = () => { const w = mk(); const n = lt(w); for (let i = 0; i < 12; i++) scoreMeeting(w, n, true, 'grave', `w${i}`); return n.nemesis!.nickname; };
    expect(run()).toBe(run());
  });

  it('the player\'s own crew are never nemeses — that is what CrewInfo is for', () => {
    const w = mk(); const n = lt(w);
    n.crew = { loyalty: 50, cut: 0, status: 'idle', statusDays: 0, joinedDay: 1 };
    scoreMeeting(w, n, true, 'violence', 'should not count');
    expect(n.nemesis).toBeUndefined();
  });
});

describe('a record against the player is a case for the chair', () => {
  it('notoriety puts them in the running, using the crisis system that already existed', () => {
    const w = mk(); const f = anyFaction(w);
    // a third, weaker lieutenant: a faction with exactly two has no shortlist to be left off
    const outsider = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.faction && !x.official)!;
    outsider.faction = f.id; outsider.role = 'lieutenant';
    outsider.skills = { ...outsider.skills, muscle: 0, charm: 0 };
    // and the two who were already there have to be better than them, or "left off the shortlist"
    // is not what is being tested. Generation decides their skills; this does not.
    for (const id of f.lieutenantIds) { const n = w.npcs[id]; n.skills = { ...n.skills, muscle: 8, charm: 8 }; }
    f.lieutenantIds = [...f.lieutenantIds, outsider.id];
    expect(candidatesFor(w, f).slice(0, 2).map(n => n.id)).not.toContain(outsider.id);
    for (let i = 0; i < 12; i++) scoreMeeting(w, outsider, true, 'grave', `win ${i}`);
    expect(successionWeight(outsider)).toBeGreaterThan(0);
    // the claim is that a record against the player moves them up the shortlist, not that they
    // end up first — another lieutenant can out-skill them and still be the better candidate
    expect(candidatesFor(w, f).slice(0, 2).map(n => n.id)).toContain(outsider.id);
  });

  it('and the crisis that starts names them, on the same f.crisis the game already used', () => {
    const w = mk(); const f = anyFaction(w);
    const hard = w.npcs[f.lieutenantIds[f.lieutenantIds.length - 1]];
    for (let i = 0; i < 12; i++) scoreMeeting(w, hard, true, 'grave', `win ${i}`);
    w.npcs[f.bossId].alive = false;
    successionOrDeath(w, f);
    expect(f.crisis).toBeDefined();
    expect(f.crisis!.candidateIds).toContain(hard.id);
  });
});

describe('defection is gated on their own resolved agenda, not a loyalty number', () => {
  const setup = (seed = 55) => {
    const w = mk(seed); const f = anyFaction(w); const n = lt(w, f);
    known(w, n, { trust: 60 });
    n.known = true; n.traits = n.traits.filter(t => t !== 'loyal');
    n.agenda = { kind: 'debt', progress: 40, rate: 3, target: f.id };
    w.player.currentBlockId = n.homeBlockId;
    w.player.cash = 500_000;
    w.player.skills = { ...w.player.skills, charm: 10, brains: 10, muscle: 10 };
    // nothing over them, so the only way in is the favour
    delete w.blocks[n.homeBlockId].influence.player;
    n.ratted = undefined; n.tap = undefined;
    return { w, f, n };
  };

  it('trust alone, however high, is refused', () => {
    const { w, n } = setup();
    n.rel.trust = 100;
    expect(favours(n)).toBe(0);
    const why = defectReason(w, n);
    expect(why).toBeDefined();
    expect(why).toMatch(/Settling something of theirs/);
    expect(can(w, { type: 'defect', npcId: n.id }).ok).toBe(false);
  });

  it('settling their own problem opens it — the same doFavour path a shopkeeper goes through', () => {
    const { w, n } = setup();
    let won = false;
    for (let i = 0; i < 40 && !won; i++) won = resolveAgenda(w, n, 'settle', new Rng(i)).won;
    expect(won).toBe(true);
    expect(favours(n)).toBe(1);
    expect(concessionReason(w, n, 'anything')).toBeUndefined();
    expect(defectReason(w, n)).toBeUndefined();
    expect(can(w, { type: 'defect', npcId: n.id }).ok).toBe(true);
  });

  it('and when they walk, the faction pays for it', () => {
    const { w, f, n } = setup();
    for (let i = 0; i < 40 && !favours(n); i++) resolveAgenda(w, n, 'settle', new Rng(i));
    const before = { standing: f.standing.player, soldiers: f.soldiers, lts: f.lieutenantIds.length };
    const after = dispatch(w, { type: 'defect', npcId: n.id });
    const f2 = after.factions[f.id]; const n2 = after.npcs[n.id];
    expect(n2.crew).toBeDefined();
    expect(after.player.crewIds).toContain(n.id);
    expect(f2.lieutenantIds).not.toContain(n.id);
    expect(f2.lieutenantIds.length).toBe(before.lts - 1);
    expect(f2.soldiers).toBeLessThan(before.soldiers);
    expect(f2.standing.player).toBeLessThan(before.standing);
    expect(ledgerOf(n2).some(e => e.text.includes('walked out'))).toBe(true);
  });

  it('a boss cannot be asked, and neither can a stranger', () => {
    const { w, f } = setup();
    expect(defectReason(w, w.npcs[f.bossId])).toMatch(/boss does not walk away/i);
    const stranger = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.faction)!;
    expect(defectReason(w, stranger)).toMatch(/no outfit/i);
  });

  it('a loyal one will not, whatever you did for them', () => {
    const { w, n } = setup();
    n.traits = [...n.traits, 'loyal'];
    n.rel.favours = 3;
    expect(defectReason(w, n)).toMatch(/loyal to a fault/i);
  });
});

describe('lieutenants scheme against each other, not only upward', () => {
  it('a scheme picks a named peer, preferring one they actually know', () => {
    const w = mk(); const f = anyFaction(w); const n = lt(w, f);
    const peer = w.npcs[f.lieutenantIds[1]];
    n.connections = [{ npcId: peer.id, kind: 'friend', label: 'old friend' }];
    peer.connections = [...peer.connections, { npcId: n.id, kind: 'friend', label: 'old friend' }];
    expect(schemeTarget(w, n, new Rng(3))).toBe(peer.id);
  });

  it('and it resolves inside the faction, pushing one of them out', () => {
    const w = mk(); const f = anyFaction(w); const n = lt(w, f);
    const peer = w.npcs[f.lieutenantIds[1]];
    n.skills = { ...n.skills, brains: 10, charm: 10 };
    peer.skills = { ...peer.skills, brains: 0, charm: 0 };
    n.agenda = { kind: 'ambition', progress: 100, rate: 3, target: peer.id };
    expect(resolveScheme(w, n, new Rng(2))).toBe(true);
    expect(f.lieutenantIds).not.toContain(peer.id);
    expect(peer.faction).toBeUndefined();
    expect(notoriety(n)).toBeGreaterThan(0);
  });

  it('a scheme that misses costs the schemer instead', () => {
    const w = mk(); const f = anyFaction(w); const n = lt(w, f);
    const peer = w.npcs[f.lieutenantIds[1]];
    n.skills = { ...n.skills, brains: 0, charm: 0 };
    peer.skills = { ...peer.skills, brains: 10, charm: 10 };
    n.agenda = { kind: 'ambition', progress: 100, rate: 3, target: peer.id };
    expect(resolveScheme(w, n, new Rng(9))).toBe(false);
    expect(f.lieutenantIds).toContain(peer.id);
    expect(n.role).toBe('soldier');
  });

  it('nobody schemes against themselves, or against an empty bench', () => {
    const w = mk(); const f = anyFaction(w); const n = lt(w, f);
    f.lieutenantIds = [n.id];
    expect(schemeTarget(w, n, new Rng(1))).toBeUndefined();
  });
});

describe('the numbers stay where balance lives', () => {
  it('every milestone is a single legible change, in ascending order', () => {
    for (let i = 1; i < MILESTONES.length; i++) expect(MILESTONES[i].at).toBeGreaterThan(MILESTONES[i - 1].at);
    for (const m of MILESTONES) {
      const changes = [m.trait, m.skill, m.nickname].filter(Boolean).length;
      expect(changes, m.id).toBe(1);
    }
    expect(NEMESIS.known).toBeLessThan(MILESTONES[0].at + 10);
  });
});
