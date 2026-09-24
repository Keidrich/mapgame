import { BUSINESSES, LABS, RACKETS, SAFEHOUSE_TIERS } from '@r/content/world';
import { select, PLAYER } from '@r/sim/index';
import type { LabKind, Product, RacketKind, Skill } from '@r/sim/types';
import { Icon } from '@ui/icons';
import { openSheet, useWorld } from '../store';
import { Emblem, NpcFace } from './Faces';
import { Chip, Do, Empty, Meter, Row, Section, Sheet, fmt } from './kit';
import { SETPIECE_RANK, setpieceFor } from '@r/content/setpieces';
import { ShopSection } from './Armoury';
import { CaseSection } from './JobFaction';
import { HostageList } from './Hostages';
import { BackroomSection } from './Backroom';
import { ParkedSection } from './Cars';

export function BlockSheet({ id }: { id: string }) {
  const w = useWorld();
  const b = w.blocks[id];
  const d = w.districts[b.districtId];
  const here = w.player.blockId === id;
  const holder = select.blockController(w, id);
  const inf = Object.entries(b.influence).sort((a, c) => c[1] - a[1]).slice(0, 4);
  const depth = select.depth(w, id);
  const biz = select.businessesIn(w, id);
  const people = select.peopleOn(w, id).filter(n => !n.workId || w.businesses[n.workId]?.ownerId !== n.id).slice(0, 12);
  const safe = b.safehouseId ? w.safehouses[b.safehouseId] : undefined;
  return (
    <Sheet title={b.name} kicker={`${d.name} · ${d.kind === 'oldtown' ? 'Old Quarter' : d.kind[0].toUpperCase() + d.kind.slice(1)}${b.landmark ? ` · ${b.landmark}` : ''}`}>
      <div className="r-chips">
        {here ? <Chip tone="green">You are here</Chip> : null}
        <Chip tone={holder === PLAYER ? 'gold' : holder ? 'red' : 'muted'}>{select.holderName(w, id)}</Chip>
        {b.waterfront && <Chip tone="blue">Waterfront</Chip>}
        {select.isParkBlock(b) && <Chip tone="green">Nothing to protect — held by holding the ground around it</Chip>}
      </div>
      {!here && <Do action={{ type: 'travel', blockId: id }} label={select.travelCost(w, id) ? 'Take a cab here' : 'Walk here'} icon="legwork" block sub={select.travelCost(w, id) ? undefined : 'Free: next door, or through ground you hold.'} />}
      <Section title="Who holds it">
        {inf.length ? inf.map(([k, v]) => {
          const f = w.factions[k];
          return <Meter key={k} value={v} tone={k === PLAYER ? 'gold' : 'red'} label={k === PLAYER ? 'You' : f ? <span className="r-inline"><Emblem e={f.emblem} size={14} /> {f.short}</span> : k} />;
        }) : <Empty>Nobody has a hold here yet.</Empty>}
        <p className="r-note">Control is the most influence, and at least 30 of it. {depth > 0 ? `You have ${depth} thing${depth > 1 ? 's' : ''} going here: influence builds ×${select.accrualMult(w, id).toFixed(2)} a day${depth >= 2 && holder === PLAYER ? ', and it bleeds into the blocks around it' : ''}.` : 'Protect or own a place here to start building influence.'}</p>
      </Section>
      <div className="r-stats">
        <div><span>Wealth</span><b>{b.wealth}</b></div>
        <div><span>Police</span><b>{Math.round(d.attention)}</b></div>
        <div><span>Your heat here</span><b>{Math.round(b.heat)}</b></div>
        <div><span>People</span><b>{b.population}</b></div>
      </div>
      {(() => { const c = select.crewOn(w, id); if (!c) return null; const boss = w.npcs[c.bossId]; return (
        <Section title="On the corner">
          <Row onClick={() => openSheet({ kind: 'person', id: c.bossId })} left={boss ? <NpcFace n={boss} size={40} /> : undefined} title={`The ${c.name}`} sub={`${c.members} of them · run by ${boss ? select.fullName(boss) : 'nobody'} · ${c.terms === 'none' ? `nobody's — they skim ${Math.round(select.CREW.skim * 100)}% of what you take here, and they are growing` : c.terms === 'paid' ? `on your wage, ${fmt(c.wage)}/day` : `yours, ${fmt(c.wage)}/day`}`} right={<Chip tone={c.terms === 'none' ? 'red' : 'gold'}>{c.terms === 'none' ? `${c.members}/${select.CREW.outfitAt}` : c.terms}</Chip>} />
          {c.terms === 'none' && <p className="r-note">Left alone, a crew that reaches {select.CREW.outfitAt} becomes an outfit. Talk to the boss: pay them, take them in, or run them off.</p>}
        </Section>
      ); })()}
      {(() => { const sp = setpieceFor(b.landmark); if (!sp) return null; const ready = select.notoriety(w) >= SETPIECE_RANK; return (
        <Section title={`The job ${b.landmark} is for`}>
          {b.hitDay !== undefined && <p className="r-callout dark">Hit on day {b.hitDay}. {w.day - b.hitDay < select.SETPIECE_REST ? `Shut to you until day ${b.hitDay + select.SETPIECE_REST}.` : 'Open again'} — {b.hardened ?? 0} points harder than it was.</p>}
          <p className="r-note">{sp.pitch.replace(/\{L\}/g, b.landmark!)} {sp.stages} stages, a decision at each. {ready ? '' : `Nobody brings a job like this to somebody the street does not know yet: fear and respect of ${SETPIECE_RANK} between them (you have ${select.notoriety(w)}).`}</p>
          <Do action={{ type: 'case', kind: 'setpiece', blockId: id }} label={`Case ${b.landmark}`} icon="crown" block sub="A day around the place. The job goes on your board with a head start on the planning." />
        </Section>
      ); })()}
      <TakeItToThem blockId={id} />
      <ParkedSection blockId={id} />
      <CaseSection target={{ blockId: id }} only={k => select.jobTarget(k) !== 'none'} title="Work these streets" note={`Jobs on ${b.name} itself, and across ${d.name}.`} />
      <Section title="Places">
        {biz.length ? biz.map(x => <BizRow key={x.id} id={x.id} />) : <Empty>No businesses on this block.</Empty>}
      </Section>
      <Section title="Your place here">
        {safe ? <SafehousePanel id={safe.id} /> : <Do action={{ type: 'rent_safehouse', blockId: id }} label="Take a back room here" icon="safehouse" block sub="Three more beds for crew, room for stock, and space for a lab." />}
      </Section>
      {people.length > 0 && <Section title="Around the block">{people.map(n => <Row key={n.id} onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={32} />} title={select.fullName(n)} sub={n.rel.met ? `trust ${n.rel.trust} · fear ${n.rel.fear}` : 'A stranger'} />)}</Section>}
    </Sheet>
  );
}

export function BizRow({ id }: { id: string }) {
  const w = useWorld();
  const x = w.businesses[id];
  const o = w.npcs[x.ownerId];
  const by = x.ownedBy === PLAYER ? 'Yours' : x.protection?.by === PLAYER ? `Pays you ${Math.round(x.protection.rate * 100)}%` : x.protection ? `Pays ${w.factions[x.protection.by]?.short ?? 'someone'}` : 'Pays nobody';
  return <Row onClick={() => openSheet({ kind: 'business', id })} left={<span className={`r-bizicon tier${x.tier}${x.ownedBy === PLAYER || x.protection?.by === PLAYER ? ' mine' : ''}`}><Icon of="business" id={x.type} size={20} /></span>} title={x.name} sub={`${BUSINESSES[x.type].label} · ${fmt(x.income)}/day · ${by}${x.closed ? ` · shut ${x.closed}d` : ''}`} right={o ? <NpcFace n={o} size={30} /> : undefined} />;
}

export function BusinessSheet({ id }: { id: string }) {
  const w = useWorld();
  const b = w.businesses[id];
  const def = BUSINESSES[b.type];
  const o = w.npcs[b.ownerId];
  const mine = b.ownedBy === PLAYER, protectedByMe = b.protection?.by === PLAYER;
  const fac = b.protection && b.protection.by !== PLAYER ? w.factions[b.protection.by] : undefined;
  const rackets = b.racketIds.map(r => w.rackets[r]).filter(Boolean);
  return (
    <Sheet title={b.name} kicker={`${def.label} · ${b.tier === 3 ? 'Institution' : b.tier === 2 ? 'Established' : 'Street'} · ${w.blocks[b.blockId].name}`} art={<span className={`r-bizicon big tier${b.tier}${mine || protectedByMe ? ' mine' : ''}`}><Icon of="business" id={b.type} size={30} /></span>}>
      <div className="r-stats">
        <div><span>Takings</span><b>{fmt(b.income)}/day</b></div>
        <div><span>Security</span><b>{b.security}</b></div>
        <div><span>In the till</span><b>{fmt(b.till)}</b></div>
        <div><span>Price</span><b>{fmt(select.businessPrice(w, b))}</b></div>
      </div>
      <div className="r-chips">
        {mine && <Chip tone="gold">Yours · {fmt(Math.round(b.income * 0.45))} clean a day</Chip>}
        {protectedByMe && <Chip tone="gold">Pays you {fmt(select.protectionTake(b))} a day ({Math.round(b.protection!.rate * 100)}%)</Chip>}
        {fac && <Chip tone="red"><Emblem e={fac.emblem} size={12} /> Pays the {fac.short}</Chip>}
        {b.closed > 0 && <Chip tone="red">Shut {b.closed} days</Chip>}
      </div>
      {protectedByMe && (
        <div className="r-inline-actions">
          {[0.1, 0.12, 0.15, 0.2].map(r => <Do key={r} action={{ type: 'set_rate', businessId: id, rate: r }} label={`${Math.round(r * 100)}%`} small />)}
          <Do action={{ type: 'drop_protection', businessId: id }} label="Let them go" small kind="ghost" />
        </div>
      )}
      {o && <Section title="Owner"><Row onClick={() => openSheet({ kind: 'person', id: o.id })} left={<NpcFace n={o} size={40} />} title={select.fullName(o)} sub={o.rel.met ? `Trust ${o.rel.trust} · fear ${o.rel.fear}${o.known ? ` · nerve ${o.nerve}` : ''}` : 'You have never spoken'} right={<Icon name="caret" size={16} />} /></Section>}
      <Section title="Rackets" right={<span className="r-note">{rackets.filter(r => r.owner === PLAYER).length}/{(b.tier === 3 ? 0 : b.tier) + (mine ? 1 : 0)} slots</span>}>
        {rackets.map(r => <RacketRow key={r.id} id={r.id} />)}
        {(mine || protectedByMe) && def.rackets.filter(k => !rackets.some(r => r.kind === k)).map(k => (
          <Do key={k} action={{ type: 'start_racket', businessId: id, kind: k as RacketKind }} label={`Start ${RACKETS[k].label}`} icon={k} sub={select.racketWarning(w, k as RacketKind) ?? `${RACKETS[k].blurb}${RACKETS[k].base ? ` About ${fmt(RACKETS[k].base * (0.55 + w.blocks[b.blockId].wealth / 100))} a day before a runner.` : ''}`} />
        ))}
        {!mine && !protectedByMe && !rackets.length && <Empty>{def.rackets.length ? 'Protect or own it to run something out of the back.' : 'Nothing runs out of a place like this. It is a job, not a racket.'}</Empty>}
      </Section>
      <SupplySection id={id} />
      <TrainSection id={id} />
      <BackroomSection id={id} />
      {b.closed <= 0 && <ShopSection at={id} title={w.player.blockId === b.blockId ? 'For sale here' : `For sale here — go to ${w.blocks[b.blockId].name}`} />}
      <CaseSection target={{ businessId: id }} title={mine ? 'Work it' : 'Case it'} note={mine ? 'Jobs you can only run through a place you own.' : undefined} />
      {b.patronIds.length > 0 && <Section title="Regulars">{b.patronIds.map(pid => { const n = w.npcs[pid]; return n ? <Row key={pid} onClick={() => openSheet({ kind: 'person', id: pid })} left={<NpcFace n={n} size={32} />} title={select.fullName(n)} sub={n.crew ? 'Yours' : n.rel.met ? `trust ${n.rel.trust}` : n.alive ? 'A stranger' : 'Dead'} /> : null; })}</Section>}
    </Sheet>
  );
}

/**
 * The back door: which of your products this place takes by the case, how much a night, at what
 * price, and whether a driver is bringing it. Only for the kinds of place that sell what you make.
 */
function SupplySection({ id }: { id: string }) {
  const w = useWorld();
  const b = w.businesses[id];
  const wants = select.OUTLETS[b.type]; if (!wants) return null;
  const prods = Object.keys(wants) as Product[];
  const on = b.outlet ?? [];
  if (!select.canBeOutlet(b)) return <Section title="Supply"><Empty>A {BUSINESSES[b.type].label.toLowerCase()} takes {prods.join(' and ')} by the case. Protect it or own it and it will take yours.</Empty></Section>;
  const city = select.blockCity(w, b.blockId);
  const driving = select.drivers(w).filter(d => d.city === city);
  const got = b.supplied?.day === w.day - 1 || b.supplied?.day === w.day ? b.supplied.n : 0;
  return (
    <Section title="Supply" right={on.length ? <span className="r-note">{got ? `${got} lots last night` : 'nothing last night'}</span> : undefined}>
      {prods.map(k => {
        const has = on.includes(k);
        const next = has ? on.filter(x => x !== k) : [...on, k];
        return <Row key={k} left={<Icon name={k} />} title={`${k[0].toUpperCase()}${k.slice(1)}: ${select.outletDemand(w, b, k)} a night`} sub={`${fmt(select.outletPrice(w, b, k))} a lot against ${fmt(select.streetPrice(w, k, b.blockId))} on the street · you hold ${w.player.stash[k].n}`}
          right={<Do action={{ type: 'set_outlet', businessId: id, products: next }} label={has ? 'Stop' : 'Supply'} small kind={has ? 'ghost' : 'primary'} />} />;
      })}
      {on.length > 0 && !driving.length && <p className="r-why">Nobody drives here. Give one of your crew in this city the deliveries from their sheet, or drive the round yourself after dark.</p>}
      {on.length > 0 && <DriveRound />}
      {on.length > 0 && driving.length > 0 && <p className="r-note">{driving.map(d => select.fullName(d.n)).join(', ')} {driving.length > 1 ? 'drive' : 'drives'} here: {driving.reduce((t, d) => t + d.carry, 0)} lots a night between every place in the city. {Math.round(select.hijackChance(w, false) * 100)}% a load is taken on the road; half that with a gun in the car.</p>}
    </Section>
  );
}

/**
 * What you can do for yourself here: train the skill this kind of place teaches, and buy what it
 * sells to get you through the day.
 */
function TrainSection({ id }: { id: string }) {
  const w = useWorld();
  const b = w.businesses[id];
  const skills = (Object.keys(select.TRAINING) as Skill[]).filter(s => { const at = select.TRAINING[s].at; return at !== 'books' && at.includes(b.type); });
  const boosts = (Object.keys(select.BOOSTS) as ('pep' | 'nerve')[]).filter(k => select.BOOSTS[k].at.includes(b.type));
  if (!skills.length && !boosts.length) return null;
  const fee = select.trainFee(w, id);
  return (
    <Section title="For yourself">
      {skills.map(s => { const t = select.TRAINING[s]; return <Do key={s} action={{ type: 'train', skill: s, at: id }} label={`${t.verb}: ${s} +${select.trainXp(w, id)}`} icon="fist" block sub={`${t.blurb} ${select.TRAIN.ap} hours${fee ? `, ${fmt(fee)}` : ', free at your place'}; ${t.half === 'day' ? 'by day' : 'after dark'}, once a day.${select.streakNow(w) > 1 ? ` ${select.streakNow(w)} days running.` : ''}`} />; })}
      {boosts.map(k => <Do key={k} action={{ type: 'take_boost', kind: k, at: id }} label={`${select.BOOSTS[k].label} · ${fmt(select.BOOSTS[k].price)}`} icon="pills" block kind="ghost" sub={`${select.BOOSTS[k].blurb} Habit +${select.BOOSTS[k].habit}.`} />)}
    </Section>
  );
}

/** Driving tonight's round yourself: what the orders in this city come to, and the button. */
export function DriveRound() {
  const w = useWorld();
  const o = select.ordersIn(w, select.currentCity(w));
  return <Do action={{ type: 'run_delivery' }} label={`Drive the round yourself${o.lots ? ` · ${Math.min(o.lots, select.yourCarry(w))} lots` : ''}`} icon="van" block
    sub={o.lots ? `Orders worth ${fmt(o.worth)} if the van held them all; yours holds ${select.yourCarry(w)}. Two hours after dark, and the road is the road.` : 'No orders here the stash can fill.'} />;
}

export function RacketRow({ id }: { id: string }) {
  const w = useWorld();
  const r = w.rackets[id];
  const def = RACKETS[r.kind];
  const runner = r.runnerId ? w.npcs[r.runnerId] : undefined;
  if (r.owner !== PLAYER) { const f = w.factions[r.owner]; return <Row left={<Icon name={r.kind} />} title={def.label} sub={`Run by the ${f?.short ?? 'others'}`} right={<Chip tone="red">theirs</Chip>} />; }
  const syn = select.synergyOf(w, r); const sat = select.saturationMult(w, r);
  return (
    <div className="r-racket">
      <Row left={<Icon name={r.kind} />} title={`${def.label} · level ${r.level}`} sub={`${def.wash ? `Washes up to ${fmt(select.washCap(w, r))} a day at ${Math.round(select.washRate(w) * 100)}¢${r.on === false ? ' — switched off' : ''}` : def.sells ? `Sells ${def.sells.join(', ')} from your stash · ${select.sellCapacity(r)} a day` : `${fmt(select.racketIncome(w, r))} a day ${def.clean ? 'clean' : 'dirty'}`}${r.down ? ` · shut ${r.down}d` : ''}`}
        right={runner ? <NpcFace n={runner} size={28} /> : <Chip tone="muted">no runner</Chip>} />
      <div className="r-racket-notes">
        {syn && <Chip tone="green">+{Math.round(syn.bonus * 100)}% {syn.why}</Chip>}
        {sat < 1 && <Chip tone="red">×{sat.toFixed(2)} — too many in this district</Chip>}
        {!runner && <Chip tone="muted" title="Assign one of your crew from their sheet">minded by nobody: ×{select.runnerFactor(w, r).toFixed(2)}</Chip>}
      </div>
      <div className="r-inline-actions">
        {def.wash && <Do action={{ type: 'toggle_wash', racketId: id }} label={r.on === false ? 'Switch the laundry on' : 'Switch the laundry off'} small kind={r.on === false ? 'primary' : 'ghost'} />}
        <Do action={{ type: 'upgrade_racket', racketId: id }} label="Upgrade" small />
        <Do action={{ type: 'close_racket', racketId: id }} label="Close" small kind="ghost" confirm="Tap again to close it" />
      </div>
    </div>
  );
}

export function SafehousePanel({ id }: { id: string }) {
  const w = useWorld();
  const s = w.safehouses[id];
  const tier = SAFEHOUSE_TIERS[s.tier - 1];
  return (
    <div className="r-safehouse">
      <Row left={<Icon name="safehouse" />} title={s.name} sub={`${tier.beds} beds · stash +${tier.capacity} · ${s.labs.length}/${tier.labs} labs · rent ${fmt(tier.rent)}/day`} />
      {s.tier < 3 && <Do action={{ type: 'upgrade_safehouse', safehouseId: id }} label={`Move up to ${SAFEHOUSE_TIERS[s.tier].label.toLowerCase()}`} small />}
      {s.labs.map(l => (
        <div key={l.id} className="r-lab">
          <Row left={<Icon name={l.kind === 'lab' ? 'lab' : l.kind === 'grow' ? 'grow_op' : 'still'} />} title={`${LABS[l.kind].label} · level ${l.level}`} sub={`${select.labOutput(w, l)} ${LABS[l.kind].product} a day at quality ${select.labQuality(w, l)} · ${l.supplies} days of supplies${l.down ? ` · down ${l.down}d` : ''}${l.workerId ? ` · worked by ${w.npcs[l.workerId]?.first}` : ' · nobody working it'}`} />
          <div className="r-inline-actions">
            <Do action={{ type: 'restock_lab', safehouseId: id, labId: l.id, days: 5 }} label={`Supplies ×5 (${fmt(select.restockCost(w, l.kind, 5))})`} small />
            <Do action={{ type: 'upgrade_lab', safehouseId: id, labId: l.id }} label="Upgrade" small />
          </div>
        </div>
      ))}
      <HostageList filter={h => h.safehouseId === id} />
      <div className="r-inline-actions">{(Object.keys(LABS) as LabKind[]).filter(k => !s.labs.some(l => l.kind === k)).map(k => <Do key={k} action={{ type: 'build_lab', safehouseId: id, kind: k }} label={`Build a ${LABS[k].label.toLowerCase()}`} icon={k === 'lab' ? 'lab' : k === 'grow' ? 'grow_op' : 'still'} small />)}</div>
    </div>
  );
}

/**
 * A rival's soldiers on this block, and what it would take to run them off: you and the hardest of
 * your people who are free here, against however many of theirs stand on it. After dark, standing
 * on the block. The odds are the fight's own (`fights.fightOdds`).
 */
function TakeItToThem({ blockId }: { blockId: string }) {
  const w = useWorld();
  const b = w.blocks[blockId];
  const f = Object.values(w.factions).filter(x => x.alive && (b.influence[x.id] ?? 0) >= 10).sort((x, y) => (b.influence[y.id] ?? 0) - (b.influence[x.id] ?? 0))[0];
  if (!f) return null;
  const city = select.cityOfBlock(w, blockId);
  const crew = select.crew(w).filter(n => (n.crew!.cityId || 'c0') === city && n.crew!.status === 'ready' && n.crew!.assignment?.kind !== 'job')
    .sort((x, y) => y.skills.muscle - x.skills.muscle).slice(0, select.ATTACK.maxCrew);
  const side = select.sideOf(w, crew.map(n => n.id));
  const them = select.soldiersOn(w, f);
  const odds = select.fightOdds(w, side, them);
  return (
    <Section title="Take it to them" right={<Chip tone={odds >= 60 ? 'green' : odds >= 40 ? 'gold' : 'red'}>{odds}%</Chip>}>
      <p className="r-note">About {them.count} of the {f.short}'s soldiers stand on {b.name}{them.guns ? ', armed' : ''}. You would go in with {crew.length ? crew.map(n => n.first).join(', ') : 'nobody but yourself'}{w.player.bullets ? `, and ${w.player.bullets} rounds` : ' and no rounds'}. Win and the block leans your way and they are short of men; lose and your people end up in hospital. Either way it is war talk.</p>
      <Do action={{ type: 'attack', factionId: f.id, blockId, crewIds: crew.map(n => n.id) }} label={`Hit the ${f.short} on ${b.name}`} icon="fist" kind="danger" block confirm="Tap again: this is a fight" />
    </Section>
  );
}
