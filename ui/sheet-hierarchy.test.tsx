/**
 * The heavy sheets, as a question about order rather than about content.
 *
 * Both of these render fine, pass every other test, and were the two screens a player opens most —
 * which is exactly how a sheet ends up printing everything true about somebody every time it opens.
 * Measured on a 390×844 phone against a late-game save before this pass: `NpcSheet` was 1,543px of
 * scroll with **Actions beginning at 1,295px** — screen 2.5 of a 1.8-screen sheet, so the row of
 * buttons the player came for was below the fold on every single visit.
 *
 * These pin the ordering decision, not the pixels. A snapshot would fail on every copy edit and
 * teach everybody to re-bless it; what is worth holding is that the thing you act on comes before
 * the things you read, and that what you read is behind a fold until you ask for it.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dispatch, generateWorld, type Npc, type World } from '@sim/index';
import { NpcSheet } from './components/NpcSheet';
import { BlockSheet } from './components/BlockSheet';
import { newGame } from './store';
import { plain } from './test-util';

function mk(seed = 12): World {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed });
  w.pendingEvents = []; w.day = 40;
  return w;
}
function hire(w: World): Npc {
  const n = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
  n.crew = { loyalty: 70, cut: 50, status: 'idle', statusDays: 0, joinedDay: 1 };
  n.role = 'crew'; n.known = true; w.player.crewIds.push(n.id);
  return n;
}
const npc = (w: World, n: Npc) => { newGame(w); return plain(renderToString(<NpcSheet npcId={n.id} />)); };
const block = (w: World, id: string) => { newGame(w); return plain(renderToString(<BlockSheet blockId={id} />)); };
/** Where a thing starts in the markup. A proxy for "how far down the screen", and a stable one. */
const at = (html: string, needle: string | RegExp) => html.search(needle instanceof RegExp ? needle : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

describe('NpcSheet puts the decision first', () => {
  it('renders the actions before every card of reference', () => {
    const w = mk(); const n = hire(w);
    const html = npc(w, n);
    const actions = at(html, 'actions-primary');
    expect(actions, 'no primary actions block at all').toBeGreaterThan(-1);
    // Everything here is true about this person and none of it is what you are deciding now.
    for (const later of ['What you know about them', 'Your history with', 'People', 'Notes', 'Character sheet']) {
      const found = at(html, later);
      expect(found, `${later} is missing`).toBeGreaterThan(-1);
      expect(found, `${later} comes before the actions`).toBeGreaterThan(actions);
    }
  });

  it('opens with nothing but the actions, the states that change them, and the crew card', () => {
    const w = mk(); const n = hire(w);
    const html = npc(w, n);
    // Five reference cards, every one of them shut on arrival. This is the assertion that fails if
    // somebody adds a sixth card to this sheet and leaves it open, which is how it got here.
    const shut = (html.match(/aria-expanded="false"/g) ?? []).length;
    expect(shut, 'reference cards are open on arrival again').toBeGreaterThanOrEqual(5);
  });

  it('says the same refusal once, not once per button', () => {
    const w = mk(); const n = hire(w);
    // Standing somewhere else: every face-to-face action refuses identically, and the notice at the
    // top has already explained it. Three copies of one sentence is what this replaced.
    w.player.currentBlockId = Object.keys(w.blocks).find(id => id !== n.homeBlockId)!;
    n.homeBlockId = Object.keys(w.blocks).find(id => id !== w.player.currentBlockId)!;
    const html = npc(w, n);
    expect(html).toContain('You are not there.');
    expect(html).toContain('quiet-captions');
  });

  it('still offers every door it offered before — quieter is not narrower', () => {
    const w = mk();
    const stranger = Object.values(w.npcs).find(x => x.alive && !x.crew && !x.official)!;
    stranger.known = false;
    const html = npc(w, stranger);
    for (const door of ['Size them up', 'Visit', 'Threaten', 'Gift']) expect(html, door).toContain(door);
  });

  it('shows a crew member their assignment without being asked, because that is the decision', () => {
    const w = mk(); const n = hire(w);
    const html = npc(w, n);
    expect(html).toContain('Assignment');
  });
});

describe('BlockSheet stops printing headings over nothing', () => {
  const emptyBlock = (w: World) => Object.values(w.blocks).find(b => b.businessIds.length === 0)?.id;

  it('puts the doors first and the demand table behind a fold', () => {
    const w = mk();
    const busy = Object.values(w.blocks).sort((a, b) => b.businessIds.length - a.businessIds.length)[0];
    const html = block(w, busy.id);
    expect(at(html, 'Businesses ('), 'no business list').toBeGreaterThan(-1);
    expect(at(html, 'Demand / day')).toBeGreaterThan(at(html, 'Businesses ('));
    // Six numbers you read once when working out where to sell, and never on the twenty visits after.
    expect(html).toMatch(/aria-controls="fold-block:demand"[^>]*|aria-expanded="false"/);
  });

  it('does not print an empty Businesses heading on a block with no doors', () => {
    const w = mk();
    const id = emptyBlock(w);
    if (!id) return;                            // every block has something on this seed; nothing to prove
    expect(block(w, id)).not.toContain('Businesses (0)');
  });

  it('does not print a Safehouse heading over a safehouse you do not have', () => {
    const w = mk();
    const id = Object.keys(w.blocks)[0];
    const html = block(w, id);
    if (html.includes('Rent safehouse here')) {
      // The heading was a bare rule with nothing under it; the action below it is the whole card.
      expect(html.match(/>Safehouse</g) ?? []).toHaveLength(0);
    }
  });

  it('survives a block the player owns with a safehouse on it', () => {
    let w = mk();
    const id = Object.keys(w.blocks)[0];
    w.player.cash = 200_000; w.player.currentBlockId = id;
    w = dispatch(w, { type: 'rent_safehouse', blockId: id });
    expect(() => block(w, id)).not.toThrow();
    expect(block(w, id)).not.toContain('Rent safehouse here');
  });
});
