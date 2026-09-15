/**
 * The front page.
 *
 * The constraint that makes this worth having: **it is generated from `w.log`**, which the game
 * has been writing all along for its own reasons. No new tracking, no parallel record of what
 * happened. If a system stops logging something its headline stops appearing, which is correct
 * rather than a bug to route around.
 *
 * The other half is that it is the *city's* view: late, slightly wrong, and about what got out.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { headlines, hasNews } from '@sim/news';
import { generateWorld, type World } from '@sim/index';
import { NewsTicker } from './components/NewsTicker';
import { newGame } from './store';
import { plain } from './test-util';

const mk = (): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 500 });
  w.pendingEvents = []; w.day = 40;
  return w;
};
/** Put a line in the log the way the game does, and let the desk find it. */
const logged = (w: World, text: string, day = w.day - 2) => { w.log.push({ day, text, tone: 'info', refs: {} }); return w; };

describe('it reads the log the game was already writing', () => {
  it('a bust becomes a front page', () => {
    const w = logged(mk(), 'BUSTED. The task force came through everything at once. $8,000 dirty cash and all product seized.');
    const out = headlines(w);
    expect(out.length).toBe(1);
    expect(out[0].text).toMatch(/TASK FORCE/);
    expect(out[0].tone).toBe('big');
  });

  it('a war between two outfits becomes one', () => {
    const w = logged(mk(), 'Los Delgado and Iron Saints MC are at war. Their blocks will be a mess for a while.');
    expect(headlines(w)[0].text).toMatch(/DELGADO/i);
  });

  it('an outfit being finished becomes one', () => {
    const w = logged(mk(), 'The Romano Family are finished. You broke them — no soldiers, no corners, nobody to send.');
    expect(headlines(w)[0].text).toMatch(/THE END OF/i);
  });

  it('and a quiet week produces no paper at all', () => {
    const w = mk();
    expect(headlines(w)).toEqual([]);
    expect(hasNews(w)).toBe(false);
  });

  it('nothing is invented: a log with nothing newsworthy in it stays blank', () => {
    const w = mk();
    for (let i = 0; i < 40; i++) logged(w, `You walk from A to B. 1 legwork, ${i} left.`);
    expect(headlines(w)).toEqual([]);
  });
});

describe('it is the city talking, not the player', () => {
  it('the paper is a day behind: nothing is news the morning it happens', () => {
    const w = mk();
    logged(w, 'BUSTED. The task force came through everything at once.', w.day);
    expect(headlines(w), 'this morning was in this morning\'s paper').toEqual([]);
    w.day += 2;
    expect(headlines(w).length).toBe(1);
  });

  it('and a story runs once, however many times it was logged', () => {
    const w = mk();
    for (let i = 0; i < 5; i++) logged(w, 'BUSTED. The task force came through everything at once.', w.day - 2 - i);
    expect(headlines(w).length).toBe(1);
  });

  it('old news comes off the front page', () => {
    const w = mk();
    logged(w, 'BUSTED. The task force came through everything at once.', 2);
    w.day = 200;
    expect(headlines(w)).toEqual([]);
  });

  it('and it is capped, because a long save has a very long log', () => {
    const w = mk();
    for (let i = 0; i < 60; i++) logged(w, `The Family${i} are finished. Somebody broke them.`, w.day - 2);
    expect(headlines(w, 5).length).toBe(5);
  });
});

describe('and it renders', () => {
  it('the headlines are on the screen, with the day they ran', () => {
    const w = logged(mk(), 'BUSTED. The task force came through everything at once.');
    newGame(w);
    const html = plain(renderToString(<NewsTicker />));
    expect(html).toContain('TASK FORCE');
    expect(html).toContain(`DAY ${w.day - 2}`);
    expect(html).toContain('Register');
  });

  it('and it is not there at all when there is nothing to print', () => {
    newGame(mk());
    expect(plain(renderToString(<NewsTicker />))).toBe('');
  });

  it('it draws no emoji, like every other screen', () => {
    const w = logged(mk(), 'BUSTED. The task force came through everything at once.');
    newGame(w);
    const html = plain(renderToString(<NewsTicker />));
    expect(html.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)).toBeNull();
  });
});
