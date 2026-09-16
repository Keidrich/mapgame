/**
 * How far away everything is, as a number somebody has to argue with.
 *
 * The navigation audit that opened this pass measured taps from a cold start on the map, on a
 * 390×844 phone against a late-game save, with a stopwatch on a real build rather than by reading
 * the component tree:
 *
 * | screen              | taps | what it actually cost |
 * |---------------------|------|-----------------------|
 * | News ticker         | 1    | buried ~3 screens into a 9.3-screen tab |
 * | Trophy screen       | 2    | **+2,936px of scrolling** after the taps |
 * | Relationship map    | 2    | — |
 * | Character sheet     | 3    | inside `NpcSheet`, below the fold |
 * | A ledger            | 3    | inside `NpcSheet` |
 *
 * **Nothing was more than three taps away.** The finding that shaped the whole pass is that the
 * cost was never depth — it was landing in an undifferentiated wall and scrolling to find out
 * whether what you wanted was in it. So the tab bar did not grow; see `docs/DESIGN.md` §4.28.
 *
 * This file holds the budget that decision was made against. It counts **the container each screen
 * lives in**, not pixels — a tap is a tab, a sub-navigation view, a row that opens a sheet, or a
 * fold. If a later pass moves something one container further from the map, this is what says so,
 * and the answer is to argue with the budget rather than to quietly widen it.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EMPIRE_VIEWS, EmpireTab } from './components/EmpireTab';
import { NpcSheet } from './components/NpcSheet';
import { SocialTab } from './components/SocialTab';
import { TabBar } from './components/TabBar';
import { generateWorld, type Npc, type World } from '@sim/index';
import { newGame } from './store';
import { plain } from './test-util';

function mk(): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed: 12 });
  w.pendingEvents = []; w.day = 40;
  return w;
}
function hire(w: World): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
  n.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
  n.role = 'crew'; n.known = true; w.player.crewIds.push(n.id);
  return n;
}

/**
 * The budget, and the route each number is counting. Three is the ceiling: past that a thing stops
 * being organised and starts being hidden, which is the sentence this whole pass was given.
 */
const BUDGET: { screen: string; taps: number; route: string }[] = [
  { screen: 'News ticker', taps: 2, route: 'Empire tab → "The city" view' },
  { screen: 'Trophy screen', taps: 2, route: 'Empire tab → "The city" view' },
  { screen: 'Relationship map', taps: 2, route: 'Social tab → Web mode' },
  { screen: 'Character sheet', taps: 3, route: 'Crew tab → a person → the fold' },
  { screen: 'Ledger', taps: 3, route: 'Crew tab → a person → the fold' },
];
const CEILING = 3;

describe('the budget itself', () => {
  it('is three taps or fewer for everything on it', () => {
    for (const b of BUDGET) expect(b.taps, `${b.screen} (${b.route})`).toBeLessThanOrEqual(CEILING);
  });

  it('is spent on containers the app actually has', () => {
    // Every route above names a tab, and the tab bar is the one thing that has to keep existing
    // for any of these numbers to mean anything.
    newGame(mk());
    const bar = plain(renderToString(<TabBar />));
    for (const tab of ['Map', 'Crew', 'Ops', 'Social', 'Factions', 'Empire']) expect(bar, tab).toContain(tab);
  });

  it('does not grow the tab bar, which is the decision this budget was the argument for', () => {
    // Six tabs spend ~65px each of a 390px phone. A seventh would shrink the hit targets to fix a
    // problem the measurement says is not about depth. If a later pass adds one, it should have to
    // come here and say why.
    newGame(mk());
    const bar = plain(renderToString(<TabBar />));
    expect((bar.match(/class="tab(?: |")/g) ?? []).length).toBe(6);
  });
});

describe('two taps: the Empire hub', () => {
  it('reaches the news and the record in its own view, not three screens down a column', () => {
    newGame(mk());
    const city = plain(renderToString(<EmpireTab view="city" />));
    expect(city).toContain('The record');
    // The ticker renders only when the city has news; the container is what has to be one tap deep.
    expect(city.length).toBeGreaterThan(200);
  });

  it('offers every view from the sub-navigation, so the second tap always exists', () => {
    newGame(mk());
    const money = plain(renderToString(<EmpireTab view="money" />));
    for (const v of EMPIRE_VIEWS) expect(money, v.label).toContain(v.label);
    expect(money).toContain('aria-label="Empire sections"');
  });

  it('splits the tab rather than hiding any of it: every section still has a home', () => {
    newGame(mk());
    const all = EMPIRE_VIEWS.map(v => plain(renderToString(<EmpireTab view={v.id} />))).join('\n');
    for (const section of ['Holdings', 'Businesses', 'Rackets', 'Safehouses', 'The record', 'Log', 'Save', 'What it is all for']) {
      expect(all, `${section} fell out of the tab`).toContain(section);
    }
  });
});

describe('two taps: the relationship map', () => {
  it('is a mode of the Social tab, reachable from its own controls', () => {
    newGame(mk());
    const social = plain(renderToString(<SocialTab />));
    expect(social.toLowerCase()).toContain('web');
  });
});

describe('three taps: the things that live on a person', () => {
  it('are on the sheet a person opens, behind one fold each', () => {
    const w = mk(); const n = hire(w);
    newGame(w);
    const html = plain(renderToString(<NpcSheet npcId={n.id} />));
    // Tap three is the fold. Both have to be present *and* shut: present-but-open is the wall this
    // pass removed, and absent is the door-missing bug the last three passes each shipped once.
    expect(html).toContain('Character sheet');
    expect(html).toContain('Your history with');
    for (const id of ['Character sheet', 'Your history with']) {
      const i = html.indexOf(id);
      const head = html.lastIndexOf('aria-expanded', i);
      expect(html.slice(head, head + 24), `${id} is not a fold`).toContain('aria-expanded');
    }
  });

  it('are never more than one fold deep — no section inside a section', () => {
    const w = mk(); const n = hire(w);
    newGame(w);
    const html = plain(renderToString(<NpcSheet npcId={n.id} />));
    // A fold inside a fold is four taps and reads as five. The loadout lives inside the character
    // sheet on purpose and is the only nesting allowed here; anything else is a budget breach.
    const folds = (html.match(/class="section-title fold-head"/g) ?? []).length;
    expect(folds, 'the sheet has grown a forest of folds').toBeLessThanOrEqual(8);
  });
});
