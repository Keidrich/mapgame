/**
 * The personal-history screen, which is deliberately one screen.
 *
 * The claim under test is the reuse: an ordinary shopkeeper and a lieutenant running a district
 * render from the same component, because they have the same *kind* of history with the player
 * and only the contents differ. Building it twice was the failure mode to avoid.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '@sim/generate';
import { select } from '@sim/index';
import type { Npc, World } from '@sim/types';
import { remember, oweThem } from '@sim/ledger';
import { LedgerPanel } from './components/Ledger';
import { NpcSheet } from './components/NpcSheet';
import { newGame } from './store';
import { asHtml, plain } from './test-util';

const mk = (seed = 41) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
const render = (w: World, n: Npc) => { newGame(w); return plain(renderToString(<LedgerPanel npcId={n.id} />)); };

/** An ordinary person the player has dealt with. */
function shopkeeper(w: World): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && x.role === 'owner')!;
  n.known = true;
  remember(w, n, 'deal', 'You gave them $500.');
  remember(w, n, 'harm', 'You had their windows put in.');
  n.rel.favours = 1;
  return n;
}

/** The same component's other customer: somebody running a district for you. */
function lieutenant(w: World): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && x.role === 'patron')!;
  const d = Object.values(w.districts)[0];
  n.known = true;
  n.crew = { loyalty: 82, cut: 120, status: 'assigned', statusDays: 0, joinedDay: 1, assignment: { kind: 'lieutenant', districtId: d.id } };
  w.player.crewIds.push(n.id);
  remember(w, n, 'deal', 'They came to work for you at $120/day.');
  oweThem(w, n, 'They took a charge that was yours.');
  return n;
}

describe('one history screen, for everybody', () => {
  it('renders for an ordinary NPC with their facts and what has passed between you', () => {
    const w = mk(); const n = shopkeeper(w);
    const html = render(w, n);
    expect(html).toContain(asHtml(n.name));
    expect(html).toContain('You gave them $500.');
    expect(html).toContain('You had their windows put in.');
    expect(html).toContain('They owe you a favour');
    expect(html).toContain('Nerve');
  });

  it('renders for a crew lieutenant from the same component, with the crew facts added', () => {
    const w = mk(); const n = lieutenant(w);
    const html = render(w, n);
    expect(html).toContain(asHtml(n.name));
    expect(html).toContain('loyalty 82');
    expect(html).toContain('lieutenant');
    expect(html).toContain('You owe them one');
    expect(html).toContain('They took a charge that was yours.');
  });

  it('the crew rows are the only difference: a non-crew person simply has none', () => {
    const w = mk();
    const plainNpc = shopkeeper(w);
    const boss = lieutenant(w);
    expect(render(w, plainNpc)).not.toContain('loyalty');
    expect(render(w, boss)).toContain('loyalty');
  });

  it('says so plainly when there is no history, rather than showing an empty heading', () => {
    const w = mk();
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.ledger)!;
    const html = render(w, n);
    expect(html).toContain('Nothing yet');
    expect(html).toContain('Nothing owed either way');
  });

  it('shows a hold when there is one, and names what it is', () => {
    const w = mk(); const n = shopkeeper(w);
    n.ratted = w.day;
    expect(select.leverageOver(w, n)?.kind).toBe('dirt');
    expect(render(w, n)).toContain('You have a hold');
  });

  it('surfaces what a size-up has not told you yet, instead of quietly showing nothing', () => {
    const w = mk(); const n = shopkeeper(w);
    n.known = false; n.rel.trust = 0;
    expect(render(w, n)).toContain('not sized up');
  });

  it('only the last few things are kept, newest first', () => {
    const w = mk(); const n = shopkeeper(w);
    for (let i = 0; i < select.LEDGER_MAX + 8; i++) { w.day = i + 1; remember(w, n, 'talk', `thing number ${i}`); }
    expect(select.ledgerOf(n).length).toBe(select.LEDGER_MAX);
    const html = render(w, n);
    const newest = html.indexOf(`thing number ${select.LEDGER_MAX + 7}`);
    const older = html.indexOf(`thing number ${select.LEDGER_MAX + 6}`);
    expect(newest).toBeGreaterThan(-1);
    expect(newest).toBeLessThan(older);
    expect(html).not.toContain('thing number 0<');
  });

  it('and it is on the NPC sheet itself, for both kinds of person', () => {
    const w = mk();
    const n = shopkeeper(w); const boss = lieutenant(w);
    newGame(w);
    for (const who of [n, boss]) {
      expect(plain(renderToString(<NpcSheet npcId={who.id} />)), who.id).toContain('Your history with');
    }
  });
});
