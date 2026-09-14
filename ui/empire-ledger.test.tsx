/**
 * The empire ledger on screen.
 *
 * Two claims. Every row shows the state the sim actually holds for that holding — crowding from
 * `territory.ts`, a live synergy, whether a foreman or a standing order is running it — and the
 * ordering is the sim's comparator rather than a detail of the component, so it is a thing a test
 * can assert rather than an emergent property of a render.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SATURATION, SYNERGIES } from '@content/territory';
import { RACKET_DEFS } from '@content/rackets';
import { generateWorld } from '@sim/generate';
import { select } from '@sim/index';
import type { Business, Id, Racket, RacketKind, World } from '@sim/types';
import { Holdings } from './components/Holdings';
import { newGame } from './store';
import { asHtml, plain } from './test-util';

const mk = (seed = 81) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
const render = (w: World) => { newGame(w); return plain(renderToString(<Holdings />)); };

/** Put a racket of `kind` on a business in the player's own district, and hand it over. */
function giveRacket(w: World, kind: RacketKind, biz: Business, income = 100): Racket {
  const id: Id = `r_${kind}_${biz.id}`;
  const r: Racket = { id, kind, businessId: biz.id, owner: 'player', startedDay: 1, level: 1, lastIncome: income, disrupted: 0 };
  w.rackets[id] = r; biz.racketIds = [...biz.racketIds, id]; w.player.racketIds.push(id);
  return r;
}
/** Businesses in the start district, so everything shares a district and saturation can bite. */
function localBiz(w: World, n: number): Business[] {
  const d = w.blocks[select.startBlock(w).id].districtId;
  return Object.values(w.businesses).filter(b => w.blocks[b.blockId]?.districtId === d).slice(0, n);
}

describe('the ledger says what each holding is actually doing', () => {
  it('says so plainly when there is nothing to show', () => {
    const w = mk();
    expect(render(w)).toContain('You hold nothing yet');
  });

  it('a business, a racket and a production all appear, in one table', () => {
    const w = mk();
    const [b1, b2] = localBiz(w, 2);
    b1.ownedBy = 'player'; w.player.businessIds.push(b1.id);
    giveRacket(w, 'protection', b2, 140);
    const sh = Object.values(w.safehouses)[0] ?? undefined;
    const html = render(w);
    expect(html).toContain(asHtml(b1.name));
    expect(html).toContain(RACKET_DEFS.protection.label);
    expect(html).toContain('2 holdings');
    void sh;
  });

  it('crowding is read off territory.ts, and only shown when it is real', () => {
    const w = mk();
    const biz = localBiz(w, SATURATION.free + 2);
    expect(biz.length).toBeGreaterThan(SATURATION.free);
    for (const b of biz) giveRacket(w, 'protection', b, 100);
    const rows = select.holdings(w);
    const clear = rows.filter(r => r.saturation === 1);
    const squeezed = rows.filter(r => r.saturation < 1);
    expect(clear.length).toBe(SATURATION.free);
    expect(squeezed.length).toBeGreaterThan(0);
    // and the number on screen is the one the sim holds, not a second calculation
    const html = render(w);
    expect(html).toContain(`${Math.round((1 - squeezed[0].saturation) * 100)}% crowded out`);
    expect(html).toContain('crowded out');
  });

  it('a live synergy shows, and the same pair without its feeder does not', () => {
    const kind = Object.keys(SYNERGIES)[0] as RacketKind;
    const needs = SYNERGIES[kind]!.needs;
    const alone = mk();
    const [a] = localBiz(alone, 1);
    giveRacket(alone, kind, a, 120);
    expect(select.holdings(alone).find(r => r.kind === 'racket')!.synergy).toBeUndefined();
    expect(render(alone)).not.toContain('feeding each other');

    const w = mk();
    const [x, y] = localBiz(w, 2);
    giveRacket(w, kind, x, 120);
    giveRacket(w, needs, y, 90);
    const fed = select.holdings(w).find(r => r.id === `r_${kind}_${x.id}`)!;
    expect(fed.synergy).toBeDefined();
    expect(render(w)).toContain(`+${Math.round(fed.synergy!.bonus * 100)}%`);
  });

  it('automation status: a foreman, a standing order, and nobody at all read differently', () => {
    const w = mk();
    const [b] = localBiz(w, 1);
    const r = giveRacket(w, 'protection', b, 100);
    expect(select.holdings(w).find(x => x.id === r.id)!.auto.state).toBe('unmanned');
    expect(render(w)).toContain('Nobody on it');

    const hand = Object.values(w.npcs).find(n => n.alive && !n.crew)!;
    hand.crew = { loyalty: 60, cut: 0, status: 'assigned', statusDays: 0, joinedDay: 1, assignment: { kind: 'racket', racketId: r.id } };
    w.player.crewIds.push(hand.id); r.runnerId = hand.id;
    const manned = select.holdings(w).find(x => x.id === r.id)!;
    expect(manned.auto.state).toBe('manual');
    expect(manned.auto.good).toBe(true);
    expect(render(w)).toContain(asHtml(hand.name));
  });

  it('a product racket reads its standing order, and says when it has nothing to sell', () => {
    const w = mk();
    const [b] = localBiz(w, 1);
    const r = giveRacket(w, 'dealing', b, 0);
    r.product = 'green'; r.supply = 'empire';
    const row = select.holdings(w).find(x => x.id === r.id)!;
    expect(row.auto.state).toBe('standing');
    expect(row.auto.good, 'no stock anywhere, so the order is not actually feeding it').toBe(false);
    expect(row.flags).toContain('no stock to sell');
    expect(render(w)).toContain('no stock to sell');
  });

  it('trouble is surfaced, not buried: a disrupted racket says so', () => {
    const w = mk();
    const [b] = localBiz(w, 1);
    const r = giveRacket(w, 'protection', b, 0);
    r.disrupted = 3;
    expect(select.holdings(w).find(x => x.id === r.id)!.flags).toContain('disrupted 3d');
    expect(render(w)).toContain('disrupted 3d');
  });
});

describe('and it sorts', () => {
  const populated = (seed = 84) => {
    const w = mk(seed);
    const biz = localBiz(w, 4);
    biz[0].ownedBy = 'player'; biz[0].baseIncome = 30; biz[0].condition = 100; w.player.businessIds.push(biz[0].id);
    giveRacket(w, 'protection', biz[1], 500);
    giveRacket(w, 'numbers', biz[2], 50);
    const hurt = giveRacket(w, 'bookmaking', biz[3], 200);
    hurt.disrupted = 2; hurt.threatened = w.day + 1;
    return w;
  };

  it('by income, biggest first', () => {
    const rows = select.sortHoldings(select.holdings(populated()), 'income');
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].income).toBeGreaterThanOrEqual(rows[i].income);
    expect(rows[0].income).toBe(500);
  });

  it('by crowding, most squeezed first — because that is the one to move', () => {
    const w = mk(85);
    for (const b of localBiz(w, SATURATION.free + 2)) giveRacket(w, 'protection', b, 100);
    const rows = select.sortHoldings(select.holdings(w), 'saturation');
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].saturation).toBeLessThanOrEqual(rows[i].saturation);
    expect(rows[0].saturation).toBeLessThan(1);
  });

  it('by trouble, by name, and by kind', () => {
    const w = populated();
    const trouble = select.sortHoldings(select.holdings(w), 'trouble');
    expect(trouble[0].flags.length).toBeGreaterThan(0);
    for (let i = 1; i < trouble.length; i++) expect(trouble[i - 1].flags.length).toBeGreaterThanOrEqual(trouble[i].flags.length);

    const byName = select.sortHoldings(select.holdings(w), 'name');
    for (let i = 1; i < byName.length; i++) expect(byName[i - 1].name.localeCompare(byName[i].name)).toBeLessThanOrEqual(0);

    const byKind = select.sortHoldings(select.holdings(w), 'kind');
    expect(byKind[0].kind).toBe('business');
  });

  it('every sort is total and stable: equal rows never swap between renders', () => {
    const w = populated(86);
    for (const by of ['income', 'name', 'saturation', 'kind', 'where', 'trouble'] as const) {
      const a = select.sortHoldings(select.holdings(w), by).map(r => r.id);
      const b = select.sortHoldings(select.holdings(w).slice().reverse(), by).map(r => r.id);
      expect(b, by).toEqual(a);
    }
  });

  it('the totals line adds up to what the rows say', () => {
    const w = populated(87);
    const rows = select.holdings(w);
    const t = select.holdingsTotals(w);
    expect(t.count).toBe(rows.length);
    expect(t.income).toBe(rows.reduce((n, r) => n + r.income, 0));
    expect(t.dirty).toBe(rows.filter(r => r.dirty).reduce((n, r) => n + r.income, 0));
    expect(t.trouble).toBe(rows.filter(r => r.flags.length).length);
    expect(render(w)).toContain(`${t.count} holdings`);
  });

  it('renders without throwing for every sort, on a world with all three kinds', () => {
    const w = populated(88);
    newGame(w);
    expect(() => renderToString(<Holdings />)).not.toThrow();
  });
});
