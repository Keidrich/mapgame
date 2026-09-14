/**
 * The visual pass, as tests.
 *
 * A restyle is the easiest kind of change to break something with and not notice: a screen still
 * renders, still passes its own test, and looks wrong on a phone three days later. These are the
 * checks that would have caught the things that actually went wrong while this pass was written.
 *
 * Three guarantees, in order of how much they matter:
 *
 *  1. **No emoji reaches a screen.** That is the whole point of the icon set — the glyph is ours
 *     now, so it renders identically on every device instead of being whatever the platform felt
 *     like drawing. One emoji left behind in a component is one row that looks like the old app.
 *  2. **Every icon on screen is a real drawing.** `<Icon>` falls back rather than rendering
 *     nothing, so a typo'd name is invisible at runtime and obvious here.
 *  3. **The chrome is on.** The mono/uppercase labelling, the hard corners and the panel
 *     treatment are what make it one look rather than six; a skeleton snapshot per screen catches
 *     a panel that quietly lost its treatment during some later change.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PLAYER, dispatch, generateWorld, type World } from '@sim/index';
import { mkRacket } from '@sim/reducer';
import { hasIcon, iconMarkup } from './icons';
import { paintMarker } from './components/Map';
import { newGame } from './store';
import { plain } from './test-util';
import { Hud } from './components/Hud';
import { TabBar } from './components/TabBar';
import { OpTree } from './components/OpTree';
import { Holdings } from './components/Holdings';
import { Inventory } from './components/Inventory';
import { FactionsTab } from './components/FactionsTab';
import { CrewTab } from './components/CrewTab';
import { EmpireTab } from './components/EmpireTab';
import { SocialTab } from './components/SocialTab';
import { OpsTab } from './components/OpsTab';
import { MapLayers } from './components/MapLayers';

/** Anything in the emoji planes, plus the dingbats and the variation selector. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

/** A world with enough in it that every screen has something to draw. */
function playable(): World {
  let w = generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'Vic', background: 'muscle', seed: 12 });
  w.pendingEvents = [];
  w.day = 34; w.player.cash = 18450; w.player.dirty = 7300; w.player.heat = 48;
  w.player.respect = 41; w.player.fear = 27; w.player.ap = 5; w.player.legwork = 3; w.player.lawyer = true;
  for (const p of ['booze', 'green', 'pills', 'hot_goods', 'streetwear'] as const) w.player.stash[p] = 12;
  const kinds = ['protection', 'numbers', 'bookmaking', 'dealing', 'laundering'] as const;
  Object.values(w.businesses).filter(b => b.ownedBy === 'npc').slice(0, 5).forEach((b, i) => {
    b.protection = { factionId: PLAYER, rate: 0.15, since: 5 };
    const r = mkRacket(w, kinds[i], b); r.lastIncome = 120 + i * 90;
    if (kinds[i] === 'dealing') r.product = 'green';
  });
  for (const n of Object.values(w.npcs).filter(x => x.alive && x.role === 'patron').slice(0, 4)) {
    n.role = 'crew'; n.known = true;
    n.crew = { loyalty: 62, cut: 90, status: 'idle', statusDays: 0, joinedDay: 12 };
    w.player.crewIds.push(n.id); w.player.crewEver++;
  }
  w = dispatch(w, { type: 'cheat', what: 'unlock' });
  return w;
}

const SCREENS: [string, () => string][] = [
  ['the HUD', () => renderToString(<Hud />)],
  ['the nav', () => renderToString(<TabBar />)],
  ['the ops tree', () => renderToString(<OpTree onPick={() => {}} />)],
  ['the ops planner', () => renderToString(<OpsTab />)],
  ['holdings', () => renderToString(<Holdings />)],
  ['the inventory', () => renderToString(<Inventory />)],
  ['factions', () => renderToString(<FactionsTab />)],
  ['the crew', () => renderToString(<CrewTab />)],
  ['the empire ledger', () => renderToString(<EmpireTab />)],
  ['the social tab', () => renderToString(<SocialTab />)],
  ['the map layers', () => renderToString(<MapLayers />)],
];

function render(fn: () => string): string {
  newGame(playable());
  // `plain` drops React's `<!-- -->` text-node separators, so "DAY 34" is one string again
  return plain(fn());
}

describe('no screen draws an emoji any more', () => {
  for (const [name, fn] of SCREENS) {
    it(name, () => {
      const html = render(fn);
      const found = html.match(new RegExp(EMOJI, 'gu'));
      expect(found, `${name} still renders ${found?.join(' ')}`).toBeNull();
    });
  }
});

describe('every icon on screen is one we actually drew', () => {
  for (const [name, fn] of SCREENS) {
    it(name, () => {
      const html = render(fn);
      const names = [...html.matchAll(/data-icon="([^"]+)"/g)].map(m => m[1]);
      for (const n of names) expect(hasIcon(n), `${name} asks for an icon called ${n}, which does not exist`).toBe(true);
      // and each one really drew: an <svg> with at least one path in it
      for (const m of html.matchAll(/data-icon="([^"]+)"([^>]*)>(.*?)<\/svg>/gs)) {
        expect(m[3], `${m[1]} rendered an empty svg`).toContain('<path');
      }
    });
  }

  it('the screens that are mostly icons are drawing plenty of them', () => {
    expect([...render(SCREENS[2][1]).matchAll(/data-icon=/g)].length, 'the ops tree has almost no icons').toBeGreaterThan(10);
    expect([...render(SCREENS[1][1]).matchAll(/data-icon=/g)].length, 'the nav lost its icons').toBe(6);
  });
});

describe('the tactical chrome is on', () => {
  it('the HUD reads as three bands: identity, the strip, the budget', () => {
    const html = render(SCREENS[0][1]);
    for (const cls of ['hud-top', 'hud-id', 'hud-day', 'hud-strip', 'hud-cell', 'hud-budget', 'pips']) {
      expect(html, `the HUD lost its ${cls}`).toContain(cls);
    }
    // the four things the game is played against, each in its own cell
    expect([...html.matchAll(/class="hud-cell/g)].length).toBe(4);
    expect(html).toContain('DAY 34');
  });

  it('panels are panels: briefing heads on the screens that are instruments', () => {
    expect(render(SCREENS[4][1]), 'holdings lost its briefing panel').toContain('brief-head');
    expect(render(SCREENS[3][1]), 'the ops planner lost its briefing panel').toContain('brief-head');
    expect(render(SCREENS[6][1]), 'the faction cards lost their briefing panel').toContain('brief-head');
  });

  it('the ops tree still says what a locked node needs, in words', () => {
    const html = render(SCREENS[2][1]);
    expect(html).toContain('data-icon="lock"');
    expect(html).toMatch(/crew|a place of yours|a racket|house T/);
  });
});

describe('nothing the sim writes to the player carries an emoji', () => {
  /**
   * The log is a screen too — it is most of the recap and a third of the empire tab — and five
   * log lines were prefixing themselves with the emoji off a content table. Component tests
   * cannot see that, because the text arrives from `/sim` already assembled.
   */
  it('a played day writes a log with no emoji in it', () => {
    let world = playable();
    for (let i = 0; i < 3; i++) { world.pendingEvents = []; world = dispatch(world, { type: 'end_day' }); }
    const lines = world.log.map(e => e.text);
    expect(lines.length, 'nothing was logged, so this checked nothing').toBeGreaterThan(5);
    const bad = lines.filter(t => EMOJI.test(t));
    expect(bad, `log lines still carrying emoji: ${bad.slice(0, 3).join(' | ')}`).toEqual([]);
  });
});

describe('the map markers draw rather than print', () => {
  /**
   * The bug this exists for: markers were set with `textContent`, which was right while they were
   * emoji and filled the whole map with amber path data the day they became SVG. It got through
   * every test in this file because nothing here renders MapLibre — so the check is on the one
   * function that decides, which is the whole of the decision.
   */
  const el = () => ({ innerHTML: '', textContent: null as string | null });

  it('an icon goes in as markup', () => {
    const node = el();
    paintMarker(node, iconMarkup('bank', { size: 16 }));
    expect(node.innerHTML, 'the marker printed its own source instead of drawing').toContain('<svg');
    expect(node.innerHTML).toContain('data-icon="bank"');
    expect(node.textContent).toBeNull();
  });

  it('a plain label still goes in as text, and stays escaped', () => {
    const node = el();
    paintMarker(node, '12');
    expect(node.textContent).toBe('12');
    expect(node.innerHTML).toBe('');
    const sneaky = el();
    paintMarker(sneaky, '<b>not markup</b>');
    expect(sneaky.innerHTML, 'anything that is not our own icon must not be parsed').toBe('');
    expect(sneaky.textContent).toBe('<b>not markup</b>');
  });

  it('every marker the map builds is one of those two things', () => {
    // the marker kinds the map can ask for, by name — all from the registry, all real drawings
    for (const name of ['start', 'you', 'heat', 'safehouse', 'precinct', 'city_hall', 'watching', 'crackdown']) {
      expect(hasIcon(name), `the map asks for a ${name} marker and there is no such drawing`).toBe(true);
      const node = el();
      paintMarker(node, iconMarkup(name, { size: 16 }));
      expect(node.innerHTML).toContain('<path');
    }
  });
});

/**
 * Skeleton snapshots: the class structure of a screen, with the text taken out. Full-HTML
 * snapshots of a game screen churn on every balance tweak and get blind-updated; this changes
 * only when the *shape* of the screen changes, which is exactly when somebody should look.
 */
function skeleton(html: string): string {
  const tags = [...html.matchAll(/<(\w+)[^>]*?(?:class="([^"]*)")?[^>]*>/g)]
    .map(m => (m[2] ? `${m[1]}.${m[2].trim().split(/\s+/).join('.')}` : m[1]))
    .filter(t => t !== 'path' && t !== 'title');
  return tags.join('\n');
}

describe('the shape of each screen', () => {
  it('the HUD', () => {
    expect(skeleton(render(SCREENS[0][1]))).toMatchSnapshot();
  });
  it('the nav', () => {
    expect(skeleton(render(SCREENS[1][1]))).toMatchSnapshot();
  });
  it('one holdings row', () => {
    const html = render(SCREENS[4][1]);
    const row = html.slice(html.indexOf('<button'), html.indexOf('</button>') + 9);
    expect(skeleton(row)).toMatchSnapshot();
  });
});
