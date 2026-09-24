/**
 * Cars on screen: what is parked on a block tonight (from the block's sheet), and the garage — what
 * you have taken, how hot it still is, and what to do with it (Empire → Holdings).
 */
import { select } from '@r/sim/index';
import { Icon } from '@ui/icons';
import { useWorld } from '../store';
import { Chip, Do, Empty, Row, Section, fmt } from './kit';

export function ParkedSection({ blockId }: { blockId: string }) {
  const w = useWorld();
  if (!select.isNight(w)) return null;
  const m = select.parkedOn(w, blockId);
  if (!m) return null;
  const car = select.MODELS[m];
  const room = select.garageRoom(w) - (w.player.garage ?? []).length;
  return (
    <Section title="Parked tonight" right={<span className="r-note">garage {room > 0 ? `${room} free` : 'full'}</span>}>
      <Row left={<Icon name="sedan" />} title={car.label} sub={`Worth ${fmt(car.value)} whole · ${fmt(Math.round(car.value * (select.chopper(w)?.rate ?? select.CHOP.fence)))} in parts`} right={<span className={`r-odds ${select.stealOdds(w, blockId) >= 65 ? 'good' : select.stealOdds(w, blockId) >= 40 ? 'mid' : 'bad'}`}>{select.stealOdds(w, blockId)}%</span>} />
      <Do action={{ type: 'steal_car', blockId }} label="Take it" icon="lockpicks" block sub={`An hour. Wheels and tech help; the precinct does not. Hot for ${select.STEAL.hotDays} days once it is yours.`} />
    </Section>
  );
}

export function GarageSection() {
  const w = useWorld();
  const cars = w.player.garage ?? [];
  const ch = select.chopper(w);
  return (
    <Section title="The garage" right={<span className="r-note">{cars.length}/{select.garageRoom(w)}</span>}>
      {!cars.length && <Empty>Nothing in it. After dark, every block has something parked worth taking: look on the block's sheet.</Empty>}
      {cars.map(c => {
        const m = select.MODELS[c.model];
        return (
          <div key={c.id} className="r-racket">
            <Row left={<Icon name="sedan" />} title={m.label} sub={`Worth ${fmt(m.value)} · taken day ${c.day}`} right={c.hot ? <Chip tone="red">Hot {c.hot}d</Chip> : c.plates ? <Chip tone="green">New plates</Chip> : <Chip tone="muted">Cooled</Chip>} />
            <div className="r-inline-actions">
              <Do action={{ type: 'car', carId: c.id, what: 'chop' }} label={ch ? `Chop · ${fmt(select.chopValue(w, c))}` : 'Chop'} small />
              {!c.plates && <Do action={{ type: 'car', carId: c.id, what: 'respray' }} label={`Respray · ${fmt(select.RESPRAY.cost)}`} small kind="ghost" />}
              {c.plates && <Do action={{ type: 'car', carId: c.id, what: 'keep' }} label="Keep as kit" small />}
              {c.plates && <Do action={{ type: 'car', carId: c.id, what: 'sell' }} label={`Sell · ${fmt(select.sellValue(c))} clean`} small kind="ghost" />}
            </div>
          </div>
        );
      })}
      <p className="r-note">{ch ? `${ch.where} takes them apart at ${Math.round(ch.rate * 100)}% of the value, dirty.` : 'Nobody in this city chops cars for you yet: a scrapyard will, at a fence’s rate, or run your own chop shop.'} A garage you own or protect resprays them; a resprayed car can go to your people as kit, or to a dealer for clean money. Each hot car costs a little heat a day.</p>
    </Section>
  );
}
