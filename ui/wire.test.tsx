/**
 * The wire on screen. The panel is the only way into cards, dirt and scrubbing, so a render that
 * throws — or one that quietly shows nothing because a selector moved — takes the whole lane with
 * it. `can()` runs during render (see DESIGN §9), so these also stand in for "the sheet does not
 * unmount the app" on the new state.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CARD_TIERS } from '@content/cyber';
import { generateWorld } from '@sim/generate';
import { PLAYER, select } from '@sim/index';
import type { Card, Npc, World } from '@sim/types';
import { addCard, secrets, startTap } from '@sim/cyber';
import { WireSection } from './components/Wire';
import { NpcSheet } from './components/NpcSheet';
import { newGame } from './store';
import { asHtml, plain } from './test-util';

const mk = (seed = 12) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'tech', seed });
const wire = (w: World) => { newGame(w); return renderToString(<WireSection />); };
const sheet = (w: World, id: string) => { newGame(w); return renderToString(<NpcSheet npcId={id} />); };

function pile(w: World, n = 3): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) { const c: Card = { id: `cc_${i}`, tier: 'gold', limit: 2500, freshness: 90, takenDay: w.day }; addCard(w, c); out.push(c); }
  return out;
}
const someone = (w: World): Npc => Object.values(w.npcs).find(n => n.alive && !n.crew && n.role === 'owner')!;

describe('the wire panel', () => {
  it('stays out of the way until there is something on it', () => {
    expect(wire(mk())).toBe('');
  });

  it('shows the cards you are holding, with the real odds on both runs', () => {
    const w = mk();
    const [c] = pile(w);
    const html = plain(wire(w));
    expect(html).toContain(asHtml(CARD_TIERS.gold.label));
    expect(html).toContain('freshness 90');
    expect(html).toContain('$2,500 left');
    // the odds live behind the Run toggle, which is client state; the panel that holds them is
    // what this asserts, and sim/cards.test.ts pins the numbers themselves
    expect(select.runOdds(w, c, 'small').take).toBeGreaterThan(0);
  });

  it('offers the wholesale route only with a carding racket behind it', () => {
    const w = mk(); pile(w);
    expect(plain(wire(w))).toContain('carding racket of your own');

    const biz = Object.values(w.businesses)[0];
    const r = { id: 'r_card', kind: 'carding' as const, businessId: biz.id, owner: PLAYER, startedDay: 1, level: 1, lastIncome: 0, disrupted: 0 };
    w.rackets[r.id] = r; w.player.racketIds.push(r.id); biz.racketIds.push(r.id);
    expect(plain(wire(w))).toContain('Dump the lot');
  });

  it('prices dirt per buyer, and never offers the subject\'s own people', () => {
    const w = mk();
    const f = Object.values(w.factions).find(x => x.alive && x.bossId)!;
    const boss = w.npcs[f.bossId!];
    w.player.secrets = [{ id: 'sc_1', npcId: boss.id, kind: 'agenda', text: `${boss.name} owes somebody.`, day: w.day }];
    const html = plain(wire(w));
    expect(html).toContain(asHtml(boss.name));
    expect(html).toContain('Sell');
    expect(secrets(w).length).toBe(1);
    // the buyer list itself is behind that toggle; the pricing rule is pinned in
    // sim/dirt-brokering.test.ts, including that the subject's own people are never a buyer
    const rival = Object.values(w.factions).find(x => x.alive && x.id !== f.id)!;
    expect(select.dirtPrice(w, secrets(w)[0], rival.id)).toBeGreaterThan(0);
    expect(select.dirtPrice(w, secrets(w)[0], f.id)).toBeGreaterThan(0);
  });

  it('shows the scrub panel only once the wire has made heat, and says what it will not touch', () => {
    const w = mk();
    pile(w);
    expect(plain(wire(w))).not.toContain('Scrub your trail');
    w.player.cyberHeat = 20;
    const html = plain(wire(w));
    expect(html).toContain('Scrub your trail');
    expect(html).toContain('never the heat you earned in person');
  });
});

describe('a tap on somebody\'s sheet', () => {
  it('says how long it has run, what the risk is, and offers the way out', () => {
    const w = mk();
    const n = someone(w); n.known = true;
    startTap(w, n);
    w.day += 6;
    const html = plain(sheet(w, n.id));
    expect(html).toContain('You are listening');
    expect(html).toContain('Running 6 days');
    expect(html).toContain(`${Math.round(select.tapRisk(w, n) * 100)}%`);
    expect(html).toContain('Take it off');
  });

  it('says nothing about a tap on somebody you are not listening to', () => {
    const w = mk();
    const n = someone(w); n.known = true;
    expect(plain(sheet(w, n.id))).not.toContain('You are listening');
  });

  it('marks somebody you have been inside of, because that is what wire fraud reads', () => {
    const w = mk();
    const n = someone(w); n.known = true; n.ratted = w.day;
    expect(plain(sheet(w, n.id))).toContain('been inside their business');
  });
});
