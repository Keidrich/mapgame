/**
 * Opening a panel must never take the game down. A sheet is rendered from the world, and a
 * throw anywhere in that render — in a selector, in `can()`, in a lookup that assumed the
 * wrong shape — unmounts React and leaves a black screen with the save out of reach.
 *
 * So: render every block, business and person sheet of a real city, including the corners
 * street crews hold, which is exactly the case that used to crash.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '@sim/generate';
import type { World } from '@sim/types';
import { BlockSheet } from './components/BlockSheet';
import { BusinessSheet } from './components/BusinessSheet';
import { NpcSheet } from './components/NpcSheet';
import { newGame } from './store';

const mk = (seed: number) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
/** A city with street crews holding corners. */
function withCrews(): World {
  for (const seed of [12, 8, 44, 3, 23, 5]) { const w = mk(seed); if (Object.keys(w.crews).length) return w; }
  throw new Error('no seed produced a street crew');
}

describe('every sheet renders', () => {
  const w = withCrews();
  newGame(w);

  it('opens every block in the city, including the ones street crews hold', () => {
    expect(Object.keys(w.crews).length).toBeGreaterThan(0);
    for (const id of Object.keys(w.blocks)) {
      expect(() => renderToString(<BlockSheet blockId={id} />), `block ${id}`).not.toThrow();
    }
  });

  it('names the crew on a corner they hold', () => {
    const crew = Object.values(w.crews)[0];
    const html = renderToString(<BlockSheet blockId={crew.blockId} />);
    expect(html).toContain(crew.name);
    expect(html).toContain(w.npcs[crew.bossId].name);
  });

  it('opens every business', () => {
    for (const id of Object.keys(w.businesses)) {
      expect(() => renderToString(<BusinessSheet businessId={id} />), `business ${id}`).not.toThrow();
    }
  });

  it('opens everybody: owners, patrons, crew bosses, officials, the fixer', () => {
    for (const n of Object.values(w.npcs)) {
      expect(() => renderToString(<NpcSheet npcId={n.id} />), `${n.role} ${n.id}`).not.toThrow();
    }
    // the roles that only exist in a few places, so a regression in one is not hidden by the rest
    for (const role of ['fixer', 'gang_boss', 'official', 'boss', 'lieutenant'] as const) {
      expect(Object.values(w.npcs).some(n => n.role === role || (role === 'official' && n.official)), role).toBe(true);
    }
  });

  it('survives a world where the people a sheet points at are gone', () => {
    // deaths, hits and a dissolved crew all leave dangling ids behind; a sheet must still open
    const broken = structuredClone(w);
    const crew = Object.values(broken.crews)[0];
    delete broken.npcs[crew.bossId];
    for (const id of crew.soldierIds) delete broken.npcs[id];
    newGame(broken);
    expect(() => renderToString(<BlockSheet blockId={crew.blockId} />)).not.toThrow();
    newGame(w);
  });
});
