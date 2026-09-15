/**
 * What the street ends up calling you.
 *
 * A lieutenant who kept turning up earned a name that replaced theirs everywhere, and the player
 * — the reason any of it happened — stayed whatever they typed at the character screen. This is
 * the same mechanism pointed the other way, and deliberately *the same code*: `withNickname` is
 * what puts a name on a nemesis and what puts one on you, so the two cannot drift apart.
 *
 * The part worth testing hardest is which pool it draws from. Fear and respect are two different
 * ways of being somebody, the game has tracked both since the standing rework, and nothing has
 * ever read the difference out loud — so the name is a summary of how you have been playing.
 */
import { describe, expect, it } from 'vitest';
import { FEARED_NAMES, KNOWN_NAMES, RESPECTED_NAMES, STREET_NAME } from '@content/nemesis';
import { PLAYER, dispatch, generateWorld, select, type World } from './index';
import { earnStreetName, playerName, withNickname } from './nemesis';

const mk = (fear = 0, respect = 0): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'Tommy Vance', background: 'muscle', seed: 7 });
  w.pendingEvents = []; w.player.fear = fear; w.player.respect = respect;
  return w;
};

describe('a name attaches at the threshold and not before', () => {
  it('below it you are what you typed', () => {
    const w = mk(STREET_NAME.at - 1, 10);
    earnStreetName(w);
    expect(w.player.street).toBeUndefined();
    expect(playerName(w)).toBe('Tommy Vance');
  });

  it('at it, somebody says it to your face', () => {
    const w = mk(STREET_NAME.at, 10);
    earnStreetName(w);
    expect(w.player.street).toBeTruthy();
    expect(playerName(w)).toBe(`Tommy "${w.player.street}" Vance`);
  });

  it('and it sticks: it does not come off when the heat dies down', () => {
    const w = mk(90, 10);
    earnStreetName(w);
    const earned = w.player.street;
    w.player.fear = 0; w.player.respect = 0;
    earnStreetName(w);
    expect(w.player.street, 'the street forgot a name it had already given you').toBe(earned);
  });

  it('and it never changes once given, however you play afterwards', () => {
    const w = mk(90, 5);
    earnStreetName(w);
    const feared = w.player.street;
    w.player.fear = 5; w.player.respect = 95;
    earnStreetName(w);
    expect(w.player.street).toBe(feared);
  });
});

describe('which name depends on how you got there', () => {
  it('somebody people are careful around', () => {
    const w = mk(80, 20);
    earnStreetName(w);
    expect(FEARED_NAMES, `${w.player.street} is not a feared name`).toContain(w.player.street);
  });

  it('somebody people go to', () => {
    const w = mk(20, 80);
    earnStreetName(w);
    expect(RESPECTED_NAMES).toContain(w.player.street);
  });

  it('and somebody the street has not made its mind up about', () => {
    const w = mk(70, 70);
    earnStreetName(w);
    expect(KNOWN_NAMES).toContain(w.player.street);
  });
});

describe('it is the nemesis mechanism, not a second one', () => {
  it('the same function names a lieutenant and names you', () => {
    expect(withNickname('Tommy Vance', 'Sunday')).toBe('Tommy "Sunday" Vance');
    // and it replaces rather than stacks, which is the bug that mechanism was carrying
    expect(withNickname('Tommy "Moose" Vance', 'Sunday')).toBe('Tommy "Sunday" Vance');
  });

  it('a replay of the same seed gives the same name', () => {
    const a = mk(80, 20); earnStreetName(a);
    const b = mk(80, 20); earnStreetName(b);
    expect(a.player.street).toBe(b.player.street);
  });
});

describe('and it turns up where the player would see it', () => {
  it('the street name is how the game refers to you everywhere the outfits are named', () => {
    const w = mk(85, 20);
    earnStreetName(w);
    // `factionName(PLAYER)` is the map legend, the holdings rows, the faction screens
    expect(select.factionName(w, PLAYER)).toContain(`"${w.player.street}"`);
  });

  it('it is announced once, in the log, when it happens', () => {
    const w = mk(85, 20);
    const before = w.log.length;
    earnStreetName(w);
    const lines = w.log.slice(before).map(l => l.text);
    expect(lines.join(' ')).toContain(w.player.street!);
    const again = w.log.length;
    earnStreetName(w);
    expect(w.log.length, 'the street announced the same name twice').toBe(again);
  });

  it('a played game gets there on its own, without anybody setting a field', () => {
    let w = mk(0, 0);
    w.player.fear = STREET_NAME.at + 4;
    for (let i = 0; i < 3 && !w.player.street; i++) { w.pendingEvents = []; w = dispatch(w, { type: 'end_day' }); }
    expect(w.player.street, 'the tick never gave a name to somebody well past the line').toBeTruthy();
  });
});
