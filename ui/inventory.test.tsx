/**
 * The inventory screen.
 *
 * Two things brought this on. A player reported the stash summary rendering a picture-frame
 * placeholder where Booze's icon should be — the cause was an emoji too new to render on their
 * device, fixed at the root and guarded by sim/emoji-support.test.ts, and regression-covered
 * here at the screen where they actually saw it. And the screen itself: a one-line summary over
 * a list that named every safehouse whether or not anything was in it, with moving hidden behind
 * a form whose 5/10/25 presets were useless to somebody holding two units.
 *
 * The rule this screen keeps: identity, quantity, value and flow travel together, always.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PRODUCT_INFO, RECIPES } from '@content/rackets';
import { generateWorld } from '@sim/generate';
import { PLAYER, select, type ProductKind, type Safehouse, type World } from '@sim/index';
import { emptyStash } from '@sim/generate';
import { PRODUCTS } from './derive';
import { Inventory } from './components/Inventory';
import { newGame } from './store';
import { plain } from './test-util';

const mk = (seed = 5) => { const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'tech', seed }); w.pendingEvents = []; return w; };
const render = (w: World) => { newGame(w); return plain(renderToString(<Inventory />)); };

function house(w: World, name: string, stock: Partial<Record<ProductKind, number>> = {}): Safehouse {
  const s: Safehouse = { id: `sh_${Object.keys(w.safehouses).length}`, blockId: Object.values(w.blocks)[Object.keys(w.safehouses).length].id, name, tier: 2, owner: PLAYER, stash: emptyStash(), cash: 0, productionIds: [], capacity: 200, hostageIds: [] };
  for (const [k, v] of Object.entries(stock)) s.stash[k as ProductKind] = v!;
  w.safehouses[s.id] = s; w.player.safehouseIds.push(s.id);
  return s;
}

describe('every product shows its identity next to its quantity', () => {
  it('renders all five kinds with the right icon and label', () => {
    const w = mk();
    for (const p of PRODUCTS) w.player.stash[p] = 7;
    const html = render(w);
    for (const p of PRODUCTS) {
      expect(html, `${p} has no icon on screen`).toContain(PRODUCT_INFO[p].icon);
      expect(html, `${p} has no label on screen`).toContain(PRODUCT_INFO[p].label);
    }
  });

  it('specifically: Booze, which is where a player saw a placeholder', () => {
    const w = mk();
    w.player.stash.booze = 1;
    const html = render(w);
    expect(html).toContain(PRODUCT_INFO.booze.icon);
    expect(html).toContain('Booze');
    // and the icon is one that actually renders — the root cause, asserted here too
    for (const ch of PRODUCT_INFO.booze.icon) {
      const cp = ch.codePointAt(0)!;
      expect(cp < 0x1F900 || cp > 0x1F9FF, 'the booze icon is from a range that tofus').toBe(true);
    }
  });

  it('never shows a bare quantity with no product beside it', () => {
    const w = mk();
    w.player.stash.booze = 3;
    house(w, 'The lockup', { green: 40 });
    const html = render(w);
    // every kind present is named; nothing is a lone number in a section title
    expect(html).toContain('Booze');
    expect(html).toContain('Green');
    expect(html).not.toMatch(/Stash<\/[^>]+>\s*·\s*\d/);
  });

  it('shows what it is worth, not only how much there is', () => {
    const w = mk();
    w.player.stash.pills = 10;
    const html = render(w);
    expect(select.unitPrice(w, 'pills')).toBeGreaterThan(0);
    expect(html).toMatch(/total/);
    expect(html).toContain('on the street');
  });

  it('shows the recipe name once a production gives the product an identity', () => {
    const w = mk();
    const s = house(w, 'The house', { booze: 30 });
    w.productions.pr1 = { id: 'pr1', kind: 'still', safehouseId: s.id, level: 1, stock: 5, lastOutput: 9, disrupted: 0, recipe: 'bonded' };
    s.productionIds.push('pr1');
    const html = render(w);
    expect(html, 'a named style should replace the generic label').toContain(RECIPES.bonded.label);
  });
});

describe('locations', () => {
  it('hides empty safehouses instead of listing them as dead lines', () => {
    const w = mk();
    w.player.stash.booze = 5;
    house(w, 'The lockup', { booze: 20 });
    house(w, 'Nothing here');
    house(w, 'Also nothing');
    const html = render(w);
    expect(html).toContain('The lockup');
    expect(html).not.toContain('Nothing here');
    expect(html).toContain('2 empty safehouses');
  });

  it('says nothing about empties when there are none', () => {
    const w = mk();
    w.player.stash.booze = 5;
    house(w, 'The lockup', { booze: 20 });
    expect(render(w)).not.toMatch(/empty safehouse/);
  });

  it('states what each place holds, by name', () => {
    const w = mk();
    house(w, 'The lockup', { green: 12, pills: 3 });
    const html = render(w);
    expect(html).toContain('The lockup');
    expect(html).toContain('Green');
    expect(html).toContain('Pills');
  });

  it('has something to say when you hold nothing at all', () => {
    const html = render(mk());
    expect(html).toMatch(/Nothing anywhere/);
    expect(html).not.toMatch(/empty safehouse/);
  });
});

describe('moving scales to what is actually there', () => {
  it('offers move-all rather than presets that cannot be satisfied', () => {
    const w = mk();
    w.player.stash.booze = 2;                 // the case the old 5/10/25 form could not serve
    house(w, 'The lockup');
    const html = render(w);
    expect(html).toContain('Move');
    expect(html).not.toMatch(/Move 25/);
    expect(html).not.toMatch(/Move 10\b/);
  });

  it('offers no move control at all with nowhere to move it to', () => {
    const w = mk();
    w.player.stash.booze = 5;
    expect(w.player.safehouseIds).toEqual([]);
    const html = render(w);
    expect(html).not.toMatch(/>Move</);
  });

  it('a real move through the reducer still lands', () => {
    const w = mk();
    const s = house(w, 'The lockup');
    w.player.stash.booze = 6;
    const moved = select.moveProduct({ stash: w.player.stash }, s, 'booze', 6);
    expect(moved).toBe(6);
    expect(s.stash.booze).toBe(6);
    expect(w.player.stash.booze).toBe(0);
  });
});

describe('automation is stated, not invisible', () => {
  it('names the foreman and what the production is making', () => {
    const w = mk();
    const s = house(w, 'The house', { booze: 10 });
    w.productions.pr1 = { id: 'pr1', kind: 'still', safehouseId: s.id, level: 1, stock: 5, lastOutput: 11, disrupted: 0, recipe: 'aged' };
    s.productionIds.push('pr1');
    const boss = Object.values(w.npcs).find(n => n.alive && !n.crew)!;
    boss.crew = { loyalty: 70, cut: 50, status: 'assigned', statusDays: 0, joinedDay: 1, assignment: { kind: 'foreman', productionId: 'pr1' } };
    w.player.crewIds.push(boss.id);

    const html = render(w);
    expect(html).toContain(boss.name);
    expect(html).toContain(RECIPES.aged.label);
    expect(html).toMatch(/running it/);
  });

  it('and says plainly when nobody is running it', () => {
    const w = mk();
    const s = house(w, 'The house', { booze: 10 });
    w.productions.pr1 = { id: 'pr1', kind: 'still', safehouseId: s.id, level: 1, stock: 5, lastOutput: 11, disrupted: 0 };
    s.productionIds.push('pr1');
    const html = render(w);
    expect(html).toMatch(/No foreman/);
    expect(html).toContain('house standard');
  });
});
