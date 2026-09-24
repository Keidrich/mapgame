/**
 * The region map: the cities down the road, the roads between them, what each pays for what you
 * make, and the trains and standing orders between the ones you have been to. Every number is the
 * sim's own (`region.ts`): the fare on the button is the fare charged, the price on a route is what
 * one lot fetches at the far end after freight.
 */
import { useState } from 'react';
import { PRODUCTS } from '@r/content/world';
import { select } from '@r/sim/index';
import type { Product, RegionCity } from '@r/sim/types';
import { Icon } from '@ui/icons';
import { useWorld } from '../store';
import { Chip, Do, Empty, Meter, Row, Section, Sheet, fmt } from './kit';

const R = { small: 16, medium: 22, large: 29 } as const;
const GOLD = '#f0a841', BLUE = '#5aa7e6', DIM = '#59606d';

export function RegionSheet() {
  const w = useWorld();
  const region = w.region;
  const here = select.currentCity(w);
  const [sel, setSel] = useState(here);
  if (!region) return <Sheet title="The region"><Empty>No region yet.</Empty></Sheet>;
  const cities = region.cities;
  const byId = Object.fromEntries(cities.map(c => [c.id, c])) as Record<string, RegionCity>;
  const status = (c: RegionCity) => (c.id === here ? 'here' : c.founded ? 'yours' : c.open ? 'open' : 'closed');
  const colour = (c: RegionCity) => (c.founded ? GOLD : c.open ? BLUE : DIM);
  const cur = byId[here];
  const share = select.controlIn(w, here);
  const c = byId[sel] ?? cur;
  return (
    <Sheet title="The region" kicker={`${cities.filter(x => x.founded).length} of ${cities.length} cities yours to walk`}>
      <div className="r-region-map">
        <svg viewBox="0 0 1000 700" role="img" aria-label="Region map">
          {cities.flatMap(a => a.links.filter(id => id > a.id).map(id => { const b = byId[id]; const lit = (a.founded || a.open) && (b.founded || b.open); return <line key={`${a.id}-${id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit ? '#8a7a5a' : '#3a3f4a'} strokeWidth={lit ? 5 : 3} strokeDasharray={lit ? undefined : '10 10'} />; }))}
          {(w.routes ?? []).map(r => { const a = byId[r.from], b = byId[r.to]; return a && b ? <line key={r.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={GOLD} strokeWidth={2} strokeDasharray="4 8" /> : null; })}
          {cities.map(x => (
            <g key={x.id} onClick={() => setSel(x.id)} style={{ cursor: 'pointer' }} role="button" aria-label={x.name}>
              {x.id === here && <circle cx={x.x} cy={x.y} r={R[x.size] + 9} fill="none" stroke={GOLD} strokeWidth={3} />}
              <circle cx={x.x} cy={x.y} r={R[x.size]} fill={colour(x)} fillOpacity={x.founded ? 0.9 : 0.35} stroke={sel === x.id ? '#f4efe6' : colour(x)} strokeWidth={sel === x.id ? 4 : 2} />
              <text x={x.x} y={x.y + R[x.size] + 30} textAnchor="middle" fill="#e8e2d6" fontSize="26" fontWeight={600}>{x.name}</text>
              {x.founded && <text x={x.x} y={x.y + 9} textAnchor="middle" fill="#11141b" fontSize="22" fontWeight={700}>{Math.round(select.controlIn(w, x.id) * 100)}%</text>}
            </g>
          ))}
        </svg>
      </div>
      <Meter value={share * 100} label={`Your share of ${cur.name}`} right={`${(share * 100).toFixed(1)}%${cur.reached ? ' — the road is open' : ` — ${Math.round(select.REGION.unlockAt * 100)}% opens the road`}`} />

      <Section title={c.name} right={<Chip tone={c.founded ? 'gold' : c.open ? 'blue' : 'muted'}>{status(c) === 'here' ? 'You are here' : status(c) === 'yours' ? 'Been there' : status(c) === 'open' ? 'Road open' : 'Nobody knows you'}</Chip>}>
        <p className="r-note">{c.kind === 'home' ? 'Where you started.' : `A ${c.size === 'large' ? 'big' : c.size === 'small' ? 'small' : ''} ${c.kind}. ${c.blurb}`}</p>
        <div className="r-chips">{(Object.keys(PRODUCTS) as Product[]).map(p => { const d = c.demand[p]; return <Chip key={p} tone={d >= 1.15 ? 'green' : d <= 0.9 ? 'red' : 'muted'} title="What it pays against the street's ordinary price">{PRODUCTS[p].label} ×{d.toFixed(2)}</Chip>; })}</div>
        {c.founded && c.id !== here && <p className="r-note">You hold {(select.controlIn(w, c.id) * 100).toFixed(1)}% of it.</p>}
        {c.id !== here && <Do action={{ type: 'travel_city', cityId: c.id }} label={c.founded ? `Take the train to ${c.name}` : `Start up in ${c.name}`} icon="van" block
          sub={c.founded ? 'Everybody who works for you comes along; your rackets and places here keep running.' : 'A new city, generated the day you arrive: its own streets, people and outfits. You arrive with everything you carry and everybody who works for you, and nobody knows your name.'} />}
        {!c.founded && !c.open && <p className="r-why">Hold {Math.round(select.REGION.unlockAt * 100)}% of a city on the road to it ({c.links.map(id => byId[id].name).join(', ')}).</p>}
      </Section>

      <Section title="Trade routes">
        <p className="r-note">A standing order sells up to {select.REGION.routePerDay} lots a night from your stash on the streets of another city you have been to, at its price less {Math.round((1 - select.REGION.routeKeep) * 100)}% freight. It needs a back room at both ends. Now and then a load is stopped on the road.</p>
        {(w.routes ?? []).length ? (w.routes ?? []).map(r => <Row key={r.id} left={<Icon name="van" />} title={`${PRODUCTS[r.product].label}: ${byId[r.from]?.name} → ${byId[r.to]?.name}`} sub={`${fmt(select.routePrice(w, r))} a lot at the far end · ${r.moved ?? 0} lots moved since day ${r.since}`} right={<Do action={{ type: 'close_route', id: r.id }} label="Close" small kind="ghost" />} />) : <Empty>No routes yet.</Empty>}
        {cities.filter(x => x.founded).length > 1 && cities.filter(x => x.founded).map(x => {
          const from = cities.find(y => y.founded && y.id !== x.id && select.safehouseIn(w, y.id)) ?? cities.find(y => y.founded && y.id !== x.id)!;
          return (
            <div key={x.id} className="r-racket">
              <p className="r-over">Sell in {x.name} (loaded in {from.name})</p>
              <div className="r-inline-actions">{(Object.keys(PRODUCTS) as Product[]).map(p => <Do key={p} action={{ type: 'open_route', from: from.id, to: x.id, product: p }} label={`${PRODUCTS[p].label} (${fmt(select.routePrice(w, { to: x.id, product: p }))}/lot)`} small />)}</div>
            </div>
          );
        })}
      </Section>
      <p className="r-note">Jobs from the other cities you have been to come onto your board. You can run one from here: your people go without you, and your own skills do not count.</p>
    </Sheet>
  );
}
