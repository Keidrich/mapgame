/**
 * The Social tab on screen: the roster shows the people you have met and nobody else, in
 * every grouping, with your own notes on it.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dispatch, select } from '@sim/index';
import { generateWorld } from '@sim/generate';
import type { World } from '@sim/types';
import { SocialTab } from './components/SocialTab';
import { NpcSheet } from './components/NpcSheet';
import { newGame } from './store';
import { asHtml, plain } from './test-util';

const mk = (seed = 12) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
const render = (w: World) => { newGame(w); return renderToString(<SocialTab />); };

describe('the Social tab', () => {
  it('lists everybody you have met, and nobody you have not', () => {
    const w = mk();
    const html = render(w);
    const met = select.metNpcs(w);
    expect(met.length).toBeGreaterThan(2);
    for (const n of met) expect(html, n.name).toContain(asHtml(n.name));
    const strangers = Object.values(w.npcs).filter(n => !select.isKnown(n));
    expect(strangers.length).toBeGreaterThan(0);
    // an unmet person's name only shows up once you open somebody who knows them
    for (const n of strangers.slice(0, 25)) expect(html, n.name).not.toContain(asHtml(n.name));
  });

  it('renders every grouping without falling over, even with nobody met', () => {
    const w = mk();
    expect(() => render(w)).not.toThrow();
    const empty = mk(3);
    for (const n of Object.values(empty.npcs)) { n.known = false; n.rel.trust = 0; }
    const html = render(empty);
    expect(html).toContain('not met anybody yet');
  });

  it('shows the tie count for people who have family or friends', () => {
    const w = mk();
    const withTies = select.metNpcs(w).find(n => select.connectionsOf(w, n).length > 0);
    expect(withTies, 'somebody you have met has people').toBeDefined();
    // (the count sits in the chip's title too, which SSR does not split with comment markers)
    const ties = select.connectionsOf(w, withTies!).length;
    const known = select.knownConnectionsOf(w, withTies!).length;
    expect(render(w)).toContain(`${ties} family and friends, ${known} you have met`);
  });

  it('puts your own note on the roster row and on their page, and leaves the flavour text alone', () => {
    let w = mk();
    const who = select.metNpcs(w).find(n => n.notes.length > 0) ?? select.metNpcs(w)[0];
    w = dispatch(w, { type: 'set_note', npcId: who.id, text: 'holds the book for the Bratva' });
    const roster = render(w);
    expect(roster).toContain('holds the book for the Bratva');
    newGame(w);
    const sheet = renderToString(<NpcSheet npcId={who.id} />);
    expect(sheet).toContain('holds the book for the Bratva');
    expect(sheet).toContain('Your note');
    for (const flavour of w.npcs[who.id].notes) expect(sheet).toContain(flavour);   // both, side by side
  });

  it('shows the same ties on the sheet as the tab has, in the sheet\'s own words', () => {
    const w = mk();
    const who = select.metNpcs(w).find(n => select.connectionsOf(w, n).some(c => c.kind === 'family'));
    expect(who).toBeDefined();
    newGame(w);
    const sheet = renderToString(<NpcSheet npcId={who!.id} />);
    const tie = select.connectionsOf(w, who!).find(c => c.kind === 'family')!;
    expect(sheet).toContain('Family');
    expect(sheet).toContain(tie.npc.name);
    expect(sheet).toContain(tie.label);      // "(cousin)"
  });
});

describe('where you stand with somebody', () => {
  it('names how well you know them, what they owe you, and any hold you have', () => {
    const w = mk();
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew)!;
    newGame(w);
    expect(renderToString(<NpcSheet npcId={n.id} />)).toContain('Never dealt with them');
    n.rel.metDay = w.day - 4; n.rel.contacts = 3; n.rel.favours = 2;
    n.ratted = w.day;
    newGame(w);
    const html = plain(renderToString(<NpcSheet npcId={n.id} />));
    expect(html).toContain('Known 4 days');
    expect(html).toContain('3 times');
    expect(html).toContain('Owes you 2 favours');
    expect(html).toContain('You have a hold');
  });

  it('says it in the singular when there is one of a thing', () => {
    const w = mk(13);
    const n = Object.values(w.npcs).find(x => x.alive && !x.crew)!;
    n.rel.metDay = w.day - 1; n.rel.contacts = 1; n.rel.favours = 1;
    newGame(w);
    const html = plain(renderToString(<NpcSheet npcId={n.id} />));
    expect(html).toContain('Known 1 day ');
    expect(html).toContain('1 time');
    expect(html).toContain('Owes you a favour');
  });
});
