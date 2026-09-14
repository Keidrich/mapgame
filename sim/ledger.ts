/**
 * What has actually passed between the player and one person.
 *
 * The game already knew a great deal about every relationship and showed almost none of it. Trust,
 * fear and respect were three bars with no account of where they came from; a size-up, a tap, a
 * favour settled and a night somebody's window went in all landed in the same three numbers and
 * then vanished. A player refused a concession had nowhere to look to find out what they had
 * actually done with this person.
 *
 * So every meaningful exchange writes one line here, and `dossier()` assembles the lot — facts you
 * have established, history, favours in both directions, and whatever hold you currently have —
 * into the one view the UI renders. Deliberately one screen for everybody: a shopkeeper and a
 * lieutenant have the same kind of history with you, and the difference is what is in it.
 *
 * Nothing here decides anything. It is a record, read by the conversation system to know what can
 * be brought up, and by the ledger screen to show a player why they stand where they stand.
 */
import type { Id, LedgerEntry, LedgerKind, Npc, World } from './types';
import { contacts, daysKnown, favours, leverageOver, trustCeiling, type Leverage } from './standing';

/** Lines kept per person. Long enough to remember a relationship, short enough to stay a save. */
export const LEDGER_MAX = 20;

export function ledgerOf(n: Npc): LedgerEntry[] { return n.ledger ?? []; }

/**
 * Write one line. Called at the moments that actually mean something — not from `adjustRel`,
 * which fires on gossip and gate-keeping and gradual drift and would bury the page in noise.
 */
export function remember(w: World, n: Npc | undefined, kind: LedgerKind, text: string): void {
  if (!n) return;
  const list = n.ledger ?? (n.ledger = []);
  // the same thing on the same day is one thing: a scene that nudges three numbers is one visit
  if (list.some(e => e.day === w.day && e.kind === kind && e.text === text)) return;
  list.push({ day: w.day, kind, text });
  if (list.length > LEDGER_MAX) list.splice(0, list.length - LEDGER_MAX);
}

/** They did something for you. The other half of `doFavour`, and it is the player who owes. */
export function oweThem(w: World, n: Npc, why: string): void {
  n.rel.owedToThem = (n.rel.owedToThem ?? 0) + 1;
  remember(w, n, 'owed', why);
}
export function owedToThem(n: Npc): number { return n.rel.owedToThem ?? 0; }

/** The most recent line of a given kind, for a conversation that wants to bring something up. */
export function lastOf(n: Npc, kind: LedgerKind): LedgerEntry | undefined {
  for (let i = ledgerOf(n).length - 1; i >= 0; i--) if (ledgerOf(n)[i].kind === kind) return ledgerOf(n)[i];
  return undefined;
}

export interface Fact { label: string; value: string; tone?: 'good' | 'bad' }
export interface Dossier {
  npcId: Id;
  /** Established facts: what a size-up, a tap or a look at the books actually told you. */
  facts: Fact[];
  history: LedgerEntry[];
  theyOwe: number;
  youOwe: number;
  hold?: Leverage;
  /** Empty-state copy, so the screen never renders a bare heading with nothing under it. */
  blank: boolean;
}

/**
 * Everything known about one person, assembled. Identical for a shopkeeper and a lieutenant:
 * the crew rows simply do not appear for somebody who is not crew, which is the whole reason
 * this is one function and not two screens built twice.
 */
export function dossier(w: World, n: Npc): Dossier {
  const facts: Fact[] = [];
  const known = n.known || n.rel.trust >= 20;
  facts.push({ label: 'Known', value: n.rel.metDay === undefined ? 'never dealt with them' : `${daysKnown(w, n)} day${daysKnown(w, n) === 1 ? '' : 's'}, ${contacts(n)} time${contacts(n) === 1 ? '' : 's'}` });
  if (known) {
    facts.push({ label: 'Nerve', value: String(n.nerve) });
    if (n.traits.length) facts.push({ label: 'Read as', value: n.traits.join(', ') });
  } else {
    facts.push({ label: 'Read', value: 'not sized up — traits and nerve unknown', tone: 'bad' });
  }
  if (n.agenda && !n.agenda.done) facts.push({ label: 'Wants', value: `${n.agenda.kind} (${Math.round(n.agenda.progress)}%)` });
  if (n.tap) facts.push({ label: 'Tap', value: `running since day ${n.tap.since}`, tone: 'good' });
  if (n.ratted !== undefined) facts.push({ label: 'Books', value: `read on day ${n.ratted}`, tone: 'good' });
  if (n.intel) facts.push({ label: 'Inside', value: `${n.intel.kind} since day ${n.intel.since}`, tone: 'good' });
  if (n.recipe) facts.push({ label: 'Knows', value: `a recipe: ${n.recipe}` });
  if (n.hostage) facts.push({ label: 'Held', value: `in your safehouse since day ${n.hostage.since}`, tone: 'bad' });
  if (n.grudge) facts.push({ label: 'Grudge', value: n.grudge.reason, tone: 'bad' });
  if (n.crew) {
    facts.push({ label: 'Crew', value: `${n.crew.status}, loyalty ${Math.round(n.crew.loyalty)}, joined day ${n.crew.joinedDay}` });
    if (n.crew.assignment) facts.push({ label: 'Doing', value: n.crew.assignment.kind });
  }
  facts.push({ label: 'Trust ceiling', value: `${trustCeiling(n)} — ordinary dealing stops below this` });
  const history = ledgerOf(n).slice().reverse();
  return { npcId: n.id, facts, history, theyOwe: favours(n), youOwe: owedToThem(n), hold: leverageOver(w, n), blank: history.length === 0 };
}
