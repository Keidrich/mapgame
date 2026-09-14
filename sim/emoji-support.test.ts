/**
 * Every emoji in the game has to actually render on a player's device.
 *
 * Reported three separate times from real play before the cause was spotted: Booze showed a
 * picture-frame placeholder in the stash, and the Back-Room Market and several item listings
 * were "fucked up… on phone and desktop". One root cause. Booze was the only product whose
 * icon was added in Unicode 9.0; every other one is Unicode 6.0. Post-6.0 glyphs fall back to
 * tofu on older Android and Windows font packs, and a tofu box in a 28px icon slot next to
 * text reads exactly like a broken listing.
 *
 * Unicode 6.0 (2010) is the last set with genuinely universal coverage, so that is the bar.
 * This test walks the real source and fails on anything newer — the alternative is finding out
 * from a player again.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_INFO } from '@content/rackets';
import { BUSINESS_DEFS } from '@content/businesses';
import { ITEM_DEFS } from '@content/items';

/**
 * Codepoint ranges introduced in Unicode 9.0 (2016) and later. Not exhaustive across every
 * block, but it covers the ranges emoji are actually drawn from, which is what matters.
 */
const POST_6_RANGES: [number, number][] = [
  [0x1F32D, 0x1F32F], [0x1F37E, 0x1F37F], [0x1F3C5, 0x1F3C5], [0x1F3F4, 0x1F3F4],
  [0x1F6D1, 0x1F6DF], [0x1F6E0, 0x1F6EC], [0x1F6F4, 0x1F6FF],
  [0x1F900, 0x1F9FF], [0x1FA70, 0x1FAFF],
];
const isRisky = (cp: number) => POST_6_RANGES.some(([a, b]) => cp >= a && cp <= b);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', 'coverage'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx|css|html)$/.test(name)) out.push(p);
  }
  return out;
}

/** Every risky codepoint in the tree, with the files that use it. */
function findRisky(): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const file of sourceFiles('.')) {
    if (file.endsWith('emoji-support.test.ts')) continue;   // this file names them on purpose
    for (const ch of readFileSync(file, 'utf8')) {
      const cp = ch.codePointAt(0);
      if (cp === undefined || !isRisky(cp)) continue;
      const key = `${ch} (U+${cp.toString(16).toUpperCase()})`;
      if (!hits.has(key)) hits.set(key, []);
      if (!hits.get(key)!.includes(file)) hits.get(key)!.push(file);
    }
  }
  return hits;
}

describe('every glyph we ship renders everywhere', () => {
  it('no emoji newer than Unicode 6.0 anywhere in the source', () => {
    const hits = findRisky();
    const report = [...hits].map(([ch, files]) => `${ch} in ${files.slice(0, 3).join(', ')}`).join('\n  ');
    expect(hits.size, hits.size ? `these tofu on older devices — pick a Unicode 6.0 equivalent:\n  ${report}` : '').toBe(0);
  });

  it('specifically: every product icon, which is where a player first saw this', () => {
    for (const [kind, info] of Object.entries(PRODUCT_INFO)) {
      for (const ch of info.icon) {
        const cp = ch.codePointAt(0)!;
        expect(isRisky(cp), `${kind} icon ${info.icon} will not render for everyone`).toBe(false);
      }
      expect(info.icon.length, `${kind} has no icon`).toBeGreaterThan(0);
      expect(info.label.length, `${kind} has no label`).toBeGreaterThan(0);
    }
  });

  it('and every business and item icon, which is where they saw it next', () => {
    for (const [type, def] of Object.entries(BUSINESS_DEFS)) {
      for (const ch of def.icon) expect(isRisky(ch.codePointAt(0)!), `business ${type} icon ${def.icon}`).toBe(false);
    }
    for (const [id, def] of Object.entries(ITEM_DEFS)) {
      for (const ch of def.icon) expect(isRisky(ch.codePointAt(0)!), `item ${id} icon ${def.icon}`).toBe(false);
    }
  });

  it('nothing is left without an icon at all', () => {
    for (const [type, def] of Object.entries(BUSINESS_DEFS)) expect(def.icon.trim().length, type).toBeGreaterThan(0);
    for (const [id, def] of Object.entries(ITEM_DEFS)) expect(def.icon.trim().length, id).toBeGreaterThan(0);
  });
});
