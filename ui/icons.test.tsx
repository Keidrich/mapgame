/**
 * The icon set, as a contract.
 *
 * Iconography is the one part of a UI that rots silently: somebody adds a business type, nobody
 * draws it, and it renders as a blank box on a phone six weeks later. Since every glyph is now
 * ours rather than the platform's, "is there a drawing for this thing" is a question with an
 * answer, so these tests ask it of every id in every content table.
 *
 * They also guard the two things that make a set a set rather than a pile: one grid, and no
 * accidental duplicates inside a category.
 */
import { describe, expect, it } from 'vitest';
import { BUSINESS_DEFS } from '@content/businesses';
import { OP_DEFS, PRODUCTION_DEFS, PRODUCT_INFO, RACKET_DEFS } from '@content/rackets';
import { ITEM_DEFS } from '@content/items';
import { AUTHORITY_KINDS, POSTURES } from '@content/authority';
import { APPROACHES } from '@content/lines';
import { AGENDA_MOVES } from '@content/agendas';
import { COMPLICATIONS } from '@content/complications';
import { OP_APPROACHES } from '@content/rackets';
import { ALL_ICONS, OP_ICON_PATHS, hasIcon, iconName, iconMarkup } from './icons';

const ids = (o: object) => Object.keys(o);

describe('every content table is drawn', () => {
  const tables: [string, Parameters<typeof iconName>[0], string[]][] = [
    ['business', 'business', ids(BUSINESS_DEFS)],
    ['racket', 'racket', ids(RACKET_DEFS)],
    ['op', 'op', ids(OP_DEFS)],
    ['item', 'item', ids(ITEM_DEFS)],
    ['product', 'product', ids(PRODUCT_INFO)],
    ['production', 'production', ids(PRODUCTION_DEFS)],
    ['authority', 'authority', ids(AUTHORITY_KINDS)],
    ['posture', 'posture', ids(POSTURES)],
  ];

  for (const [label, of, keys] of tables) {
    it(`${label}: all ${keys.length} of them resolve to a real drawing, not the fallback`, () => {
      const missing = keys.filter(k => !hasIcon(k));
      expect(missing, `no icon drawn for: ${missing.join(', ')}`).toEqual([]);
      for (const k of keys) expect(iconName(of, k), k).toBe(k);
    });
  }

  it('the crew assignments and the nav are drawn too', () => {
    for (const k of ['collect', 'hack', 'production', 'foreman', 'guard', 'lieutenant']) expect(hasIcon(k), k).toBe(true);
    for (const k of ['map', 'crew', 'ops', 'social', 'factions', 'empire']) expect(hasIcon(k), k).toBe(true);
    for (const k of ['cash', 'dirty', 'heat', 'respect', 'fear', 'ap', 'legwork', 'day']) expect(hasIcon(k), k).toBe(true);
  });

  it('an unknown id falls back rather than rendering nothing', () => {
    expect(iconName('business', 'a_type_that_does_not_exist')).toBe('corner_store');
    expect(iconName('op', undefined)).toBe('ops');
    expect(hasIcon(iconName('racket', 'nope'))).toBe(true);
  });
});

/**
 * Two different contracts share the field name `icon`, and mixing them up is how a screen ends up
 * drawing the fallback glyph for every option on it:
 *
 *  - on a **content table** (a business type, a racket kind, an op) `icon` is an emoji. It is
 *    data — a log line, a share card — and the UI never draws it: it resolves its own drawing
 *    from the row's id.
 *  - on an **option** (a way to answer a confrontation, an approach to a job, a move in a
 *    conversation) `icon` is the name of a drawing, because there is no id to resolve from.
 *
 * The second kind has to be a real name or `<Icon>` quietly falls back and every option on the
 * screen gets the same glyph. That is exactly what happened, and this is the check for it.
 */
describe('an option names its drawing, rather than carrying an emoji', () => {
  const tables: [string, { icon: string; label?: string }[]][] = [
    ['scene approaches', Object.values(APPROACHES).flat()],
    ['op approaches', Object.values(OP_APPROACHES)],
    ['agenda moves', Object.values(AGENDA_MOVES).flat()],
    ['complications', Object.values(COMPLICATIONS)],
  ];
  for (const [label, rows] of tables) {
    it(label, () => {
      expect(rows.length, `${label} is empty, so this checked nothing`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.icon, `${label}: ${row.label ?? '?'} has no icon`).toBeTruthy();
        expect(hasIcon(row.icon), `${label}: ${row.label ?? '?'} asks for "${row.icon}", which is not a drawing`).toBe(true);
      }
    });
  }

  it('and the op modes, which sit inside the op table but are options', () => {
    for (const d of Object.values(OP_DEFS)) {
      for (const m of d.modes ?? []) expect(hasIcon(m.icon), `${d.label} mode "${m.label}" asks for ${m.icon}`).toBe(true);
    }
  });
});

describe('the set holds together', () => {
  it('every glyph is on the same grid and actually draws something', () => {
    for (const [name, paths] of Object.entries(ALL_ICONS)) {
      expect(paths.length, `${name} draws nothing`).toBeGreaterThan(0);
      for (const d of paths) {
        expect(d.length, `${name} has an empty path`).toBeGreaterThan(3);
        expect(d, `${name} has a path that does not start with a move`).toMatch(/^M/);
        // the grid is 24×24 with a little bleed for strokes; a number outside it is a typo
        for (const n of d.match(/-?\d+(\.\d+)?/g) ?? []) {
          expect(Math.abs(Number(n)), `${name} has ${n} in it, which is off the 24×24 grid`).toBeLessThanOrEqual(24);
        }
      }
    }
  });

  it('no two ops share a drawing, which would make the tree unreadable', () => {
    const seen = new Map<string, string>();
    for (const [name, paths] of Object.entries(OP_ICON_PATHS)) {
      const key = paths.join('|');
      const other = seen.get(key);
      expect(other, `${name} and ${other} are the same drawing`).toBeUndefined();
      seen.set(key, name);
    }
  });

  it('renders to markup a map marker can use, with the name on it for the tests', () => {
    const svg = iconMarkup('bank', { size: 18, color: '#f2c94c' });
    expect(svg).toContain('data-icon="bank"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('#f2c94c');
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
