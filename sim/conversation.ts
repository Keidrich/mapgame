/**
 * A conversation with somebody, as more than one button press.
 *
 * A scene used to be: read the opening line, pick one of three approaches, get the result. Every
 * conversation in the game was the same three moves regardless of who you were talking to, what
 * you knew about them, or anything that had ever passed between you. All of that existed — the
 * connections graph, the agendas, the standing system, and now the ledger — and none of it was
 * in the room.
 *
 * A conversation is now a **pending thing the player answers**, which is structurally the same as
 * somebody at your door or a job going wrong mid-way, so it rides the same queue: a
 * `Confrontation` with `kind: 'talk'`, answered through `resolve_confrontation`, rendered by the
 * same modal. That was a deliberate choice over a second pending-action mechanism — the queue
 * already handles the end-of-day sweep, the "deal with what is in front of you" gate and the
 * modal stacking, and a parallel system would have had to reimplement all three and stay in step
 * with them for ever.
 *
 * The menu is generated, never authored per person:
 *   - the scene's own approaches, which close the conversation (what used to be the whole scene);
 *   - **their agenda**, if you have actually established what it is — the move from `sim/agendas.ts`;
 *   - **a name you both know**, drawn from the connections graph;
 *   - **something out of your history with them**, drawn from the ledger.
 *
 * The last two are *opening* moves: they do not close the conversation, they buy a bonus on the
 * approach you close with, and each can only be worked once per conversation. That is the whole
 * tactical shape — spend a beat softening somebody and take better odds, or go straight in.
 */
import { APPROACHES } from '@content/lines';
import { agendaChance, agendaCost, agendaMoves, agendaReason, resolveAgenda, sharedConnections } from './agendas';
import { lastOf, ledgerOf, remember } from './ledger';
import { approachChance } from './scenes';
import { queueConfrontation } from './combat';
import type { Rng } from './rng';
import { PLAYER, type Confrontation, type Id, type LedgerKind, type Npc, type SceneKind, type TalkMove, type World } from './types';
import { adjustRel, log, money } from './util';

/** What an opening move is worth on the approach you eventually close with. */
export const TALK = {
  nameBonus: 12,        // somebody you both know, vouching for you by association
  nameCrewBonus: 6,     // and more when that somebody actually works for you
  recallGood: 10,       // a favour of yours they have not forgotten
  recallBad: -8,        // ...or a night they have not forgotten either, brought up badly
  soured: 8,            // an opening move that lands wrong costs them trust
  maxBeats: 3,          // openers available before the conversation has to go somewhere
};

export interface TalkOption {
  id: TalkMove;
  label: string;
  icon: string;
  blurb: string;
  good: string;
  bad: string;
  chance: number;
  /** Openers stay in the conversation; everything else ends it. */
  closes: boolean;
  costCash?: number;
  disabled?: string;
}

// ------------------------------------------------------------------ starting one
/**
 * Open a conversation. Returns the queued confrontation so the reducer can hand its id straight
 * back; the player then answers it exactly as they would answer somebody at the door.
 */
export function startConversation(w: World, scene: SceneKind, npcId: Id, businessId?: Id, otherFactionId?: Id): Confrontation {
  const n = w.npcs[npcId];
  return queueConfrontation(w, {
    factionId: n?.faction ?? PLAYER,
    kind: 'talk',
    war: false,
    npcId,
    blockId: n?.homeBlockId,
    businessId,
    text: openingFor(w, scene, n),
    talk: { scene, businessId, otherFactionId, beat: 0, bonus: 0, used: [] },
  });
}

/**
 * What they say when you walk in. The existing opening lines, plus one clause of history: the
 * point of the ledger is that the second conversation does not sound like the first.
 */
export function openingFor(w: World, scene: SceneKind, n: Npc | undefined): string {
  if (!n) return 'There is nobody here.';
  // `sceneFor` owns the trait/mood line; this adds what has passed between you to the front of it
  const owed = n.rel.favours ?? 0;
  const owe = n.rel.owedToThem ?? 0;
  const last = ledgerOf(n).slice(-1)[0];
  const pre =
    owed > 0 ? `They straighten up when they see you. ` :
    owe > 0 ? `They look like somebody who is owed something. ` :
    n.grudge ? `They do not get up. ` : '';
  // The factual receipt — but only when the opening did not already speak to that same entry.
  // `openingLine` now brings the last thing up in voice (`ledgerCallback`), and printing both is
  // the game saying it twice in one breath. Asking the same deterministic function gets the same
  // answer without threading a flag between two files that could drift apart.
  const spoken = ledgerCallback(w, n)?.entry;
  const post = last && w.day - last.day <= 20 && last.kind !== 'met' && !(spoken && spoken.day === last.day && spoken.text === last.text)
    ? ` (Last time: ${last.text})` : '';
  return `${pre}${sceneLine(w, scene, n)}${post}`;
}

// the opening-line table lives in scenes.ts, which owns the trait selection
import { ledgerCallback, sceneFor } from './scenes';
function sceneLine(w: World, scene: SceneKind, n: Npc): string {
  return sceneFor(w, scene, n.id).line;
}

// ------------------------------------------------------------------ the menu
export function talkOptions(w: World, c: Confrontation): TalkOption[] {
  const t = c.talk; const n = c.npcId ? w.npcs[c.npcId] : undefined;
  if (!t || !n) return [];
  const out: TalkOption[] = [];

  // 1. their agenda, if you have actually established what it is
  for (const m of agendaMoves(w, n)) {
    const id = `agenda:${m.mode}` as TalkMove;
    const cost = agendaCost(w, n, m.mode);
    const why = agendaReason(w, n, m.mode);
    out.push({
      id, label: m.label, icon: m.icon, blurb: m.blurb, good: m.good, bad: m.bad,
      chance: agendaChance(w, n, m.mode), closes: true, costCash: cost || undefined,
      disabled: why ?? (cost > w.player.cash ? `Needs ${money(cost)} clean.` : undefined),
    });
  }

  // 2. somebody you both know. The graph decides who; nothing here is authored per person
  if (t.used.length < TALK.maxBeats) {
    for (const o of sharedConnections(w, n).slice(0, 2)) {
      const id = `name:${o.id}` as TalkMove;
      if (t.used.includes(id)) continue;
      const tie = n.connections.find(x => x.npcId === o.id)?.label ?? 'somebody you both know';
      out.push({
        id, label: `Mention ${o.name}`, icon: 'social',
        blurb: `Their ${tie}. ${o.crew ? 'Works for you.' : 'Thinks well of you.'} Say the name and see what it buys.`,
        good: 'They warm up; better odds on whatever you ask next', bad: 'Wrong name, wrong day; they cool off',
        chance: nameChance(w, n, o), closes: false,
      });
    }
  }

  // 3. something out of your history with them
  if (t.used.length < TALK.maxBeats) {
    for (const kind of ['favour', 'owed', 'deal', 'harm'] as LedgerKind[]) {
      const e = lastOf(n, kind); if (!e) continue;
      const id = `recall:${kind}` as TalkMove;
      if (t.used.includes(id)) continue;
      const good = kind === 'favour' || kind === 'deal';
      out.push({
        id, label: good ? 'Remind them what you did' : kind === 'owed' ? 'Call in what they owe you' : 'Bring up what happened',
        icon: 'accountant',
        blurb: `Day ${e.day}: ${e.text}`,
        good: good ? 'They remember it the way you do' : 'They would rather move past it, and will pay to',
        bad: good ? 'They remember it differently' : 'You have reopened something',
        chance: recallChance(w, n, good), closes: false,
      });
    }
  }

  // 4. the scene's own approaches — what the whole scene used to be — carrying the bonus
  for (const a of APPROACHES[t.scene]) {
    out.push({
      id: `approach:${a.id}` as TalkMove,
      label: a.label, icon: a.icon, blurb: a.blurb, good: a.good, bad: a.bad,
      chance: Math.max(3, Math.min(97, approachChance(w, t.scene, a.id, n, t.businessId ? w.businesses[t.businessId] : undefined, t.otherFactionId) + t.bonus)),
      closes: true,
    });
  }

  out.push({ id: 'leave', label: 'Leave it', icon: 'legwork', blurb: 'Nothing said, nothing spent.', good: 'You keep the time', bad: '—', chance: 100, closes: true });
  return out;
}

function nameChance(w: World, n: Npc, o: Npc): number {
  const s = w.player.skills;
  return Math.max(3, Math.min(97, Math.round(45 + s.charm * 4 + (o.crew ? 12 : 0) + o.rel.trust * 0.2 - n.nerve * 0.15)));
}
function recallChance(w: World, n: Npc, good: boolean): number {
  const s = w.player.skills;
  return Math.max(3, Math.min(97, Math.round((good ? 62 : 48) + s.charm * 3 + n.rel.trust * 0.15 - (good ? 0 : n.nerve * 0.2))));
}

// ------------------------------------------------------------------ answering one
export interface TalkResult {
  /** Set when the conversation is over and the queue entry should be dropped. */
  closed: boolean;
  /** For a closing approach: the scene action the reducer should now run, with its bonus. */
  approach?: string;
  bonus?: number;
}

/**
 * Work one move. Openers mutate the conversation in place and leave it queued; closers report
 * back so the reducer can run the scene, or resolve the agenda here and be done.
 */
export function resolveTalk(w: World, c: Confrontation, move: TalkMove | 'absent', rng: Rng): TalkResult {
  const t = c.talk!; const n = c.npcId ? w.npcs[c.npcId] : undefined;
  if (!n || move === 'absent' || move === 'leave') {
    // walking out of a conversation is not an attack landing: nothing happens, which is the
    // point of separating this from the kinds of confrontation that are somebody at your door
    if (n && t.used.length) remember(w, n, 'talk', 'A conversation that went nowhere.');
    return { closed: true };
  }

  if (move.startsWith('agenda:')) {
    const mode = move.slice('agenda:'.length) as 'settle' | 'trap';
    const cost = agendaCost(w, n, mode);
    if (cost > 0) w.player.cash -= cost;
    const out = resolveAgenda(w, n, mode, rng);
    c.text = out.text;
    return { closed: true };
  }

  if (move.startsWith('name:') || move.startsWith('recall:')) {
    const opt = talkOptions(w, c).find(o => o.id === move);
    const won = !!opt && rng.int(1, 100) <= opt.chance;
    t.used.push(move);
    t.beat += 1;
    if (move.startsWith('name:')) {
      const o = w.npcs[move.slice('name:'.length)];
      if (won) {
        t.bonus += o?.crew ? TALK.nameBonus + TALK.nameCrewBonus : TALK.nameBonus;
        t.reply = `"${o?.name.split(' ')[0] ?? 'They'}? ..." Something goes out of their shoulders. They are listening properly now.`;
        adjustRel(w, n, { trust: 3 });
      } else {
        t.bonus -= 4;
        t.reply = `"What has ${o?.name.split(' ')[0] ?? 'that'} got to do with anything?" That was the wrong name to use.`;
        adjustRel(w, n, { trust: -TALK.soured });
      }
    } else {
      const kind = move.slice('recall:'.length) as LedgerKind;
      const good = kind === 'favour' || kind === 'deal';
      if (won) {
        t.bonus += good ? TALK.recallGood : -TALK.recallBad;
        t.reply = good
          ? `"I know. I have not forgotten." They mean it.`
          : `They go quiet. "What do you want for it."`;
        if (!good && kind === 'owed') { n.rel.owedToThem = Math.max(0, (n.rel.owedToThem ?? 0) - 1); }
      } else {
        t.bonus += TALK.recallBad;
        t.reply = good
          ? `"Is that what that was?" They remember it differently, and they say so.`
          : `You should not have brought that up. The room changes.`;
        adjustRel(w, n, { trust: -TALK.soured });
      }
    }
    // out of openers: the conversation has to go somewhere now
    if (t.used.length >= TALK.maxBeats) t.reply = `${t.reply ?? ''} They are waiting for you to get to it.`.trim();
    return { closed: false };
  }

  // a closing approach: the scene runs the way it always did, with whatever the openers bought
  const approach = move.slice('approach:'.length);
  if (t.used.length) remember(w, n, 'talk', t.bonus >= 0 ? 'You talked them round before you asked for anything.' : 'A conversation that went badly before you even asked.');
  return { closed: true, approach, bonus: t.bonus };
}

/** Is this confrontation a conversation? Used by the gate and the modal to tell them apart. */
export function isTalk(c: Confrontation | undefined): boolean { return c?.kind === 'talk'; }

export { log };
