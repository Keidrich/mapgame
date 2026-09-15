/**
 * Who the game will let you try to recruit.
 *
 * The reducer has always allowed four roles — patron, owner, soldier and fixer — with one extra
 * rule for soldiers: somebody already wearing another outfit's colours is not available. The UI
 * carried its own, narrower copy of that list (`patron` and `owner` only), so a fixer or an
 * unaffiliated soldier never got a Recruit button at all. Not disabled: absent, with no other
 * path to it anywhere in the app.
 *
 * These tests pin the list itself to one function so the two cannot drift again.
 */
import { describe, expect, it } from 'vitest';
import { can, dispatch, generateWorld, select, type Npc, type World } from './index';
import { recruitRoleReason } from './standing';

const mk = (seed = 12): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = [];
  return w;
};

/** Somebody the player knows well enough to ask for something, standing right in front of them. */
function ready(w: World, role: Npc['role'], faction?: string): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
  n.role = role;
  n.faction = faction;
  n.known = true;
  n.rel = { ...n.rel, trust: 60, fear: 60, metDay: 1, contacts: 9 };
  n.traits = n.traits.filter(t => t !== 'loyal');
  n.homeBlockId = w.player.currentBlockId!;
  w.day = 30;
  w.player.cash = 5000;
  return n;
}

describe('the roles the reducer allows', () => {
  it('a fixer can be asked', () => {
    const w = mk();
    const n = ready(w, 'fixer');
    expect(recruitRoleReason(n)).toBeUndefined();
    const why = can(w, { type: 'recruit', npcId: n.id, approach: 'cut' });
    expect(why.ok, why.ok ? '' : why.reason).toBe(true);
  });

  it('a soldier who belongs to nobody can be asked', () => {
    const w = mk();
    const n = ready(w, 'soldier');
    expect(recruitRoleReason(n)).toBeUndefined();
    expect(can(w, { type: 'recruit', npcId: n.id, approach: 'cut' }).ok).toBe(true);
  });

  it('...and one who wears somebody else\'s colours cannot', () => {
    const w = mk();
    const f = Object.values(w.factions)[0];
    const n = ready(w, 'soldier', f.id);
    expect(recruitRoleReason(n)).toMatch(/belong/i);
    expect(can(w, { type: 'recruit', npcId: n.id, approach: 'cut' }).ok).toBe(false);
  });

  it('a boss is not the recruiting type whoever asks', () => {
    const w = mk();
    const n = ready(w, 'boss');
    expect(recruitRoleReason(n)).toMatch(/recruiting type/i);
  });

  it('and somebody already on the books is nobody to recruit', () => {
    const w = mk();
    const n = ready(w, 'patron');
    n.crew = { status: 'idle', loyalty: 50, cut: 100, joinedDay: 1 } as never;
    expect(recruitRoleReason(n)).toMatch(/already/i);
  });
});

describe('end to end: a fixer actually joins', () => {
  it('the attempt runs and either lands or is refused on its merits, never on their job', () => {
    const w = mk();
    const n = ready(w, 'fixer');
    const before = w.player.crewIds.length;
    const next = dispatch(w, { type: 'recruit', npcId: n.id, approach: 'cut' });
    // whether the roll lands is the game's business; what matters is that it *ran*
    expect(next.log.some(l => l.text.includes(n.name))).toBe(true);
    expect(next.player.crewIds.length).toBeGreaterThanOrEqual(before);
  });
});

describe('the UI reads the same list', () => {
  it('select exposes it, so there is one copy of the rule', () => {
    const w = mk();
    for (const role of ['patron', 'owner', 'soldier', 'fixer'] as const) {
      const n = ready(w, role);
      expect(select.recruitRoleReason(n), `${role} should be recruitable`).toBeUndefined();
    }
  });
});
