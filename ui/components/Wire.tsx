import { useState } from 'react';
import { select } from '@sim/index';
import type { Card, Secret } from '@sim/types';
import { CARD_TIERS } from '@content/cyber';
import { fmtMoney } from '@ui/derive';
import { openSheet, useWorld } from '@ui/store';
import { Act, Section } from './Act';
import { Info, Term } from './Info';
import { Icon } from '@ui/icons';

/**
 * The wire: the cards you are holding, what listening turned up, and the way to clean up after
 * both. Everything here is the state in `sim/cyber.ts` — a tier, a balance, a freshness clock.
 */
export function WireSection() {
  const w = useWorld();
  const cards = select.cards(w);
  const secrets = select.secrets(w);
  const cyberHeat = Math.round(w.player.cyberHeat ?? 0);
  if (!cards.length && !secrets.length && !cyberHeat) return null;
  return (
    <Section id="wire" title="The wire" count={cards.length + secrets.length} info={<Info id="wire" />}>
      {cards.length > 0 && <Cards cards={cards} />}
      {secrets.length > 0 && <Secrets secrets={secrets} />}
      {cyberHeat > 0 && <Scrub />}
    </Section>
  );
}

function Cards({ cards }: { cards: Card[] }) {
  const w = useWorld();
  const dumpTo = select.playerRacketsOfKind(w, 'carding')[0];
  const dumpValue = select.dumpValue(w);
  return (
    <>
      <div className="row between">
        <span className="small muted">{cards.length} card{cards.length === 1 ? '' : 's'} · freshness falls every day<Info id="card" /></span>
        {dumpTo && <span className="row"><Act action={{ type: 'dump_cards', racketId: dumpTo.id }} label={`Dump the lot · ${fmtMoney(dumpValue)}`} small kind="ghost" /><Info id="cardDump" /></span>}
      </div>
      <div className="col mt8" style={{ gap: 6 }}>
        {cards.map(c => <CardRow key={c.id} card={c} />)}
      </div>
      {!dumpTo && <p className="tiny muted mt8">A carding racket of your own would take the whole pile wholesale, with no exposure at all.</p>}
    </>
  );
}

function CardRow({ card }: { card: Card }) {
  const w = useWorld();
  const def = CARD_TIERS[card.tier];
  const small = select.runOdds(w, card, 'small');
  const big = select.runOdds(w, card, 'big');
  const [open, setOpen] = useState(false);
  return (
    <div className={`listitem${card.flagged ? ' sel' : ''}`} style={{ alignItems: 'flex-start', borderColor: card.flagged ? 'var(--red)' : undefined }}>
      <span className="ico"><Icon name="carding" size={18} /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="title ellipsis">{def.label} {card.flagged && <span className="red small">· watched</span>}</div>
        <div className="sub ellipsis">{fmtMoney(card.limit)} left · freshness {Math.round(card.freshness)}</div>
        {open && (
          <div className="col mt8" style={{ gap: 6 }}>
            <Act action={{ type: 'run_card', cardId: card.id, mode: 'small' }} label={`Quiet run · ${fmtMoney(small.take)}`} small block />
            <span className="tiny muted">{Math.round(small.dead * 100)}% it dies · {Math.round(small.flag * 100)}% somebody notices</span>
            <Act action={{ type: 'run_card', cardId: card.id, mode: 'big' }} label={`One big score · ${fmtMoney(big.take)}`} small kind="danger" block />
            <span className="tiny muted">{Math.round(big.dead * 100)}% it dies · {Math.round(big.flag * 100)}% somebody notices</span>
          </div>
        )}
      </div>
      <span className="row" style={{ gap: 2 }}><button type="button" className="chip btn" onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Run'}</button>{open && <Info id="cardRun" />}</span>
    </div>
  );
}

function Secrets({ secrets }: { secrets: Secret[] }) {
  const w = useWorld();
  const [pick, setPick] = useState<string | null>(null);
  return (
    <>
      <div className="section-title">What you know<Info id="dirt" /></div>
      <div className="col" style={{ gap: 6 }}>
        {secrets.map(s => {
          const subject = w.npcs[s.npcId];
          const buyers = Object.values(w.factions).filter(f => f.alive && f.id !== subject?.faction && select.stanceWithPlayer(w, f.id) !== 'war');
          return (
            <div key={s.id} className="listitem" style={{ alignItems: 'flex-start' }}>
              <span className="ico"><Icon name="note" size={18} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="sub" style={{ whiteSpace: 'normal' }}>{s.text}</div>
                {s.soldTo
                  ? <div className="tiny muted mt8">Sold to {select.factionName(w, s.soldTo)}.</div>
                  : pick === s.id && (
                    <div className="col mt8" style={{ gap: 6 }}>
                      {buyers.map(f => (
                        <Act key={f.id} action={{ type: 'sell_dirt', secretId: s.id, factionId: f.id }} label={`Sell to ${f.short} · ${fmtMoney(select.dirtPrice(w, s, f.id))}`} small block />
                      ))}
                      {!buyers.length && <span className="tiny muted">Nobody is in a position to buy this right now.</span>}
                      {subject && <button type="button" className="chip btn" onClick={() => openSheet({ kind: 'npc', npcId: subject.id })}>Open {subject.name.split(' ')[0]}</button>}
                    </div>
                  )}
              </div>
              {!s.soldTo && <button type="button" className="chip btn" onClick={() => setPick(p => (p === s.id ? null : s.id))}>{pick === s.id ? 'Close' : 'Sell'}</button>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Scrub() {
  const w = useWorld();
  const { points, cost } = select.scrubPower(w);
  return (
    <div className="card mt8">
      <div className="row between">
        <b className="small"><Icon name="scrub" size={13} /> Scrub your trail<Info id="scrub" /></b>
        <span className="chip">{Math.round(w.player.cyberHeat ?? 0)} of your <Term id="heat">heat</Term> came off the wire</span>
      </div>
      <p className="small muted mt8" style={{ margin: '8px 0 0' }}>
        Paper into a furnace, a name off two lists. Tech and brains decide how much goes at once — and this only ever touches
        what the wire made, never the heat you earned in person.
      </p>
      <div className="mt8">
        <Act action={{ type: 'scrub_trail' }} label={`Clean up ${points} heat · ${fmtMoney(cost)}`} kind="primary" block />
      </div>
    </div>
  );
}
