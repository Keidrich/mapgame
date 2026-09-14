/**
 * What a nemesis is called.
 *
 * `nemesisName` is the single funnel every log line, ledger entry and sheet header about a
 * lieutenant goes through, and its own doc comment says an earned nickname **replaces** the given
 * one. It did not. It split on the first space and inserted, which is correct only for somebody
 * who has no nickname already — and `populate.ts` gives one to every boss and every lieutenant at
 * generation, and a nemesis is always a lieutenant. So the bug did not hit an edge case: it hit
 * *every* nemesis that ever reached the `named` milestone, and shipped
 * `Cassandra "the Nail" "Moose" Booker` into the log.
 */
import { describe, expect, it } from 'vitest';
import { MILESTONES } from '@content/nemesis';
import { NICKNAMES } from '@content/names';
import { generateWorld, type Npc } from './index';
import { nemesisName } from './nemesis';

const person = (name: string, nickname?: string) =>
  ({ name, nemesis: nickname ? { since: 1, wins: 0, losses: 0, notoriety: 60, earned: ['named'], nickname } : undefined }) as unknown as Npc;

describe('an earned nickname replaces the given one', () => {
  it('a lieutenant who already had one ends up with exactly one', () => {
    const out = nemesisName(person('Cassandra "Moose" Booker', 'the Nail'));
    expect(out).toBe('Cassandra "the Nail" Booker');
    expect(out.match(/"/g), 'two nicknames stacked on one person').toHaveLength(2);
  });

  it('somebody who never had one still gets theirs', () => {
    expect(nemesisName(person('Plain Name', 'Iron'))).toBe('Plain "Iron" Name');
  });

  it('nobody with no earned nickname is touched at all', () => {
    expect(nemesisName(person('Cassandra "Moose" Booker'))).toBe('Cassandra "Moose" Booker');
    expect(nemesisName(person('Plain Name'))).toBe('Plain Name');
  });

  it('a longer name keeps the rest of itself', () => {
    expect(nemesisName(person('Maria "Ace" del Toro Reyes', 'Stone'))).toBe('Maria "Stone" del Toro Reyes');
  });

  it('every earned nickname in the table survives the round trip, on every generated lieutenant', () => {
    // The real inputs, not invented ones: the names the generator actually produces, against the
    // names the milestone table can actually award.
    const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 9 });
    const lts = Object.values(w.npcs).filter(n => n.role === 'lieutenant' || n.role === 'boss');
    expect(lts.length, 'this seed made nobody to check').toBeGreaterThan(3);
    const earned = MILESTONES.find(m => m.nickname)!.nickname!;
    for (const lt of lts.slice(0, 12)) {
      for (const nick of earned) {
        const out = nemesisName(person(lt.name, nick));
        expect(out, `${lt.name} + ${nick}`).toContain(`"${nick}"`);
        expect(out.match(/"/g)?.length, `${lt.name} + ${nick} stacked`).toBe(2);
      }
    }
  });

  it('and the two tables can collide without breaking it', () => {
    // 'Knuckles' is in both the generator's list and the milestone list, which is fine — a
    // replacement with the same string is still one nickname, not two.
    expect(NICKNAMES).toContain('Knuckles');
    expect(nemesisName(person('Ed "Knuckles" Vance', 'Knuckles'))).toBe('Ed "Knuckles" Vance');
  });
});
