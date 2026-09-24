/**
 * The back rooms (`content/backroom.ts`): five-card draw at a real table, street dice, and the
 * numbers. Everything is dealt from the world's seeded rng inside `dispatch`, so a table is as
 * replayable as the rest of the game, and the table itself is state (`World.table`) that the screen
 * reads and answers one action at a time.
 *
 * A hand: everybody antes; you are dealt five and choose what to hold; the others draw by simple
 * rules; then you fold, call (a showdown for the pot as it stands) or raise (twice the ante, which
 * each of them calls or folds on the strength of what they hold and their nerve). Best hand wins,
 * less the house's cut unless the house is yours.
 */
import { DICE, NUMBERS, POKER, TABLES } from '@r/content/backroom';
import { half } from './clock';
import { cityOfBlock } from './region';
import { Rng } from './rng';
import type { Business, Id, Table, World } from './types';
import { PLAYER } from './types';
import { addHeat, clamp, fullName, log, money, spend } from './util';

// ------------------------------------------------------------------------------------------ cards
/** A card is 0..51: rank = c % 13 (0 is a two, 12 an ace), suit = c / 13. */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS = ['♠', '♥', '♦', '♣'];
export const cardName = (c: number) => `${RANKS[c % 13]}${SUITS[Math.floor(c / 13)]}`;
export const CATEGORY = ['high card', 'a pair', 'two pair', 'three of a kind', 'a straight', 'a flush', 'a full house', 'four of a kind', 'a straight flush'];

/**
 * A hand's score: category × 13⁵ plus the ranks that break a tie, most important first (the ranks
 * of the biggest groups, then the kickers). Higher is better; equal is a split.
 */
export function score(hand: number[]): number {
  const ranks = hand.map(c => c % 13);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = hand.every(c => Math.floor(c / 13) === Math.floor(hand[0] / 13));
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3) straightHigh = 3;   // the wheel: A-2-3-4-5 is five-high
  }
  let cat: number;
  let order = groups.map(g => g[0]);
  if (straightHigh >= 0 && flush) { cat = 8; order = [straightHigh]; }
  else if (groups[0][1] === 4) cat = 7;
  else if (groups[0][1] === 3 && groups[1][1] === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straightHigh >= 0) { cat = 4; order = [straightHigh]; }
  else if (groups[0][1] === 3) cat = 3;
  else if (groups[0][1] === 2 && groups[1][1] === 2) cat = 2;
  else if (groups[0][1] === 2) cat = 1;
  else cat = 0;
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 13 + (order[i] ?? 0);
  return s;
}
export const categoryOf = (hand: number[]) => Math.floor(score(hand) / 13 ** 5);
export const describe = (hand: number[]) => CATEGORY[categoryOf(hand)];

/** What a player at the table keeps: any pair or better, four to a flush, or the top card. */
export function autoHold(hand: number[]): number[] {
  const counts = new Map<number, number>();
  for (const c of hand) counts.set(c % 13, (counts.get(c % 13) ?? 0) + 1);
  const paired = hand.map((c, i) => ((counts.get(c % 13) ?? 0) >= 2 ? i : -1)).filter(i => i >= 0);
  if (categoryOf(hand) >= 4) return [0, 1, 2, 3, 4];
  if (paired.length) return paired;
  for (let s = 0; s < 4; s++) { const f = hand.map((c, i) => (Math.floor(c / 13) === s ? i : -1)).filter(i => i >= 0); if (f.length === 4) return f; }
  const top = hand.map((c, i) => ({ r: c % 13, i })).sort((a, b) => b.r - a.r);
  return top[0].r >= 10 ? [top[0].i] : [];
}

// ----------------------------------------------------------------------------------------- where
/** A place a game can be found tonight: the right kind of place, or any place with a gambling den behind it. */
export function hasTable(w: World, b: Business | undefined): boolean {
  if (!b || b.closed > 0) return false;
  return TABLES.includes(b.type) || b.racketIds.some(id => w.rackets[id]?.kind === 'gambling_den');
}
const houseIsYours = (w: World, b: Business) => b.ownedBy === PLAYER || b.racketIds.some(id => w.rackets[id]?.kind === 'gambling_den' && w.rackets[id].owner === PLAYER);

export function tableBlock(w: World, businessId: Id, stake: number): string | undefined {
  const b = w.businesses[businessId];
  if (!hasTable(w, b)) return 'There is no game here.';
  if (half(w) !== 'night') return 'The game starts after dark.';
  if (b.blockId !== w.player.blockId) return `Go to ${w.blocks[b.blockId].name} first.`;
  if (!POKER.stakes.includes(stake)) return 'Those are not the stakes.';
  if (w.player.cash + w.player.dirty < stake * POKER.bankroll) return `Sit down with less than ${money(stake * POKER.bankroll)} and you will be up again in a hand.`;
  if (w.table && w.table.stage !== 'left') return 'You are already at a table.';
  return undefined;
}

// ----------------------------------------------------------------------------------------- poker
const STRANGERS = ['a salesman from out of town', 'a sailor on shore leave', 'a dentist who should be at home', 'a bookie on his night off', 'a widow with a lot of rings'];

function deal(w: World, rng: Rng, t: Table) {
  const deck = rng.shuffle([...Array(52).keys()]);
  t.hand = deck.splice(0, 5);
  for (const s of t.seats) { s.hand = deck.splice(0, 5); s.folded = false; }
  t.deck = deck;
  t.pot = t.stake * (1 + t.seats.length);
  t.stage = 'draw';
  t.lines = [`Hand ${t.hands + 1}. Everybody antes ${money(t.stake)}.`];
  t.reads = undefined; t.youWon = undefined; t.caught = undefined;
  t.hands++;
  spend(w, t.stake); t.net -= t.stake;
}

export function sitDown(w: World, rng: Rng, businessId: Id, stake: number, npcId?: Id) {
  const b = w.businesses[businessId];
  const regulars = b.patronIds.map(id => w.npcs[id]).filter(n => n?.alive && !n.crew && !n.official && !n.jailedDays);
  const first = npcId ? [w.npcs[npcId], ...regulars.filter(n => n.id !== npcId)] : rng.shuffle(regulars);
  const seats: Table['seats'] = [];
  for (let i = 0; i < POKER.seats; i++) {
    const n = first[i];
    seats.push(n ? { npcId: n.id, name: fullName(n), hand: [], nerve: n.nerve } : { name: rng.pick(STRANGERS), hand: [], nerve: rng.int(30, 70) });
  }
  const t: Table = { game: 'poker', businessId, stake, hand: [], deck: [], seats, pot: 0, stage: 'draw', lines: [], hands: 0, net: 0, straight: true };
  w.table = t;
  deal(w, rng, t);
}

/** The chance of reading a player at the table. */
export const readChance = (w: World) => Math.min(POKER.readMax, POKER.read + w.player.skills.brains * POKER.readBrains + w.player.skills.charm * POKER.readCharm);
/** The chance of being caught dealing from the bottom. */
export const cheatChance = (w: World) => Math.max(POKER.cheatFloor, POKER.cheat - w.player.skills.tech * POKER.cheatTech - w.player.skills.brains * POKER.cheatBrains);

export function draw(w: World, rng: Rng, hold: number[], cheat: boolean) {
  const t = w.table!;
  const keep = t.hand.filter((_, i) => hold.includes(i));
  const need = 5 - keep.length;
  if (cheat) {
    t.straight = false;
    if (rng.chance(cheatChance(w))) { caught(w, t); return; }
    // from the bottom: the best `need` cards for what you kept, out of a handful off the bottom
    const pool = t.deck.splice(-12);
    let best: number[] = pool.slice(0, need); let bs = -1;
    for (let tries = 0; tries < 40; tries++) { const pick = rng.shuffle(pool).slice(0, need); const s = score([...keep, ...pick]); if (s > bs) { bs = s; best = pick; } }
    t.hand = [...keep, ...best];
    t.deck.push(...pool.filter(c => !best.includes(c)));
  } else t.hand = [...keep, ...t.deck.splice(0, need)];
  t.lines.push(need ? `You draw ${need}${cheat ? ', from the bottom' : ''}: ${describe(t.hand)}.` : `You stand pat: ${describe(t.hand)}.`);
  for (const s of t.seats) {
    const k = autoHold(s.hand);
    const n = 5 - k.length;
    s.hand = [...s.hand.filter((_, i) => k.includes(i)), ...t.deck.splice(0, n)];
    t.lines.push(`${cap1(s.name)} ${n ? `takes ${n}` : 'stands pat'}.`);
  }
  // a read on each of them, if you have the head and the eye for it
  const rc = readChance(w);
  t.reads = t.seats.map(s => {
    if (!rng.chance(rc)) return 'gives nothing away';
    const cat = categoryOf(s.hand);
    return cat >= 3 ? 'is sitting on something big' : cat === 2 ? 'likes their hand' : cat === 1 ? 'has something, not much' : 'has nothing';
  });
  t.stage = 'bet';
}

function caught(w: World, t: Table) {
  const p = w.player;
  t.stage = 'done'; t.caught = true; t.youWon = false;
  t.lines.push('A card comes off the bottom and somebody sees it. The table goes quiet; then it does not.');
  addHeat(w, POKER.caught.heat, w.businesses[t.businessId].blockId);
  p.respect = clamp(p.respect + POKER.caught.respect, 0, 100);
  for (const s of t.seats) if (s.npcId) { const n = w.npcs[s.npcId]; n.rel.trust = clamp(n.rel.trust + POKER.caught.trust, -100, 100); n.rel.fear = clamp(n.rel.fear + POKER.caught.fear, 0, 100); }
  log(w, `Caught dealing from the bottom at ${w.businesses[t.businessId].name}. The pot stays on the table and you do not.`, 'bad', { businessId: t.businessId });
}

/** Whether a player calls a raise: two pair or better always; a high pair usually; air on nerve. */
function calls(rng: Rng, s: Table['seats'][number]): boolean {
  const cat = categoryOf(s.hand);
  if (cat >= 2) return true;
  if (cat === 1) { const top = [...s.hand].map(c => c % 13).sort((a, b) => b - a); const pair = top.find((r, i) => top.indexOf(r) !== i) ?? 0; return pair >= 9 || rng.chance(s.nerve / 150); }
  return rng.chance(s.nerve / 400);
}

export function bet(w: World, rng: Rng, move: 'fold' | 'call' | 'raise') {
  const t = w.table!;
  const b = w.businesses[t.businessId];
  if (move === 'fold') { t.lines.push('You fold.'); settle(w, t, false, 0); return; }
  if (move === 'raise') {
    const r = t.stake * 2;
    spend(w, r); t.net -= r; t.pot += r;
    t.lines.push(`You raise ${money(r)}.`);
    for (const s of t.seats) {
      if (calls(rng, s)) { t.pot += r; t.lines.push(`${cap1(s.name)} calls.`); }
      else { s.folded = true; t.lines.push(`${cap1(s.name)} folds.`); }
    }
    if (t.seats.every(s => s.folded)) { t.lines.push('Nobody wants to see your cards.'); settle(w, t, true, t.pot); return; }
  } else t.lines.push('You call.');
  // the showdown
  const mine = score(t.hand);
  const live = t.seats.filter(s => !s.folded);
  for (const s of live) t.lines.push(`${cap1(s.name)} shows ${describe(s.hand)}: ${s.hand.map(cardName).join(' ')}.`);
  const best = Math.max(...live.map(s => score(s.hand)));
  if (mine > best) settle(w, t, true, t.pot);
  else if (mine === best) { const share = Math.round(t.pot / (1 + live.filter(s => score(s.hand) === best).length)); t.lines.push('A split pot.'); settle(w, t, true, share); }
  else { const who = live.find(s => score(s.hand) === best)!; t.lines.push(`${cap1(who.name)} takes it.`); settle(w, t, false, 0); }
  void b;
}

function settle(w: World, t: Table, won: boolean, take: number) {
  const b = w.businesses[t.businessId];
  const rake = houseIsYours(w, b) ? 0 : Math.round(take * POKER.rake);
  const paid = take - rake;
  if (won && paid) { w.player.dirty += paid; t.net += paid; t.lines.push(`You take ${money(paid)}${rake ? ` (the house keeps ${money(rake)})` : ''}.`); }
  t.youWon = won;
  t.stage = 'done';
}

/** Another hand, if the table will have you. */
export function nextBlock(w: World): string | undefined {
  const t = w.table; if (!t || t.stage !== 'done') return 'Finish the hand.';
  if (t.caught) return 'You are not welcome at this table any more.';
  if (t.hands >= POKER.maxHands) return 'The game breaks up. It is late.';
  if (half(w) !== 'night') return 'The game broke up at dawn.';
  if (w.player.cash + w.player.dirty < t.stake * 3) return 'Not enough left to stay in.';
  return undefined;
}
export const nextHand = (w: World, rng: Rng) => deal(w, rng, w.table!);

export function leave(w: World) {
  const t = w.table!;
  const b = w.businesses[t.businessId];
  if (t.straight && !t.caught) for (const s of t.seats) if (s.npcId) { const n = w.npcs[s.npcId]; n.rel.trust = clamp(n.rel.trust + POKER.trust, -100, 100); if (!n.rel.met) n.rel.met = w.day; }
  if (t.game === 'poker') log(w, `${t.hands} hand${t.hands > 1 ? 's' : ''} at ${b.name}: ${t.net >= 0 ? `up ${money(t.net)}` : `down ${money(-t.net)}`}.`, t.net >= 0 ? 'money' : 'info', { businessId: b.id });
  t.stage = 'left';
}

// ------------------------------------------------------------------------------------------ dice
export function diceBlock(w: World, businessId: Id, stake: number): string | undefined {
  const b = w.businesses[businessId];
  if (!hasTable(w, b)) return 'Nobody is rolling here.';
  if (half(w) !== 'night') return 'The dice come out after dark.';
  if (b.blockId !== w.player.blockId) return `Go to ${w.blocks[b.blockId].name} first.`;
  if (!DICE.bets.includes(stake)) return 'Those are not the stakes.';
  if (w.player.cash + w.player.dirty < stake) return `You need ${money(stake)}.`;
  if ((w.player.dice?.day === w.day ? w.player.dice.n : 0) >= DICE.perNight) return 'The game has moved on without you.';
  if (w.table && w.table.stage !== 'left' && w.table.game === 'poker') return 'You are at the card table.';
  return undefined;
}
export function rollDice(w: World, rng: Rng, businessId: Id, stake: number) {
  const p = w.player;
  const d = () => rng.int(1, 6);
  const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const roll = () => { const a = d(), b = d(); return { a, b, t: a + b, s: `${faces[a - 1]}${faces[b - 1]} ${a + b}` }; };
  const lines: string[] = [];
  let r = roll(); let won: boolean;
  if (r.t === 7 || r.t === 11) { lines.push(`${r.s}: a natural.`); won = true; }
  else if (r.t === 2 || r.t === 3 || r.t === 12) { lines.push(`${r.s}: craps.`); won = false; }
  else {
    const point = r.t; lines.push(`${r.s}: the point is ${point}.`);
    let i = 0;
    do { r = roll(); lines.push(r.s); i++; } while (r.t !== point && r.t !== 7 && i < DICE.maxRolls);
    won = r.t === point;
    lines.push(won ? `${point} again: you make it.` : 'Seven. You are out.');
  }
  spend(w, stake);
  if (won) p.dirty += stake * 2;
  p.dice = { day: w.day, n: (p.dice?.day === w.day ? p.dice.n : 0) + 1 };
  w.table = { game: 'dice', businessId, stake, hand: [], deck: [], seats: [], pot: stake * 2, stage: 'done', lines, hands: 1, net: won ? stake : -stake, straight: true, youWon: won };
  log(w, `Dice behind ${w.businesses[businessId].name}: ${won ? `up ${money(stake)}` : `down ${money(stake)}`}.`, won ? 'money' : 'info', { businessId });
}

// --------------------------------------------------------------------------------------- numbers
/**
 * Whether you run the numbers in the city you are in. Somebody always runs a book — the first cut
 * required a numbers racket in town, and at the start of a game there are no rackets at all — but
 * a boss does not play against their own book.
 */
export const yourNumbers = (w: World) => { const here = cityOfBlock(w, w.player.blockId); return w.player.racketIds.some(id => { const r = w.rackets[id]; return r?.kind === 'numbers' && !!w.businesses[r.businessId] && cityOfBlock(w, w.businesses[r.businessId].blockId) === here; }); };
export function numbersBlock(w: World, pick: number, amount: number): string | undefined {
  if (half(w) !== 'day') return 'The runners collect slips by day.';
  if (yourNumbers(w)) return 'You run the numbers here. The house does not play its own book.';
  if (!Number.isInteger(pick) || pick < 0 || pick > 999) return 'Three digits.';
  if (!NUMBERS.bets.includes(amount)) return 'Those are not the stakes.';
  if ((w.player.slips ?? []).filter(s => s.day === w.day).length >= NUMBERS.perDay) return 'Three slips a day is plenty.';
  if (w.player.cash + w.player.dirty < amount) return `You need ${money(amount)}.`;
  return undefined;
}
export function playNumbers(w: World, pick: number, amount: number) {
  spend(w, amount);
  w.player.slips = [...(w.player.slips ?? []).filter(s => s.day >= w.day), { day: w.day, pick, amount }];
}
/** Tonight's draw: called from `endDay`. */
export function drawNumbers(w: World, day: number) {
  const slips = (w.player.slips ?? []).filter(s => s.day === day);
  // its own stream, from the seed and the day: drawn off the world's rng, one number a night shifted
  // every roll after it, and the ruthless bot — which never plays — went from no convictions in five
  // cities to two
  const drawn = new Rng(w.seed * 1000003 + day * 7919).int(0, 999);
  w.numbersDrawn = { day, n: drawn };
  if (!slips.length) return;
  const win = slips.filter(s => s.pick === drawn).reduce((t, s) => t + s.amount * NUMBERS.pays, 0);
  if (win) { w.player.dirty += win; log(w, `The number is ${pad3(drawn)}. It is yours: ${money(win)}.`, 'money'); }
  else log(w, `The number is ${pad3(drawn)}. Not yours.`, 'info');
  w.player.slips = [];
}
export const pad3 = (n: number) => String(n).padStart(3, '0');
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1);
