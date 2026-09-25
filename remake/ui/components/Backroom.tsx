/**
 * The back rooms on screen: the card table (and the last roll of the dice) as a modal the night
 * stops for, the back-room section on a bar or club's sheet, and the numbers on Empire → Money.
 * Everything here reads `World.table` and dispatches; the dealing is in `sim/backroom.ts`.
 */
import { useEffect, useState } from 'react';
import { select } from '@r/sim/index';
import { useWorld } from '../store';
import { Do, Empty, Section, fmt } from './kit';

function Card({ c, held, onClick, small }: { c: number; held?: boolean; onClick?: () => void; small?: boolean }) {
  const suit = Math.floor(c / 13);
  const red = suit === 1 || suit === 2;
  const body = <><b>{select.RANKS[c % 13]}</b><i>{select.SUITS[suit]}</i></>;
  const cls = `r-pcard${red ? ' red' : ''}${held ? ' held' : ''}${small ? ' small' : ''}`;
  return onClick
    ? <button type="button" className={cls} onClick={onClick} aria-pressed={held} aria-label={`${select.cardName(c)}${held ? ', held' : ''}`}>{body}{held && <span>Held</span>}</button>
    : <span className={cls} aria-label={select.cardName(c)}>{body}</span>;
}

export function TableCard() {
  const w = useWorld();
  const t = w.table!;
  const b = w.businesses[t.businessId];
  // what to hold: the table's own advice to start with, then yours
  // (hooks before the dice branch: a dice 'table' has no hand, and reading one crashed every boot
  // after it, because the table is saved with the world)
  const [hold, setHold] = useState<number[]>(() => (t.game === 'poker' ? select.autoHold(t.hand) : []));
  useEffect(() => { if (t.game === 'poker' && t.stage === 'draw') setHold(select.autoHold(t.hand)); }, [t.game, t.hands, t.stage, t.hand]);
  const flip = (i: number) => setHold(h => (h.includes(i) ? h.filter(x => x !== i) : [...h, i]));
  if (t.game === 'dice') {
    return (
      <div className="r-modal" role="dialog" aria-modal="true" aria-labelledby="r-table-title">
        <div className={`r-card${t.youWon ? '' : ' danger'}`}>
          <div className="r-kicker">Dice · {fmt(t.stake)} · behind {b.name}</div>
          <h2 id="r-table-title">{t.youWon ? `Up ${fmt(t.stake)}` : `Down ${fmt(t.stake)}`}</h2>
          <ol className="r-fight-lines r-dice-lines">{t.lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
          <div className="r-card-options">
            <Do action={{ type: 'dice', businessId: t.businessId, stake: t.stake }} label={`Roll again · ${fmt(t.stake)}`} kind="primary" block />
            <Do action={{ type: 'table_leave' }} label="Walk away" kind="ghost" block />
          </div>
        </div>
      </div>
    );
  }
  const need = 5 - hold.length;
  return (
    <div className="r-modal" role="dialog" aria-modal="true" aria-labelledby="r-table-title">
      <div className={`r-card${t.caught ? ' danger' : ''}`}>
        <div className="r-kicker">Five-card draw · {fmt(t.stake)} a hand · hand {t.hands} of {select.POKER.maxHands} · {t.net >= 0 ? `up ${fmt(t.net)}` : `down ${fmt(-t.net)}`}</div>
        <h2 id="r-table-title">{b.name}, the back room</h2>
        <div className="r-seats">
          {t.seats.map((s, i) => (
            <div key={i} className={`r-seat${s.folded ? ' out' : ''}`}>
              <span className="r-seat-name">{s.name}</span>
              <span className="r-seat-read">{s.folded ? 'folded' : t.stage === 'done' && !t.caught ? select.describeHand(s.hand) : t.reads?.[i] ?? 'waiting on the draw'}</span>
              {t.stage === 'done' && !s.folded && !t.caught && <span className="r-cards small">{s.hand.map(c => <Card key={c} c={c} small />)}</span>}
            </div>
          ))}
        </div>
        <div className="r-pot">Pot <b>{fmt(t.pot)}</b></div>
        <div className="r-cards">{t.hand.map((c, i) => <Card key={c} c={c} held={t.stage === 'draw' && hold.includes(i)} onClick={t.stage === 'draw' ? () => flip(i) : undefined} />)}</div>
        <p className="r-note">{t.stage === 'draw' ? `You hold ${select.describeHand(t.hand)}. Tap the cards to keep.` : `You have ${select.describeHand(t.hand)}.`}</p>
        <ol className="r-fight-lines">{t.lines.slice(-6).map((l, i) => <li key={i}>{l}</li>)}</ol>
        <div className="r-card-options">
          {t.stage === 'draw' && <>
            <Do action={{ type: 'poker_draw', hold }} label={need ? `Draw ${need}` : 'Stand pat'} kind="primary" block />
            <Do action={{ type: 'poker_draw', hold, cheat: true }} label={`${need ? `Draw ${need}` : 'Swap one'} from the bottom`} kind="danger" block sub={`${Math.round(select.cheatChance(w) * 100)}% somebody sees it. Tech and brains lower it.`} />
          </>}
          {t.stage === 'bet' && <>
            <Do action={{ type: 'poker_bet', move: 'raise' }} label={`Raise ${fmt(t.stake * 2)}`} kind="primary" block />
            <Do action={{ type: 'poker_bet', move: 'call' }} label="Call: show them" block />
            <Do action={{ type: 'poker_bet', move: 'fold' }} label="Fold" kind="ghost" block />
          </>}
          {t.stage === 'done' && <>
            <Do action={{ type: 'table_next' }} label={`Deal me in · ${fmt(t.stake)}`} kind="primary" block />
            <Do action={{ type: 'table_leave' }} label={t.net >= 0 ? 'Cash out' : 'Get up from the table'} kind="ghost" block />
          </>}
        </div>
      </div>
    </div>
  );
}

/** A bar or club's back room, from its sheet: a seat at the table, or the dice. */
export function BackroomSection({ id }: { id: string }) {
  const w = useWorld();
  const b = w.businesses[id];
  if (!select.hasTable(w, b)) return null;
  if (!select.isNight(w)) return <Section title="The back room"><Empty>There is a game here after dark: cards, and dice in the alley.</Empty></Section>;
  return (
    <Section title="The back room" right={<span className="r-note">{Math.round(select.readChance(w) * 100)}% to read a player</span>}>
      <div className="r-inline-actions">{select.POKER.stakes.map(s => <Do key={s} action={{ type: 'table_sit', businessId: id, stake: s }} label={`Cards · ${fmt(s)}`} small />)}</div>
      <div className="r-inline-actions">{select.DICE.bets.map(s => <Do key={s} action={{ type: 'dice', businessId: id, stake: s }} label={`Dice · ${fmt(s)}`} small kind="ghost" />)}</div>
      <p className="r-note">Five-card draw against the regulars: an hour to sit, then as many hands as the night and your money allow. {b.ownedBy === 'player' ? 'The house is yours: no cut.' : `The house takes ${Math.round(select.POKER.rake * 100)}% of every pot.`}</p>
    </Section>
  );
}

/** The numbers: three digits a slip, by day, drawn overnight. */
export function NumbersSection() {
  const w = useWorld();
  const [pick, setPick] = useState(() => (w.day * 37 + 111) % 1000);
  const slips = (w.player.slips ?? []).filter(s => s.day === w.day);
  return (
    <Section title="The numbers" right={w.numbersDrawn ? <span className="r-note">Last night: {select.pad3(w.numbersDrawn.n)}</span> : undefined}>
      <label className="r-numbers">Your number <input inputMode="numeric" pattern="[0-9]*" maxLength={3} value={select.pad3(pick)} onChange={e => { const n = Number(e.target.value.replace(/\D/g, '').slice(-3)); if (Number.isFinite(n)) setPick(n); }} aria-label="Three digits" /></label>
      <div className="r-inline-actions">{select.NUMBERS.bets.map(a => <Do key={a} action={{ type: 'numbers', pick, amount: a }} label={`Play ${select.pad3(pick)} · ${fmt(a)}`} small />)}</div>
      <p className="r-note">{slips.length ? `Today: ${slips.map(s => `${select.pad3(s.pick)} for ${fmt(s.amount)}`).join(', ')}. ` : ''}Drawn overnight; pays {select.NUMBERS.pays} to 1. The odds are a thousand to one, which is why somebody runs it as a racket.</p>
    </Section>
  );
}
