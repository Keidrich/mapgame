/**
 * Two discoverability fixes, and a guard that keeps the tooltip set honest.
 *
 * The wire ops are one lane — get inside somebody, use what you found, switch them off — and the
 * tree showed them scattered among the street jobs with nothing saying so. A tier-3 business has
 * no patrons to work through and no shakedown button, so its sheet was a dead end. And the
 * glossary had grown to 137 entries with five of them unreachable from any screen, which is the
 * kind of rot a one-off audit fixes once and a test fixes for good.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OP_DEFS, OP_FAMILIES } from '@content/rackets';
import { GLOSSARY } from '@content/glossary';
import { BUSINESS_DEFS } from '@content/businesses';
import { generateWorld } from '@sim/generate';
import { select } from '@sim/index';
import type { Business, BusinessType, OpKind, World } from '@sim/types';
import { OpTree } from './components/OpTree';
import { BusinessSheet } from './components/BusinessSheet';
import { newGame } from './store';
import { asHtml, plain } from './test-util';

const mk = (seed = 111) => generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed });
// The lane the crime pass widened: taking somebody's number and washing money sideways are the
// same kind of work as the original three — nobody is hurt, nobody sees you, and it is all done
// through somebody else's arrangements.
const WIRE: OpKind[] = ['rat', 'wire_fraud', 'digital_strike', 'sim_swap', 'crypto_wash'];

describe('the wire reads as one lane', () => {
  it('all three are tagged as a family in the content, and nothing else is', () => {
    for (const k of WIRE) expect(OP_DEFS[k].family, k).toBe('wire');
    const tagged = (Object.keys(OP_DEFS) as OpKind[]).filter(k => OP_DEFS[k].family === 'wire');
    expect(tagged.sort()).toEqual([...WIRE].sort());
    expect(OP_FAMILIES.wire.label.length).toBeGreaterThan(2);
  });

  it('the tree shows the family name on them, and a heading over the group', () => {
    const w = mk(); newGame(w);
    const html = plain(renderToString(<OpTree onPick={() => {}} />));
    expect(html).toContain(asHtml(OP_FAMILIES.wire.label));
    expect(html).toContain('opfam');       // the node carries the family styling
    expect(html).toContain('opfam-head');  // and the group has a heading
    for (const k of WIRE) expect(html, k).toContain(asHtml(OP_DEFS[k].label));
  });

  it('and the family explainer is reachable from the tree', () => {
    const w = mk(); newGame(w);
    const html = renderToString(<OpTree onPick={() => {}} />);
    expect(html).toContain(`What is ${OP_FAMILIES.wire.label}?`);
  });

  it('family members sit next to each other inside their tier, not scattered through it', () => {
    const w = mk(); newGame(w);
    const html = plain(renderToString(<OpTree onPick={() => {}} />));
    const at = (k: OpKind) => html.indexOf(asHtml(OP_DEFS[k].label));
    const sameTier = WIRE.filter(k => OP_DEFS[k].tier === OP_DEFS.rat.tier).map(at).filter(i => i >= 0).sort((a, b) => a - b);
    if (sameTier.length < 2) return;
    // nothing from another family comes between them
    const between = html.slice(sameTier[0], sameTier[sameTier.length - 1]);
    const strangers = (Object.keys(OP_DEFS) as OpKind[]).filter(k =>
      OP_DEFS[k].tier === OP_DEFS.rat.tier && !OP_DEFS[k].family && between.includes(asHtml(OP_DEFS[k].label)));
    expect(strangers, `these sit inside the wire group: ${strangers.join(', ')}`).toEqual([]);
  });
});

describe('an institution points you at the owner instead of leaving a dead end', () => {
  const inst = (w: World): Business | undefined =>
    Object.values(w.businesses).find(b => BUSINESS_DEFS[b.type].tier === 3 && b.ownedBy === 'npc');

  it('says nobody there is frightened of you, and names the door that is open', () => {
    const w = mk(); const b = inst(w)!;
    expect(b).toBeDefined();
    newGame(w);
    const html = plain(renderToString(<BusinessSheet businessId={b.id} />));
    expect(html).toContain('Nobody here is frightened of you');
    expect(html).toContain('books');
    expect(html).toContain(asHtml(w.npcs[b.ownerId].name));
  });

  it('says it differently when the place is empty: it is the owner or nothing', () => {
    const w = mk(); const b = inst(w)!;
    b.patronIds = [];
    newGame(w);
    expect(plain(renderToString(<BusinessSheet businessId={b.id} />))).toContain('or nothing');
  });

  it('and differently again once the player actually has a hold', () => {
    const w = mk(); const b = inst(w)!;
    const owner = w.npcs[b.ownerId];
    owner.ratted = w.day;
    expect(select.hasWayIn(w, owner)).toBe(true);
    newGame(w);
    expect(plain(renderToString(<BusinessSheet businessId={b.id} />))).toContain('You have a way in');
  });

  it('a street business gets no such card — the ordinary buttons are the answer there', () => {
    const w = mk();
    const bar = Object.values(w.businesses).find(x => BUSINESS_DEFS[x.type].tier === 1 && x.ownedBy === 'npc')!;
    newGame(w);
    const html = plain(renderToString(<BusinessSheet businessId={bar.id} />));
    expect(html).not.toContain('Nobody here is frightened of you');
  });

  it('every sheet carries its tier, so the rule is legible before it bites', () => {
    const w = mk(); newGame(w);
    for (const type of ['bar', 'bank'] as BusinessType[]) {
      const b = Object.values(w.businesses).find(x => x.type === type); if (!b) continue;
      const html = plain(renderToString(<BusinessSheet businessId={b.id} />));
      expect(html, type).toContain(select.tierInfo(b).label);
    }
  });
});

describe('the tooltip set stays reachable', () => {
  /** Every glossary id referenced anywhere in the shipped source. */
  function referenced(): Set<string> {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p); }
        else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')) files.push(p);
      }
    };
    for (const d of ['ui', 'sim', 'content']) walk(d);
    const out = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/['"`]([a-zA-Z][a-zA-Z0-9:_]*)['"`]/g)) out.add(m[1]);
      for (const m of src.matchAll(/id=\{?["'`]?([a-zA-Z][a-zA-Z0-9:_]*)/g)) out.add(m[1]);
    }
    return out;
  }

  it('no entry is orphaned: everything in the glossary is reachable from some screen', () => {
    const used = referenced();
    // `trait:*` ids are built from the trait id at render time, so match the family
    const orphans = Object.keys(GLOSSARY).filter(k => !used.has(k) && !(k.includes(':') && used.has(k.split(':')[0])));
    expect(orphans, `written and unreachable: ${orphans.join(', ')}`).toEqual([]);
  });

  it('every entry is actually written: a title, a body, and no placeholder', () => {
    for (const [k, e] of Object.entries(GLOSSARY)) {
      expect(e.title.trim().length, k).toBeGreaterThan(2);
      expect(e.body.trim().length, k).toBeGreaterThan(20);
      expect(e.body, k).not.toMatch(/TODO|TBD|lorem/i);
      expect(e.note ?? 'x', k).not.toMatch(/TODO|TBD/i);
    }
  });

  it('and none of it has grown into a wall of text', () => {
    for (const [k, e] of Object.entries(GLOSSARY)) {
      expect(e.body.length, `${k} body is ${e.body.length} chars`).toBeLessThan(460);
      expect((e.note ?? '').length, `${k} note is long`).toBeLessThan(360);
    }
  });

  it('the entries that describe extortion know that a third of the city cannot be extorted', () => {
    // the specific claim the tier pass invalidated: "protection is a cut of income", full stop
    expect(GLOSSARY.bizIncome.body + (GLOSSARY.bizIncome.note ?? '')).toMatch(/where protection is possible|institution/i);
    expect(GLOSSARY.muscle.note ?? '').toMatch(/institution|bank/i);
    expect(GLOSSARY.bizTier).toBeDefined();
  });
});
