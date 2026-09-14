/**
 * Nobody repeats a story about themselves as neighbourhood gossip.
 *
 * A block remembers what happened on it, and whoever the player is standing in front of brings the
 * latest of it up. There was no check on *who it was about*, so the man who was mugged reported his
 * own mugging as street talk, and the shopkeeper whose windows went in told you somebody had
 * smashed up his shop.
 *
 * The fix is two-sided, and the second half matters as much as the first: the subject stops
 * narrating it, and their family and friends carry on — now saying whose tie it is, because that is
 * the reason the story reached them at all.
 */
import { describe, expect, it } from 'vitest';
import { dispatch, generateWorld, sceneFor, select } from './index';
import { addMemory } from './people';
import { connect } from './connections';
import type { Business, Npc, World } from './types';
import { BUSINESS_DEFS } from '@content/businesses';

const mk = (seed = 91) => generateWorld({ origin: { lat: 41.88, lng: -87.63 }, placeName: 'Chicago', playerName: 'T', background: 'muscle', seed });
/**
 * Three or more leanable places on one block. Tier 1 only, because a wreck test needs somewhere
 * that can actually be wrecked for protection money, and the start block does not always have
 * three of those — so this walks out to the first block that does rather than skipping the test.
 */
const local = (w: World): Business[] => {
  const soft = (id: string) => select.businessesIn(w, id)
    .filter(b => b.ownedBy === 'npc' && BUSINESS_DEFS[b.type].tier === 1 && BUSINESS_DEFS[b.type].rackets.includes('protection'));
  const blocks = [select.startBlock(w).id, ...Object.keys(w.blocks)];
  for (const id of blocks) { const hit = soft(id); if (hit.length >= 3) return hit; }
  throw new Error('no block in this world has three leanable places');
};
const line = (w: World, n: Npc) => sceneFor(w, 'visit', n.id).line;
const STORY = (n: Npc) => `Somebody put ${n.name} against a wall and went through their pockets.`;

describe('the subject of a story does not tell it', () => {
  it('the person it happened to does not repeat it as gossip', () => {
    const w = mk(); const biz = local(w);
    const victim = w.npcs[biz[0].ownerId];
    addMemory(w, victim.homeBlockId, 'mugging', STORY(victim), { npcId: victim.id });
    const said = line(w, victim);
    expect(said).not.toContain('Everybody is still talking about it');
    expect(said).not.toContain(STORY(victim));
  });

  it('but everybody else on the block still does', () => {
    const w = mk(); const biz = local(w);
    const victim = w.npcs[biz[0].ownerId];
    const other = w.npcs[biz[1].ownerId];
    other.connections = [];
    addMemory(w, victim.homeBlockId, 'mugging', STORY(victim), { npcId: victim.id });
    expect(line(w, other)).toContain(STORY(victim));
    expect(line(w, other)).toContain('Everybody is still talking about it');
  });

  it('and their family and friends say whose it is', () => {
    for (const [kind, label] of [['family', 'cousin'], ['friend', 'old friend']] as const) {
      const w = mk(); const biz = local(w);
      const victim = w.npcs[biz[0].ownerId];
      const kin = w.npcs[biz[1].ownerId];
      victim.connections = []; kin.connections = [];
      connect(victim, kin, kind, label);
      addMemory(w, victim.homeBlockId, 'mugging', STORY(victim), { npcId: victim.id });
      const said = line(w, kin);
      expect(said, label).toContain(`that is their ${label}`);
      expect(said, label).toContain(STORY(victim));
      expect(said, label).not.toContain('Everybody is still talking about it');
    }
  });

  it('somebody talks about their own place being hit, but as theirs rather than as gossip', () => {
    const w = mk(); const biz = local(w);
    const place = biz[0]; const owner = w.npcs[place.ownerId];
    addMemory(w, place.blockId, 'raid', `The cops raided ${place.name}.`, { businessId: place.id, npcId: owner.id });
    const said = line(w, owner);
    expect(said).toContain('still sweeping up');
    expect(said).toContain(place.name);
    expect(said).not.toContain('Everybody is still talking about it');
  });

  it('the block moves on to a story that is not about them', () => {
    const w = mk(); const biz = local(w);
    const victim = w.npcs[biz[0].ownerId];
    const other = w.npcs[biz[1].ownerId];
    addMemory(w, victim.homeBlockId, 'mugging', STORY(victim), { npcId: victim.id });
    addMemory(w, victim.homeBlockId, 'wreck', `Somebody smashed up ${biz[2].name} in broad daylight.`, { npcId: other.id, businessId: biz[2].id });
    // the newest is about `other`, so the victim tells that one instead of staying silent
    expect(line(w, victim)).toContain(biz[2].name);
    // and `other` skips past their own to the older one
    expect(line(w, other)).toContain(STORY(victim));
  });

  it('a memory with no subject is told by everybody, so an old save loses nothing', () => {
    const w = mk(); const biz = local(w);
    const n = w.npcs[biz[0].ownerId];
    addMemory(w, n.homeBlockId, 'claim', 'The empty lots changed hands.');
    expect(line(w, n)).toContain('The empty lots changed hands.');
  });

  it('old news is old news, whoever it was about', () => {
    const w = mk(); const biz = local(w);
    const n = w.npcs[biz[0].ownerId];
    addMemory(w, n.homeBlockId, 'claim', 'The empty lots changed hands.');
    w.day += 40;
    expect(line(w, n)).not.toContain('The empty lots changed hands.');
  });
});

describe('the real paths that write these, end to end', () => {
  it('wrecking a place tags the owner, so the owner never reports it as street talk', () => {
    let w = mk(93);
    const place = local(w)[0]; const owner = w.npcs[place.ownerId];
    w.player.currentBlockId = place.blockId;
    w.player.skills = { ...w.player.skills, muscle: 10 };
    const mate = Object.values(w.npcs).find(x => x.alive && !x.crew && x.id !== owner.id)!;
    mate.crew = { loyalty: 60, cut: 0, status: 'idle', statusDays: 0, joinedDay: 1 }; w.player.crewIds.push(mate.id);
    for (let i = 0; i < 6 && !w.blocks[place.blockId].memory.some(m => m.kind === 'wreck'); i++) {
      w.player.ap = 4;
      w = dispatch(w, { type: 'shakedown', businessId: place.id, approach: 'wreck' });
    }
    const mem = w.blocks[place.blockId].memory.find(m => m.kind === 'wreck');
    expect(mem, 'a wreck should have been recorded').toBeDefined();
    expect(mem!.about?.npcId).toBe(owner.id);
    expect(mem!.about?.businessId).toBe(place.id);
    expect(line(w, w.npcs[owner.id])).not.toContain('Everybody is still talking about it');
  });

  it('every memory the sim writes that names a person carries who it is about', () => {
    // a cheap structural guard: a story with somebody's name in it and no subject is the bug
    const w = mk(94);
    const names = Object.values(w.npcs).map(n => n.name);
    addMemory(w, select.startBlock(w).id, 'mugging', STORY(w.npcs[local(w)[0].ownerId]), { npcId: local(w)[0].ownerId });
    for (const b of Object.values(w.blocks)) {
      for (const m of b.memory) {
        const named = names.find(nm => m.text.includes(nm));
        if (named) expect(m.about?.npcId, `"${m.text}" names somebody and says nothing about who`).toBeDefined();
      }
    }
  });
});
