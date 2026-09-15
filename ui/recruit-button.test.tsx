/**
 * The door into a recruit conversation.
 *
 * The bug this pins: tapping "Recruit" opens a scene, and the scene is where you choose *how* to
 * ask — a wage (`cut`, $200), a straight pitch (`promise`, which wants a favour done or leverage
 * held), or fear (`lean`). But the door check asked whether one specific approach would work,
 * because `sceneAction` was called with no approach and the recruit gate defaults an absent one to
 * `promise`. So the hardest of the three decided whether the conversation opened at all, and a
 * player with money in their pocket and fear on the street could not recruit an ordinary patron
 * they had simply never done a favour for.
 *
 * The rule: **the door opens if any approach could close it.** Each approach keeps its own gate
 * inside the scene, which is where a player picks one.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RECRUIT_LEAN_FEAR } from '@content/standing';
import { can, generateWorld, select, type Npc, type World } from '@sim/index';
import { NpcSheet } from './components/NpcSheet';
import { SceneSheet } from './components/SceneSheet';
import { act, newGame } from './store';
import { plain } from './test-util';

const mk = (seed = 12): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = []; w.day = 30;
  return w;
};

/**
 * An ordinary patron: known, familiar, standing in front of you — and with **no favour done and
 * nothing held over them**, which is exactly the person the old door turned away.
 */
function plainPatron(w: World): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official && x.role === 'patron')
    ?? Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
  n.role = 'patron'; n.faction = undefined; n.known = true;
  n.rel = { ...n.rel, trust: 55, fear: 0, metDay: 1, contacts: 9, owedToThem: 0, favours: 0 };
  n.traits = n.traits.filter(t => t !== 'loyal');
  n.homeBlockId = w.player.currentBlockId!;
  n.tap = undefined; n.ratted = undefined;
  return n;
}

const open = (w: World, n: Npc) => can(w, { type: 'talk', scene: 'recruit', npcId: n.id });

describe('the door asks whether ANY approach could close it', () => {
  it('opens for a patron who cannot be promised but can be paid', () => {
    const w = mk();
    const n = plainPatron(w);
    w.player.cash = 5000;
    // the premise: the straight pitch is genuinely shut, and the wage is genuinely open
    expect(can(w, { type: 'recruit', npcId: n.id, approach: 'promise' }).ok, 'promise should be shut for this test to mean anything').toBe(false);
    expect(can(w, { type: 'recruit', npcId: n.id, approach: 'cut' }).ok).toBe(true);
    const why = open(w, n);
    expect(why.ok, why.ok ? '' : why.reason).toBe(true);
  });

  it('opens for a patron who cannot be promised or paid but can be leaned on', () => {
    const w = mk();
    const n = plainPatron(w);
    w.player.cash = 0;                       // no wage
    n.rel.fear = RECRUIT_LEAN_FEAR + 10;     // but real fear
    expect(can(w, { type: 'recruit', npcId: n.id, approach: 'promise' }).ok).toBe(false);
    expect(can(w, { type: 'recruit', npcId: n.id, approach: 'cut' }).ok).toBe(false);
    expect(can(w, { type: 'recruit', npcId: n.id, approach: 'lean' }).ok).toBe(true);
    const why = open(w, n);
    expect(why.ok, why.ok ? '' : why.reason).toBe(true);
  });

  it('and stays shut when every approach is shut', () => {
    const w = mk();
    const n = plainPatron(w);
    w.player.cash = 0;
    n.rel.fear = 0;
    const why = open(w, n);
    expect(why.ok).toBe(false);
    // and says what each door would take, rather than only the hardest one's reason
    expect(why.ok ? '' : why.reason).toMatch(/\$200|up front/);
  });

  it('a shut door for a reason that is nothing to do with the approach still says so', () => {
    const w = mk();
    const n = plainPatron(w);
    w.player.cash = 5000;
    w.player.ap = 0;
    const why = open(w, n);
    expect(why.ok ? '' : why.reason).toMatch(/AP|action/i);
  });

  it('opening the conversation still costs nothing at the door', () => {
    const w = mk();
    const n = plainPatron(w);
    w.player.cash = 5000;
    const why = open(w, n);
    expect(why.ok && why.cost).toBeFalsy();
  });
});

describe('once the conversation is open, the menu says which doors are shut', () => {
  it('a player who got in on the wage sees the straight pitch disabled, with the reason', () => {
    const w = mk();
    const n = plainPatron(w);
    w.player.cash = 5000;
    newGame(w);
    act({ type: 'talk', scene: 'recruit', npcId: n.id });
    const html = plain(renderToString(<SceneSheet />));
    expect(html).toContain('Offer a real cut');
    expect(html).toContain('Sell the dream');
    // the shut one carries its refusal where the cost normally goes
    expect(html).toMatch(/not a thing you ask a friend for|Do something real for them/);
  });
});

describe('the button on the sheet', () => {
  const render = (w: World, n: Npc) => { newGame(w); return plain(renderToString(<NpcSheet npcId={n.id} />)); };

  it('is there and enabled for a patron who can only afford the wage', () => {
    const w = mk();
    const n = plainPatron(w);
    w.player.cash = 5000;
    const html = render(w, n);
    expect(html).toContain('Recruit');
    // the button is the one immediately before its own label; a disabled one carries the attribute
    expect(html).not.toMatch(/disabled[^>]*>[^<]*<svg[^>]*data-icon="person"[^>]*>[\s\S]{0,80}Recruit/);
  });

  it('is there for a fixer, whose role the sheet used not to list at all', () => {
    const w = mk();
    const n = plainPatron(w);
    n.role = 'fixer';
    expect(render(w, n)).toContain('Recruit');
  });

  it('is there for a soldier who belongs to nobody', () => {
    const w = mk();
    const n = plainPatron(w);
    n.role = 'soldier'; n.faction = undefined;
    expect(render(w, n)).toContain('Recruit');
  });

  it('is absent for a soldier wearing somebody else\'s colours', () => {
    const w = mk();
    const n = plainPatron(w);
    n.role = 'soldier'; n.faction = Object.values(w.factions)[0].id;
    expect(render(w, n)).not.toContain('Recruit');
  });

  it('is absent for somebody already on your books', () => {
    const w = mk();
    const n = plainPatron(w);
    n.crew = { status: 'idle', loyalty: 50, cut: 100, joinedDay: 1 } as never;
    expect(render(w, n)).not.toContain('Recruit');
  });

  it('the sheet and the reducer agree on every role, which is the point', () => {
    const w = mk();
    const n = plainPatron(w);
    for (const role of ['patron', 'owner', 'soldier', 'fixer', 'boss', 'lieutenant'] as const) {
      n.role = role; n.faction = undefined;
      const allowed = !select.recruitRoleReason(n);
      expect(render(w, n).includes('Recruit'), `${role}: sheet and reducer disagree`).toBe(allowed);
    }
  });
});
