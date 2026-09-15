/**
 * The social layer as a picture.
 *
 * By late game this is the deepest thing in the game — dozens of people met, assets placed inside
 * two outfits, a nemesis who has been at the door nine times, and a connections graph underneath
 * it all that already decides how word travels. It has only ever been a list, and a list is the
 * one shape that cannot show the thing that matters most: that your informant inside the Delgados
 * is somebody's cousin, and that cousin is the lieutenant who keeps turning up.
 *
 * Two contracts, and the first is the one that keeps this honest: **it adds no data.** Every field
 * comes off `Npc`, `n.connections`, `n.asset`, `n.nemesis`. The second is that the layout lives in
 * `/sim`, because a position that depends on who is in the world is a derived value like any other
 * — which is also what lets most of this file test the picture without rendering anything.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PLAYER, dispatch, generateWorld, select, type Npc, type World } from '@sim/index';
import { relationshipWeb, WEB_MAX } from '@sim/relationships';
import { RelationshipMap } from './components/RelationshipMap';
import { SocialTab } from './components/SocialTab';
import { newGame } from './store';
import { asHtml, plain } from './test-util';

/** A world with one of everything the map is supposed to draw. */
function populated(): { w: World; crew: Npc; asset: Npc; villain: Npc } {
  let w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'charm', seed: 14 });
  w.pendingEvents = []; w.day = 40; w.player.respect = 40; w.player.fear = 30;

  const patrons = Object.values(w.npcs).filter(n => n.alive && n.role === 'patron');
  const crew = patrons[0];
  crew.role = 'crew'; crew.known = true;
  crew.crew = { loyalty: 70, cut: 90, status: 'idle', statusDays: 0, joinedDay: 12 };
  w.player.crewIds.push(crew.id); w.player.crewEver++;

  const asset = patrons[1];
  asset.known = true;
  asset.asset = { kind: 'informant', since: 20, factionId: Object.values(w.factions)[0].id, used: 2 };

  const villain = Object.values(w.npcs).find(n => n.alive && n.role === 'lieutenant')!;
  villain.known = true;
  villain.nemesis = { since: 15, wins: 4, losses: 1, notoriety: 62, earned: ['hardened', 'named'], nickname: 'the Nail' };

  // and a tie between two of them, which is the reason the picture exists
  asset.connections = [...(asset.connections ?? []), { npcId: villain.id, kind: 'family', label: 'cousin' }];
  villain.connections = [...(villain.connections ?? []), { npcId: asset.id, kind: 'family', label: 'cousin' }];

  w = dispatch(w, { type: 'cheat', what: 'unlock' });
  return { w, crew, asset, villain };
}

describe('the web is the real data, read back', () => {
  it('you are at the middle, and the people who are something to you are on it', () => {
    const { w, crew, asset, villain } = populated();
    const web = relationshipWeb(w);
    const ids = new Set(web.nodes.map(n => n.id));
    expect(web.nodes[0].id).toBe(PLAYER);
    expect(web.nodes[0].ring).toBe(0);
    for (const [who, label] of [[crew, 'crew'], [asset, 'asset'], [villain, 'nemesis']] as const) {
      expect(ids.has(who.id), `${label} is not on the map`).toBe(true);
      expect(web.nodes.find(n => n.id === who.id)!.kind).toBe(label);
    }
  });

  it('yours is nearer than theirs', () => {
    const { w, crew, villain } = populated();
    const web = relationshipWeb(w);
    const at = (id: string) => web.nodes.find(n => n.id === id)!;
    expect(at(crew.id).ring).toBeLessThan(at(villain.id).ring);
  });

  it('the connections graph is what joins them, not something invented here', () => {
    const { w, asset, villain } = populated();
    const web = relationshipWeb(w);
    const tie = web.links.find(l => (l.a === asset.id && l.b === villain.id) || (l.a === villain.id && l.b === asset.id));
    expect(tie, 'the cousin tie between the informant and the nemesis is not drawn').toBeTruthy();
    expect(tie!.kind).toBe('family');
    // and it really is read off the npc, not assumed
    expect(asset.connections!.some(c => c.npcId === villain.id)).toBe(true);
  });

  it('and yours are joined to you', () => {
    const { w, crew, asset } = populated();
    const web = relationshipWeb(w);
    for (const who of [crew, asset]) {
      expect(web.links.some(l => l.kind === 'yours' && l.a === PLAYER && l.b === who.id), `${who.name} is not joined to you`).toBe(true);
    }
  });

  it('a nemesis reads as trouble', () => {
    const { w, villain, crew } = populated();
    const web = relationshipWeb(w);
    expect(web.nodes.find(n => n.id === villain.id)!.hostile).toBe(true);
    expect(web.nodes.find(n => n.id === crew.id)!.hostile).toBe(false);
  });

  it('every node says in words why it is there', () => {
    const { w } = populated();
    for (const n of relationshipWeb(w).nodes) expect(n.note.length, `${n.name} is on the map for no stated reason`).toBeGreaterThan(3);
  });
});

describe('it is a map, so it has to hold still', () => {
  it('reading it twice gives the same picture', () => {
    const { w } = populated();
    expect(JSON.stringify(relationshipWeb(w))).toBe(JSON.stringify(relationshipWeb(w)));
  });

  it('and it survives a save round trip unchanged', () => {
    const { w } = populated();
    const reloaded = JSON.parse(JSON.stringify(w)) as World;
    expect(JSON.stringify(relationshipWeb(reloaded))).toBe(JSON.stringify(relationshipWeb(w)));
  });

  it('everything stays inside the circle it is drawn in', () => {
    const { w } = populated();
    for (const n of relationshipWeb(w).nodes) {
      expect(Math.hypot(n.x, n.y), `${n.name} is outside the frame`).toBeLessThanOrEqual(1.0001);
    }
  });

  it('a late-game city does not turn into mush', () => {
    const { w } = populated();
    for (const n of Object.values(w.npcs).filter(x => x.alive && x.role === 'lieutenant')) {
      n.known = true; n.nemesis = { since: 10, wins: 3, losses: 0, notoriety: 50, earned: [] };
    }
    expect(relationshipWeb(w).nodes.length).toBeLessThanOrEqual(WEB_MAX + 1);
  });

  it('no link points at somebody who is not drawn', () => {
    const { w } = populated();
    const web = relationshipWeb(w);
    const ids = new Set(web.nodes.map(n => n.id));
    for (const l of web.links) { expect(ids.has(l.a)).toBe(true); expect(ids.has(l.b)).toBe(true); }
  });
});

describe('and it draws', () => {
  it('renders the people it found, with their names on it', () => {
    const { w, villain } = populated();
    newGame(w);
    const html = plain(renderToString(<RelationshipMap />));
    expect(html).toContain('<svg');
    expect(html).toContain('<circle');
    // the name they actually go by: an earned nickname replaces the given one here as in the log
    expect(html, 'the nemesis is not named anywhere on the picture').toContain(asHtml(select.nemesisName(villain)));
    expect(select.nemesisName(villain)).toContain('the Nail');
    expect([...html.matchAll(/<circle/g)].length).toBeGreaterThan(4);
  });

  it('is reachable from the social tab, alongside the lists it did not replace', () => {
    const { w } = populated();
    newGame(w);
    const html = plain(renderToString(<SocialTab />));
    expect(html).toContain('Web');
    for (const mode of ['Ties', 'District', 'Faction']) expect(html, `${mode} went missing`).toContain(mode);
  });

  it('says so plainly when there is nothing to draw yet', () => {
    const w = generateWorld({ origin: { lat: 51.5, lng: -0.12 }, placeName: 'London', playerName: 'T', background: 'muscle', seed: 2 });
    w.pendingEvents = [];
    newGame(w);
    const html = plain(renderToString(<RelationshipMap />));
    expect(html).not.toContain('<svg');
    expect(html).toMatch(/Nobody is anything to you yet/);
  });

  it('draws no emoji: the icon set is the whole point of the look', () => {
    const { w } = populated();
    newGame(w);
    const html = plain(renderToString(<RelationshipMap />));
    expect(html.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)).toBeNull();
  });
});

describe('it adds no data', () => {
  it('reading the web does not change a single thing about the world', () => {
    const { w } = populated();
    const before = JSON.stringify(w);
    relationshipWeb(w);
    newGame(w);
    renderToString(<RelationshipMap />);
    expect(JSON.stringify(select.metNpcs(w).length ? w : w)).toBe(before);
  });
});
