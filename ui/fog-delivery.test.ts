/**
 * The behaviour change that will surprise a playtester, pinned in place.
 *
 * Before: tapping empty map space called `populateAndOpen`, which fetched a chunk and filled a
 * whole district with people on the spot. After: tapping says no, and ground opens only when
 * somebody of yours has walked to the edge of it. That is a real loss of a convenience, so the
 * shape of it is asserted here rather than left to a code reviewer's memory — the easy
 * regression is somebody re-adding an instant-populate path for a "quality of life" fix.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as store from './store';

const src = (p: string) => readFileSync(p, 'utf8');
const STORE = src('ui/store.ts');
const MAP = src('ui/components/Map.tsx');

describe('tapping no longer summons a district', () => {
  it('the old instant-populate entry point is gone from the store', () => {
    expect(store).not.toHaveProperty('populateAndOpen');
    expect(STORE).not.toContain('populateAndOpen');
  });

  it('the map answers a tap on cloud with an explanation, not a fetch', () => {
    expect(MAP).toContain('explainFog');
    expect(store.explainFog).toBeTypeOf('function');
    // the click handlers must not reach for chunk loading themselves
    const handlers = MAP.slice(MAP.indexOf("m.on('click'"), MAP.indexOf("m.on('mouseenter'"));
    expect(handlers).not.toMatch(/loadChunk|populate_chunk/);
  });

  it('populating a chunk happens in exactly one place, and that place is the fog rule', () => {
    const hits = [...STORE.matchAll(/populate_chunk/g)].length;
    expect(hits).toBeGreaterThan(0);
    const reveal = STORE.slice(STORE.indexOf('export async function revealNear'), STORE.indexOf('const revealing'));
    // every dispatch of it lives inside revealNear
    expect([...reveal.matchAll(/populate_chunk/g)].length).toBe(hits);
  });

  it('panning the map warms the geometry cache but never populates', () => {
    const fn = MAP.slice(MAP.indexOf('function loadVisibleChunks'), MAP.indexOf('function syncMarkers'));
    expect(fn).toContain('loadChunk');
    expect(fn).not.toContain('populate_chunk');
    // it may *ask* the fog rule to reconsider, which is the rule's call to make
    expect(fn).toContain('revealNear');
  });

  it('travelling is what triggers a reveal', () => {
    expect(STORE).toMatch(/action\.type === 'move'[\s\S]{0,80}revealNear/);
  });
});
