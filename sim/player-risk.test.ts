/**
 * The arrow pointing the other way.
 *
 * The player has always been able to send somebody after anybody. Nobody has ever been able to
 * send somebody after the player — a faction wrecked a racket or leaned on a crew member, and
 * that was the whole of what losing looked like. This is the existing confrontation machinery
 * aimed inward: same queue, same three answers, same kit maths, same "ignore it and End Day lands
 * it" rule. What is new is only that it can be aimed at you.
 */
import { describe, expect, it } from 'vitest';
import { MILESTONES } from '@content/nemesis';
import { COMES_FOR_YOU, hunters, personalCover, willComeForYou } from './legacy';
import { queueConfrontation, resolveConfrontation } from './combat';
import { PLAYER, dispatch, generateWorld, select, type Npc, type World } from './index';
import { Rng } from './rng';

function war(escalated = true, crew = 3): { w: World; villain: Npc } {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 77 });
  w.pendingEvents = []; w.day = 80; w.player.dirty = 30_000; w.player.cash = 200_000;
  const f = Object.values(w.factions)[0];
  f.stance[PLAYER] = 'war'; f.standing[PLAYER] = -100;
  const villain = f.lieutenantIds.map(id => w.npcs[id]).find(n => n?.alive)!;
  villain.nemesis = { since: 20, wins: 7, losses: 1, notoriety: escalated ? 75 : 30, earned: escalated ? ['hardened', 'muscle', 'named', 'connected'] : ['hardened'], nickname: escalated ? 'the Nail' : undefined };
  for (const n of Object.values(w.npcs).filter(x => x.alive && x.role === 'patron').slice(0, crew)) {
    n.role = 'crew'; n.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 10 };
    w.player.crewIds.push(n.id); w.player.crewEver++;
  }
  return { w, villain };
}
const comeForYou = (w: World, villain: Npc, kind: 'you' | 'loved', npcId?: string) =>
  queueConfrontation(w, { factionId: villain.faction!, kind, war: true, npcId, blockId: w.player.currentBlockId, byNpcId: villain.id, text: 'They are across the street.' });

describe('only somebody who has got far enough comes for you', () => {
  it('a lieutenant with a bit of a record does not', () => {
    const { w, villain } = war(false);
    expect(willComeForYou(villain)).toBe(false);
    expect(hunters(w)).not.toContain(villain);
  });

  it('one past the milestones does', () => {
    const { w, villain } = war(true);
    expect(willComeForYou(villain)).toBe(true);
    expect(hunters(w)[0]?.id).toBe(villain.id);
  });

  it('and the milestones it keys on are real entries in the table', () => {
    for (const id of COMES_FOR_YOU) expect(MILESTONES.some(m => m.id === id), id).toBe(true);
  });
});

describe('it is the same machinery, pointed inward', () => {
  it('it queues as an ordinary confrontation with the ordinary three answers', () => {
    const { w, villain } = war();
    const c = comeForYou(w, villain, 'you');
    expect(select.confrontations(w)).toContain(c);
    const opts = select.confrontOptions(w, c).map(o => o.id);
    expect(opts.sort()).toEqual(['backup', 'fight', 'flee']);
  });

  it('standing and fighting can see them off, and it is scored as a meeting like any other', () => {
    const { w, villain } = war();
    const c = comeForYou(w, villain, 'you');
    const before = villain.nemesis!.losses;
    resolveConfrontation(w, c, 'fight', new Rng(1));
    expect(villain.nemesis!.wins + villain.nemesis!.losses).toBeGreaterThan(before);
  });

  it('and ignoring it lands, the way ignoring anything else lands', () => {
    const { w, villain } = war();
    const c = comeForYou(w, villain, 'you');
    const respect = w.player.respect;
    resolveConfrontation(w, c, 'absent', new Rng(3));
    expect(w.player.respect, 'they came for you and nothing at all happened').toBeLessThanOrEqual(respect);
  });
});

describe('what it can actually cost', () => {
  it('sometimes they get to you, and then the outfit changes hands', () => {
    // Rolled across many seeds because the outcome is a distribution — the point is that the
    // worst case is reachable at all, not that it happens every time.
    let deaths = 0, hurt = 0, walked = 0;
    for (let i = 0; i < 60; i++) {
      const { w, villain } = war(true, 0);
      w.player.lifestyle = {};                       // nobody in the way
      const c = comeForYou(w, villain, 'you');
      const name = w.player.name;
      resolveConfrontation(w, c, 'absent', new Rng(500 + i * 733));
      if (w.player.name !== name || w.gameOver) deaths++;
      else if (w.player.jailedDays > 0) hurt++;
      else walked++;
    }
    expect(deaths, 'the worst case is unreachable, so there is no risk').toBeGreaterThan(0);
    expect(walked + hurt, 'every single one was fatal, which is not a game').toBeGreaterThan(0);
  });

  it('and the men you pay for are why it usually is not', () => {
    const bare = war(true, 0).w;
    const guarded = war(true, 0).w;
    guarded.player.lifestyle = { security: 3, home: 3 };
    expect(personalCover(guarded)).toBeGreaterThan(personalCover(bare));

    const count = (w: World) => {
      let bad = 0;
      for (let i = 0; i < 40; i++) {
        const fresh = war(true, 0);
        fresh.w.player.lifestyle = { ...w.player.lifestyle };
        const c = comeForYou(fresh.w, fresh.villain, 'you');
        resolveConfrontation(fresh.w, c, 'absent', new Rng(900 + i * 611));
        if (fresh.w.player.jailedDays > 0 || fresh.w.gameOver || fresh.w.player.succeededFrom?.length) bad++;
      }
      return bad;
    };
    expect(count(guarded), 'paying for a detail bought nothing on the night').toBeLessThan(count(bare));
  });
});

describe('and they can come for somebody else instead', () => {
  it('taking the one person outside it all is a thing that can happen', () => {
    const { w, villain } = war();
    const loved = select.lovedOne(w)!;
    const c = comeForYou(w, villain, 'loved', loved.id);
    resolveConfrontation(w, c, 'absent', new Rng(2));
    expect(w.npcs[loved.id].taken, 'they came for them and left them there').toBeTruthy();
  });

  it('a played war eventually produces one of these on its own', () => {
    // End to end through the real tick, because a queue entry built by hand proves only that
    // `resolveConfrontation` works.
    let { w } = war();
    let seen = false;
    for (let i = 0; i < 120 && !seen; i++) {
      w.pendingEvents = [];
      for (const c of select.confrontations(w)) { if (c.kind === 'you' || c.kind === 'loved') seen = true; resolveConfrontation(w, c, 'fight', new Rng(i + 1)); }
      if (w.gameOver) break;
      w = dispatch(w, { type: 'end_day' });
    }
    expect(seen, 'a hundred and twenty days at war and nobody ever came for the player').toBe(true);
  });
});
