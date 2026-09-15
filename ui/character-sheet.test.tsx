/**
 * The character sheet: equipping from it moves the *right* person's kit.
 *
 * Every other bug of this shape this month was a control narrower than the rule behind it. This is
 * the opposite risk and the one a per-person inventory invites: a control that works, and writes to
 * the wrong person — the sheet says Darlene and the shotgun lands in the player's hands, because
 * every `equip` in the app had meant "mine" for the whole of its life and the new `npcId` was left
 * off one button.
 *
 * So these assert the target, not the outcome: after equipping from *their* sheet, the player's own
 * kit is byte-identical to what it was. A test that only checked the crew member's array would pass
 * against a reducer that wrote to both.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EQUIP_MAX, ITEM_DEFS } from '@content/items';
import { can, dispatch, generateWorld, type Npc, type World } from '@sim/index';
import { CharacterSheet } from './components/CharacterSheet';
import { act, getState, newGame } from './store';
import { asHtml, plain } from './test-util';

function mk(seed = 12): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
  w.pendingEvents = []; w.day = 30;
  w.player.items = []; w.player.equipped = [];
  return w;
}
/** Somebody of yours, with a bat and a lockpick set of their own in the bag. */
function hire(w: World, items: string[] = ['bat']): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
  n.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
  n.role = 'crew'; n.known = true; w.player.crewIds.push(n.id);
  n.items = [...items];
  return n;
}
const render = (w: World, n: Npc) => { newGame(w); return plain(renderToString(<CharacterSheet npcId={n.id} />)); };
/** What the store is holding now — `act` replaces the world rather than mutating it. */
const now = (): World => getState().world!;

describe('what the sheet shows', () => {
  it('is that person: their name, their status, their skills and their own loadout', () => {
    const w = mk();
    const n = hire(w, ['bat', 'lockpicks']);
    const html = render(w, n);
    expect(html).toContain('Character sheet');
    expect(html).toContain(`loadout (0/${EQUIP_MAX} carried)`);
    expect(html).toContain(ITEM_DEFS.bat.label);
    expect(html).toContain(ITEM_DEFS.lockpicks.label);
    expect(html).toContain('idle');
    // Named on the panel itself: it is mounted inside somebody's sheet, and equipping the wrong
    // person is the mistake this whole file exists to catch.
    expect(html).toContain(asHtml(n.name.split(' ')[0]));
  });

  it('shows nothing of the player’s, however much the player is carrying', () => {
    const w = mk();
    const n = hire(w, ['bat']);
    w.player.items = ['ar15']; w.player.equipped = ['ar15'];
    const html = render(w, n);
    expect(html).toContain(ITEM_DEFS.bat.label);
    expect(html).not.toContain(ITEM_DEFS.ar15.label);
  });
});

describe('equipping from it', () => {
  it('puts the item on them and leaves the player’s kit untouched', () => {
    const w = mk();
    const n = hire(w, ['bat']);
    w.player.items = ['ar15']; w.player.equipped = ['ar15'];
    newGame(w);

    expect(act({ type: 'equip', itemId: 'bat', on: true, npcId: n.id })).toBe(true);

    const next = now();
    expect(next.npcs[n.id].equipped).toEqual(['bat']);
    // The assertion that actually catches the bug: yours did not move.
    expect(next.player.equipped).toEqual(['ar15']);
    expect(next.player.items).toEqual(['ar15']);
  });

  it('takes it off them again, and still leaves the player alone', () => {
    const w = mk();
    const n = hire(w, ['bat']);
    w.npcs[n.id].equipped = ['bat'];
    w.player.items = ['ar15']; w.player.equipped = ['ar15'];
    newGame(w);

    expect(act({ type: 'equip', itemId: 'bat', on: false, npcId: n.id })).toBe(true);
    const next = now();
    expect(next.npcs[n.id].equipped).toEqual([]);
    expect(next.npcs[n.id].items).toEqual(['bat']);   // still theirs, just not in their hands
    expect(next.player.equipped).toEqual(['ar15']);
  });

  it('gives them their own three slots: EQUIP_MAX is per person, not per outfit', () => {
    const w = mk();
    const n = hire(w, ['bat', 'knuckles', 'lockpicks', 'burner']);
    // The player is already at their own limit and it makes no difference to anybody else's.
    w.player.items = ['bat', 'knuckles', 'lockpicks'];
    w.player.equipped = ['bat', 'knuckles', 'lockpicks'];
    expect(can(w, { type: 'equip', itemId: 'burner', on: true }).ok).toBe(false);
    expect(can(w, { type: 'equip', itemId: 'bat', on: true, npcId: n.id }).ok).toBe(true);

    let cur = w;
    for (const id of ['bat', 'knuckles', 'lockpicks']) cur = dispatch(cur, { type: 'equip', itemId: id, on: true, npcId: n.id });
    expect(cur.npcs[n.id].equipped).toHaveLength(EQUIP_MAX);
    // …and then they are full too, on their own count.
    const full = can(cur, { type: 'equip', itemId: 'burner', on: true, npcId: n.id });
    expect(full.ok).toBe(false);
    expect(full.ok === false && full.reason).toContain(cur.npcs[n.id].name);
  });
});

describe('whose pockets you can reach into', () => {
  it('refuses somebody who does not work for you', () => {
    const w = mk();
    const stranger = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
    stranger.items = ['bat'];
    const r = can(w, { type: 'equip', itemId: 'bat', on: true, npcId: stranger.id });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain('does not work for you');
  });

  it('refuses somebody in a cell, and says so in their own name', () => {
    const w = mk();
    const n = hire(w, ['bat']);
    n.crew!.status = 'jailed'; n.crew!.statusDays = 8;
    const r = can(w, { type: 'equip', itemId: 'bat', on: true, npcId: n.id });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain(n.name);
  });
});
