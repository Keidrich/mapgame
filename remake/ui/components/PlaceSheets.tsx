import { BUSINESSES, JOBS, LABS, RACKETS, SAFEHOUSE_TIERS } from '@r/content/world';
import { select, PLAYER } from '@r/sim/index';
import type { JobKind, LabKind, RacketKind } from '@r/sim/types';
import { Icon } from '@ui/icons';
import { openSheet, useWorld } from '../store';
import { Emblem, NpcFace } from './Faces';
import { Chip, Do, Empty, Meter, Row, Section, Sheet, fmt } from './kit';
import { SETPIECE_RANK, setpieceFor } from '@r/content/setpieces';
import { ShopSection } from './Armoury';
import { HostageList } from './Hostages';

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
          <p className="r-note">{sp.pitch.replace(/\{L\}/g, b.landmark!)} {sp.stages} stages, a decision at each. {ready ? '' : `Nobody brings a job like this to somebody the street does not know yet: fear and respect of ${SETPIECE_RANK} between them (you have ${select.notoriety(w)}).`}</p>
          <Do action={{ type: 'case', kind: 'setpiece', blockId: id }} label={`Case ${b.landmark}`} icon="crown" block sub="A day around the place. The job goes on your board with a head start on the planning." />
        </Section>
      ); })()}
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
  const cases = select.caseKinds(w, { businessId: id });
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
          <Do key={k} action={{ type: 'start_racket', businessId: id, kind: k as RacketKind }} label={`Start ${RACKETS[k].label}`} icon={k} sub={`${RACKETS[k].blurb}${RACKETS[k].base ? ` About ${fmt(RACKETS[k].base * (0.55 + w.blocks[b.blockId].wealth / 100))} a day before a runner.` : ''}`} />
        ))}
        {!mine && !protectedByMe && !rackets.length && <Empty>{def.rackets.length ? 'Protect or own it to run something out of the back.' : 'Nothing runs out of a place like this. It is a job, not a racket.'}</Empty>}
      </Section>
      {b.closed <= 0 && <ShopSection at={id} title={w.player.blockId === b.blockId ? 'For sale here' : `For sale here — go to ${w.blocks[b.blockId].name}`} />}
      {cases.length > 0 && !mine && (
        <Section title="Case it">
          <p className="r-note">Spend an hour watching the place, and put a job on your board.</p>
          <div className="r-inline-actions">{cases.map(k => <Do key={k} action={{ type: 'case', kind: k as JobKind, businessId: id }} label={JOBS[k].label} icon={k === 'heist' ? 'heist_bank' : k === 'hack' ? 'hack' : k === 'burglary' ? 'lockpicks' : k === 'robbery' ? 'robbery' : k === 'arson' ? 'arson_hire' : k === 'fraud' ? 'check_kiting' : 'ops'} small />)}</div>
        </Section>
      )}
      {b.patronIds.length > 0 && <Section title="Regulars">{b.patronIds.map(pid => { const n = w.npcs[pid]; return n ? <Row key={pid} onClick={() => openSheet({ kind: 'person', id: pid })} left={<NpcFace n={n} size={32} />} title={select.fullName(n)} sub={n.crew ? 'Yours' : n.rel.met ? `trust ${n.rel.trust}` : n.alive ? 'A stranger' : 'Dead'} /> : null; })}</Section>}
    </Sheet>
  );
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
