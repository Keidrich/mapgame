/**
 * The Empire tab, as something you can put away.
 *
 * It is one long column — holdings, stash, businesses, the wire, the news, what it is all for,
 * rackets, safehouses, cold cases, the record, the log, the save card — and on a phone most of a
 * visit is scrolling past the parts you are not there for. Every list heading is a control now.
 *
 * Three things this holds, because each is a way for a collapsible section to be worse than no
 * collapsible section at all:
 *
 *  - a shut section still **says what is in it** (the count stays on the heading);
 *  - a shut section is `hidden`, not unmounted, so find-in-page and a screen reader's own search
 *    still reach the content and nothing re-mounts when it opens;
 *  - the choice **sticks**, so the player arranges the screen once rather than every visit.
 */
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateWorld, type World } from '@sim/index';
import { EmpireTab } from './components/EmpireTab';
import { Section } from './components/Act';
import { isOpen, newGame, toggleFold, useStore } from './store';
import { plain } from './test-util';

const mk = (): World => {
  const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'brains', seed: 7 });
  w.pendingEvents = []; w.day = 20;
  return w;
};
const render = (w: World) => { newGame(w); return plain(renderToString(<EmpireTab />)); };
/** The body of one section, as it comes out of the renderer. */
const bodyOf = (html: string, id: string) => html.match(new RegExp(`<div id="fold-${id}"([^>]*)>`))?.[1] ?? '';

/**
 * What each section does before anybody touches it. Listed here rather than read out of the
 * components so the test fails if a default changes silently — which is the kind of thing that
 * reads as "the app forgot my settings".
 */
const DEFAULTS: Record<string, boolean> = {
  holdings: true, stash: true, businesses: true, wire: true, lifestyle: true,
  rackets: true, safehouses: true, cases: true,
  trophies: false, log: false, save: false,
};
// Fold preferences are module state shared by every test in this file, so put them back.
beforeEach(() => { for (const [id, def] of Object.entries(DEFAULTS)) toggleFold(id, def); });

describe('every list heading is a control', () => {
  it('renders as a button that says whether it is open', () => {
    const html = render(mk());
    for (const id of ['holdings', 'businesses', 'rackets', 'safehouses', 'log', 'save']) {
      expect(html, `${id} has no foldable heading`).toContain(`aria-controls="fold-${id}"`);
    }
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('the long tail starts shut and the things you act on start open', () => {
    const html = render(mk());
    for (const id of ['holdings', 'businesses', 'rackets', 'safehouses']) {
      expect(bodyOf(html, id), `${id} should start open`).not.toContain('hidden');
    }
    for (const id of ['log', 'save', 'trophies']) {
      expect(bodyOf(html, id), `${id} should start shut`).toContain('hidden');
    }
  });

  it('a shut section still says what is inside it', () => {
    const w = mk();
    w.player.racketIds = [];
    const html = render(w);
    // the count sits on the heading, outside the hidden body, so it reads while shut
    const head = html.slice(0, html.indexOf('id="fold-rackets"'));
    expect(head).toContain('fold-n');
  });

  it('and shut means hidden, not gone — find-in-page still reaches it', () => {
    const w = mk();
    w.log.push({ day: 19, text: 'A very particular thing happened.', tone: 'info', refs: {} });
    const html = render(w);
    expect(bodyOf(html, 'log')).toContain('hidden');
    expect(html, 'the content was unmounted rather than hidden').toContain('A very particular thing happened.');
  });
});

describe('the choice sticks', () => {
  it('shutting one keeps it shut on the next render', () => {
    const w = mk();
    expect(bodyOf(render(w), 'businesses')).not.toContain('hidden');
    toggleFold('businesses', false);
    expect(bodyOf(render(w), 'businesses')).toContain('hidden');
    toggleFold('businesses', true);
    expect(bodyOf(render(w), 'businesses')).not.toContain('hidden');
  });

  it('and opening one that starts shut keeps it open', () => {
    const w = mk();
    expect(bodyOf(render(w), 'log')).toContain('hidden');
    toggleFold('log', true);
    expect(bodyOf(render(w), 'log')).not.toContain('hidden');
  });

  it('a section nobody has touched follows its own default, not a stored guess', () => {
    // `folds` holds only what the player actually changed, so a default can be changed later
    // without fighting a preference somebody set months ago.
    expect(isOpen({ ...useStore.getState(), folds: {} }, 'never-touched', false)).toBe(false);
    expect(isOpen({ ...useStore.getState(), folds: {} }, 'never-touched', true)).toBe(true);
    expect(isOpen({ ...useStore.getState(), folds: { 'never-touched': false } }, 'never-touched', true)).toBe(false);
  });
});

describe('the component on its own', () => {
  it('puts the info dot outside the button, because a button inside a button is neither', () => {
    newGame(mk());
    const html = plain(renderToString(<Section id="x" title="Thing" info={<span className="probe" />}>body</Section>));
    const btn = html.slice(html.indexOf('<button'), html.indexOf('</button>'));
    expect(btn).not.toContain('probe');
    expect(html).toContain('probe');
  });

  it('omits the count entirely when there is nothing to count', () => {
    newGame(mk());
    expect(plain(renderToString(<Section id="x" title="Thing">body</Section>))).not.toContain('fold-n');
    expect(plain(renderToString(<Section id="x" title="Thing" count={0}>body</Section>))).toContain('fold-n');
  });
});
