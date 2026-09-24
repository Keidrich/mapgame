import { useState } from 'react';
import { JOBS, PRODUCTS } from '@r/content/world';
import { ITEMS, SLOTS_ORDER } from '@r/content/kit';
import { select, PLAYER } from '@r/sim/index';
import type { Product } from '@r/sim/types';
import { ArmourySection } from './Armoury';
import { HostageList } from './Hostages';
import { CommissionSection } from './Commission';
import { CaseSection } from './JobFaction';
import { Icon } from '@ui/icons';
import { openSheet, useWorld, focusBlock } from '../store';
import { Emblem, NpcFace } from './Faces';
import { mute } from './tone';
import { jobIcon, payoutLine } from './JobFaction';
import { BizRow, DriveRound, RacketRow, SafehousePanel } from './PlaceSheets';
import { roleLine } from './PersonSheet';
import { Chip, Dial, Do, Empty, Meter, Row, Section, fmt } from './kit';

export function PeopleTab() {
  const w = useWorld();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const known = select.known(w).filter(n => !q || select.fullName(n).toLowerCase().includes(q.toLowerCase()));
  const needs = known.filter(n => n.agenda?.known);
  const owes = known.filter(n => n.rel.owes > 0);
  const officials = select.officials(w);
  const fixer = w.fixerId ? w.npcs[w.fixerId] : undefined;
  return (
    <div className="r-tab">
      <h2 className="r-tab-title">People</h2>
      <input className="r-input" placeholder="Search everyone you have met" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} aria-label="Search people" />
      {!q && needs.length > 0 && <Section title="Somebody needs something">{needs.slice(0, 6).map(n => <Row key={n.id} onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={36} />} title={select.fullName(n)} sub={select.agendaLine(w, n)} />)}</Section>}
      {!q && owes.length > 0 && <Section title="Owe you a favour">{owes.slice(0, 6).map(n => <Row key={n.id} onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={36} />} title={select.fullName(n)} sub={roleLine(w, n)} right={<Chip tone="gold">×{n.rel.owes}</Chip>} />)}</Section>}
      {!q && <Section title="City hall and the law">
        {officials.map(n => <Row key={n.id} onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={36} />} title={select.fullName(n)} sub={roleLine(w, n)} right={n.payroll ? <Chip tone="gold">Payroll</Chip> : undefined} />)}
        {fixer && <Row onClick={() => openSheet({ kind: 'person', id: fixer.id })} left={<NpcFace n={fixer} size={36} />} title={select.fullName(fixer)} sub={`The fixer · ${w.blocks[fixer.homeBlockId].name}${fixer.rel.met ? '' : ' · go and introduce yourself'}`} />}
      </Section>}
      {!q && Object.keys(w.crews ?? {}).length > 0 && <Section title="Street crews">
        {Object.values(w.crews).map(c => { const b = w.npcs[c.bossId]; return <Row key={c.id} onClick={() => openSheet({ kind: 'person', id: c.bossId })} left={b ? <NpcFace n={b} size={36} /> : undefined} title={`The ${c.name}`} sub={`${c.members} on ${w.blocks[c.blockId].name} · ${c.terms === 'none' ? 'nobody\'s' : c.terms === 'paid' ? 'on your wage' : 'yours'}`} right={c.terms === 'none' ? <Chip tone="red">{c.members}/{select.CREW.outfitAt}</Chip> : <Chip tone="gold">{c.terms}</Chip>} />; })}
      </Section>}
      <Section title={`Everyone you know (${known.length})`}>
        {known.length ? known.slice(0, page * 30).map(n => <Row key={n.id} onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={36} />} title={select.fullName(n)} sub={`${roleLine(w, n)} · trust ${n.rel.trust} · fear ${n.rel.fear}`} />) : <Empty>Nobody yet. Walk into a place on the map and introduce yourself.</Empty>}
        {known.length > page * 30 && <button type="button" className="r-btn block" onClick={() => setPage(p => p + 1)}>Show more</button>}
      </Section>
    </div>
  );
}

export function CrewTab() {
  const w = useWorld();
  const crew = select.crew(w);
  const beds = select.bedsTotal(w);
  return (
    <div className="r-tab">
      <h2 className="r-tab-title">Crew <span className="r-note">{crew.length}/{beds} beds</span></h2>
      {crew.length > 0 && <FamilyTree />}
      {Object.values(w.hostages).some(h => h.holder !== PLAYER) && <Section title="Taken"><HostageList filter={h => h.holder !== PLAYER} /></Section>}
      {crew.length ? (() => {
        // with more than one city, your people are listed where they are: they work only there
        const cities = (w.region?.cities ?? []).filter(c => c.founded);
        const groups = cities.length > 1 ? cities.map(c => ({ c, list: crew.filter(n => (n.crew!.cityId || 'c0') === c.id) })).filter(g => g.list.length) : [{ c: undefined, list: crew }];
        return groups.map(g => {
          const rows = g.list.map(n => crewRow(n));
          return g.c ? <Section key={g.c.id} title={`${g.c.name}${g.c.id === select.currentCity(w) ? ' · you are here' : ''}`} right={<span className="r-note">{g.list.length}</span>}>{rows}</Section> : <div key="all">{rows}</div>;
        });
      })() : <Empty>Nobody works for you yet. Build trust with the regulars in a bar or a gym, then recruit them. You have beds for {beds}.</Empty>}
      <p className="r-note">Crew earn more as they level up — running a racket, working a lab, guarding a block and going on jobs all teach them. At level 2 and loyalty 55 one of them can run a district for you.{(w.region?.cities.filter(c => c.founded).length ?? 0) > 1 ? ' Each works only in the city they are in; send somebody from their sheet, or bring them on your train.' : ''}</p>
    </div>
  );
  function crewRow(n: (typeof crew)[number]) {
        const a = n.crew!.assignment;
        const where = !a ? 'Free' : a.kind === 'racket' ? `Runs ${w.rackets[a.racketId]?.kind.replace(/_/g, ' ')}` : a.kind === 'lab' ? 'In a lab' : a.kind === 'guard' ? `Guards ${w.blocks[a.blockId]?.name}` : a.kind === 'district' ? `Lieutenant, ${w.districts[a.districtId]?.name}` : a.kind === 'driver' ? 'Drives deliveries' : `On ${w.jobs[a.jobId]?.title}`;
        const best = (Object.entries(n.skills) as [string, number][]).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([s, v]) => `${s} ${v}`).join(' · ');
        const kit = select.kitOf(w, n.id); const carries = SLOTS_ORDER.filter(s => kit[s]).map(s => ITEMS[kit[s]!].label.toLowerCase());
        return <Row key={n.id} onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={42} />} title={select.fullName(n)} sub={`L${n.crew!.level} · ${best} · loyalty ${Math.round(n.crew!.loyalty)} · ${fmt(n.crew!.cut)}/day${carries.length ? ` · ${carries.join(', ')}` : ''}`} right={<Chip tone={n.crew!.status === 'ready' ? (a ? 'muted' : 'green') : n.crew!.status === 'travel' ? 'blue' : 'red'}>{n.crew!.status === 'ready' ? where : n.crew!.status === 'travel' ? 'on the train' : n.crew!.status}</Chip>} />;
  }
}

/**
 * The family at a glance: you at the head, the two posts, the capos over their districts, and the
 * made men and associates under them. An empty post says how to fill it.
 */
function FamilyTree() {
  const w = useWorld();
  const crew = select.crew(w);
  const by = (r: string) => crew.filter(n => select.familyRank(w, n) === r);
  const post = (k: 'underboss' | 'consigliere') => {
    const n = k === 'underboss' ? select.underboss(w) : select.consigliere(w);
    return n ? <Row key={k} onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={36} />} title={select.fullName(n)} sub={`${select.RANK_LABEL[k]} · ${select.RANK_BLURB[k]}`} />
      : <Row key={k} left={<span className="r-bizicon"><Icon name={k === 'underboss' ? 'crown' : 'note'} size={18} /></span>} title={`No ${k}`} sub={`Make somebody, then appoint them from their sheet. ${select.RANK_BLURB[k]}`} />;
  };
  const capos = by('capo'), soldiers = by('soldier'), associates = by('associate');
  return (
    <Section title="The family" right={<span className="r-note">{capos.length + soldiers.length + (select.underboss(w) ? 1 : 0) + (select.consigliere(w) ? 1 : 0)} made · {associates.length} associates</span>}>
      {post('underboss')}
      {post('consigliere')}
      {capos.map(n => <Row key={n.id} onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={32} />} title={select.fullName(n)} sub={`Capo · ${n.crew!.assignment?.kind === 'district' ? w.districts[n.crew!.assignment.districtId]?.name : ''}`} />)}
      {soldiers.length > 0 && <p className="r-note">Soldiers: {soldiers.map(n => n.first).join(', ')}.</p>}
      {associates.length > 0 && <p className="r-note">Associates: {associates.map(n => n.first).join(', ')}. {associates.some(n => !select.makeBlock(n)) ? 'Somebody is ready to be made — after dark, from their sheet.' : `Level ${select.MAKING.level} and loyalty ${select.MAKING.loyalty} to be made.`}</p>}
    </Section>
  );
}

export function JobsTab() {
  const w = useWorld();
  const jobs = Object.values(w.jobs);
  const live = jobs.filter(j => ['planning', 'ready', 'paused'].includes(j.status));
  const offers = jobs.filter(j => j.status === 'offer').sort((a, b) => a.tier - b.tier);
  const past = jobs.filter(j => j.status === 'done' || j.status === 'failed').sort((a, b) => b.expires - a.expires).slice(0, 8);
  const row = (j: typeof jobs[number]) => <Row key={j.id} onClick={() => openSheet({ kind: 'job', id: j.id })} left={<span className="r-bizicon"><Icon name={jobIcon(j)} size={20} /></span>} title={j.title} sub={`${JOBS[j.kind].label} · tier ${j.tier} · ${payoutLine(j)}${select.present(w, j) ? '' : ` · in ${select.cityName(w, select.cityOfBlock(w, j.blockId))}, run without you`}`} right={j.status === 'planning' ? <Chip tone="gold">{j.daysLeft}d</Chip> : j.status === 'ready' ? <Chip tone="green">Ready</Chip> : j.status === 'done' ? <Chip tone="green">Done</Chip> : j.status === 'failed' ? <Chip tone="red">Failed</Chip> : j.sourceId ? <NpcFace n={w.npcs[j.sourceId]} size={28} /> : undefined} />;
  return (
    <div className="r-tab">
      <h2 className="r-tab-title">Jobs</h2>
      {live.length > 0 && <Section title="Under way">{live.map(row)}</Section>}
      <Section title="On the board">{offers.length ? offers.map(row) : <Empty>Nothing on offer. People who trust you bring you work; you can also case any place, person or street from its sheet.</Empty>}</Section>
      <CaseSection target={{ blockId: w.player.blockId }} only={k => select.jobTarget(k) === 'none'} title="Set something up" note="Jobs that need no particular door: a print run, a boiler room, a book on everybody's phone." />
      {past.length > 0 && <Section title="Lately">{past.map(row)}</Section>}
    </div>
  );
}

export function EmpireTab() {
  const w = useWorld();
  const p = w.player;
  const f = select.forecast(w);
  const rank = select.rankOf(w); const next = select.nextRank(w);
  const cases = select.openCases(w);
  const owned = p.businessIds.map(id => w.businesses[id]).filter(Boolean);
  const prot = select.protectedBy(w);
  const [view, setView] = useState<'money' | 'holdings' | 'kit' | 'law' | 'you'>('money');
  const hist = w.history.slice(-30);
  const max = Math.max(1, ...hist.map(h => h.clean + h.dirty));
  return (
    <div className="r-tab">
      <h2 className="r-tab-title">Empire</h2>
      <div className="r-seg full" role="tablist">
        {(['money', 'holdings', 'kit', 'law', 'you'] as const).map(v => <button type="button" key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v === 'money' ? 'Money' : v === 'holdings' ? 'Holdings' : v === 'kit' ? 'Kit' : v === 'law' ? `Law${cases.length ? ` (${cases.length})` : ''}` : 'You'}</button>)}
      </div>
      {view === 'money' && <>
        <div className="r-stats">
          <div><span>Clean</span><b className="green">{fmt(p.cash)}</b></div>
          <div><span>Dirty</span><b className="orange">{fmt(p.dirty)}</b></div>
          <div><span>Worth</span><b>{fmt(select.netWorth(w))}</b></div>
          <div><span>Control{Object.keys(w.cities ?? {}).length ? ` of ${select.cityName(w, select.currentCity(w))}` : ''}</span><b>{(select.controlShare(w, select.currentCity(w)) * 100).toFixed(1)}%</b></div>
        </div>
        <Section title="Tomorrow, roughly">
          <p className="r-note">Dirty in <b className="orange">{fmt(f.dirty)}</b> · clean in <b className="green">{fmt(f.clean)}</b>{f.washed ? ` (after washing ${fmt(f.washed)})` : ''} · wages <b>{fmt(f.costs)}</b>. Selling rackets and labs come on top.</p>
        </Section>
        {hist.length > 1 && hist.some(h => h.clean + h.dirty > 0) && <Section title="The last month">
          <div className="r-chart" role="img" aria-label="Daily takings, last thirty days">
            {hist.map(h => <div key={h.day} className="r-bar" title={`Day ${h.day}: ${fmt(h.clean)} clean, ${fmt(h.dirty)} dirty`}><span className="clean" style={{ height: `${(Math.max(0, h.clean) / max) * 100}%` }} /><span className="dirty" style={{ height: `${(Math.max(0, h.dirty) / max) * 100}%` }} /></div>)}
          </div>
        </Section>}
        <Section title="Washing money">
          <p className="r-note">Businesses, officials and institutions want clean money. A laundering racket washes every night while it is switched on; until you have one, the fixer does it by hand at a worse rate ({Math.round(select.fixerRate(w) * 100)}¢, up to {fmt(select.fixerCap(w) - p.washedToday)} more today).</p>
          {(() => { const fx = w.fixerId ? w.npcs[w.fixerId] : undefined; return fx && !fx.rel.met ? <Row onClick={() => openSheet({ kind: 'person', id: fx.id })} left={<NpcFace n={fx} size={32} />} title={`Find the fixer: ${select.fullName(fx)}`} sub={`${w.blocks[fx.homeBlockId].name}, ${w.districts[w.blocks[fx.homeBlockId].districtId].name}. Introduce yourself and the door opens.`} /> : null; })()}
          <div className="r-inline-actions">{[1000, 5000, Math.min(p.dirty, select.fixerCap(w) - p.washedToday)].filter((a, i, arr) => a > 0 && arr.indexOf(a) === i).map(a => <Do key={a} action={{ type: 'fixer_wash', amount: a }} label={`Fixer: wash ${fmt(a)}`} small />)}</div>
        </Section>
        {(select.outlets(w).length > 0 || select.drivers(w).length > 0) && <Section title="Supply chain" right={<span className="r-note">{select.outlets(w).length} places · {select.drivers(w).length} drivers</span>}>
          {w.supply && <div className="r-stats">
            <div><span>Last night</span><b>{w.supply.delivered} lots</b></div>
            <div><span>Came in</span><b className="dirty">{fmt(w.supply.earned)}</b></div>
            <div><span>Taken</span><b>{w.supply.lost}</b></div>
            <div><span>Went short</span><b>{w.supply.short}</b></div>
          </div>}
          {select.outlets(w).map(b => <BizRow key={b.id} id={b.id} />)}
          {!select.drivers(w).length && <p className="r-why">Nobody is driving. Give one of your crew the deliveries from their sheet, or drive the round yourself after dark.</p>}
          <DriveRound />
        </Section>}
        <Section title="The stash" right={<span className="r-note">{select.stashTotal(w)}/{select.stashCapacity(w)}</span>}>
          {(Object.keys(PRODUCTS) as Product[]).map(k => { const lot = p.stash[k]; return <Row key={k} left={<Icon name={k === 'goods' ? 'hot_goods' : k} />} title={`${PRODUCTS[k].label}: ${lot.n}`} sub={lot.n ? `quality ${lot.q} · ${k === 'goods' ? 'needs a fence' : `${fmt(select.streetPrice(w, k, p.blockId))} each on this corner`}` : 'none'} right={lot.n && k !== 'goods' ? <Do action={{ type: 'sell_street', product: k, n: lot.n }} label="Sell here" small /> : undefined} />; })}
        </Section>
      </>}
      {view === 'kit' && <ArmourySection />}
      {view === 'holdings' && <>
        {Object.values(w.hostages).some(h => h.holder === PLAYER) && <Section title="In the back room"><HostageList filter={h => h.holder === PLAYER} /></Section>}
        <Section title={`Rackets (${p.racketIds.length})`}>{p.racketIds.length ? p.racketIds.map(id => w.rackets[id] ? <div key={id}><p className="r-over">{w.businesses[w.rackets[id].businessId].name}</p><RacketRow id={id} /></div> : null) : <Empty>No rackets yet. Protect or buy a place, then start one from its sheet.</Empty>}</Section>
        <Section title={`Places you own (${owned.length})`}>{owned.length ? owned.map(b => <BizRow key={b.id} id={b.id} />) : <Empty>Buy a place with clean money from its owner.</Empty>}</Section>
        <Section title={`Places that pay you (${prot.length})`}>{prot.length ? prot.map(b => <BizRow key={b.id} id={b.id} />) : <Empty>Nobody pays you yet.</Empty>}</Section>
        <Section title="Safehouses">{p.safehouseIds.length ? p.safehouseIds.map(id => <SafehousePanel key={id} id={id} />) : <Empty>Open a block you have a foothold on and take a back room there.</Empty>}</Section>
      </>}
      {view === 'law' && <>
        <Meter value={p.heat} tone="heat" label="Heat" right={`${Math.round(p.heat)} — ${p.heat >= 80 ? 'they are coming' : p.heat >= 60 ? 'raids likely' : p.heat >= 30 ? 'noticed' : 'quiet'}`} />
        <p className="r-note">Heat falls by itself, faster the higher it is. Past 60 the police raid your rackets; at 100 they come through your door. A case file is different: it does not cool while its witnesses keep talking.</p>
        <Section title="Case files">
          {cases.length ? cases.map(c => <div key={c.id} className="r-case">
            <b>{c.summary}</b>
            <Meter value={c.evidence} tone="blue" label={c.suspectId === PLAYER ? 'Against you' : `Against ${w.npcs[c.suspectId]?.first ?? 'one of yours'}`} right={`${Math.round(c.evidence)} (+${select.evidenceRate(w, c)}/day)`} />
            {(c.suspectId === PLAYER || p.crewIds.includes(c.suspectId)) && <CaseSection target={{ caseId: c.id }} title="Make it go away" note="Not the witnesses — the file itself." />}
            {c.status === 'charged' && <p className="r-why">Charged. Trial on day {c.trialDay}: {Math.round(select.convictionOdds(w, c) * 100)}% chance of a conviction as things stand.</p>}
            {c.witnessIds.map(id => { const n = w.npcs[id]; return n ? <Row key={id} onClick={() => openSheet({ kind: 'person', id })} left={<NpcFace n={n} size={28} />} title={`Witness: ${select.fullName(n)}`} sub={n.alive ? (n.rel.fear >= 45 ? 'Too frightened to talk' : 'Talking') : 'Dead'} /> : null; })}
          </div>) : <Empty>No open files. Keep it that way.</Empty>}
        </Section>
        <Section title="Help">
          <Do action={{ type: 'lawyer', on: !p.lawyer }} label={p.lawyer ? 'Let the lawyer go' : 'Retain a lawyer'} sub={p.lawyer ? 'On retainer: files grow slower, sentences are shorter, trials are fairer. 150 a day.' : '500 now and 150 a day: files grow slower, sentences are shorter.'} block kind={p.lawyer ? 'ghost' : 'plain'} />
          {select.officials(w).filter(n => n.payroll).map(n => <Row key={n.id} onClick={() => openSheet({ kind: 'person', id: n.id })} left={<NpcFace n={n} size={28} />} title={select.fullName(n)} sub={`${roleLine(w, n)} · ${n.payroll! > 1 ? `${fmt(n.payroll!)}/week` : 'on the strength of what you know'}`} right={<Do action={{ type: 'drop_payroll', npcId: n.id }} label="Drop" small kind="ghost" />} />)}
          <div className="r-inline-actions">{[1, 3, 5].map(d => <Do key={d} action={{ type: 'lay_low', days: d }} label={`Lay low ${d} day${d > 1 ? 's' : ''}`} small confirm={`Tap again: ${d} day${d > 1 ? 's' : ''} with no actions`} />)}</div>
        </Section>
      </>}
      {view === 'you' && <>
        <div className="r-you">
          <div><div className="r-kicker">Rank</div><h3>{rank.label}</h3><p className="r-note">{next ? `${next.at - select.notoriety(w)} more fear and respect to ${next.label}. Each rank gives more hours in the day.` : 'There is nothing above this.'}</p></div>
        </div>
        <div className="r-rel"><Meter value={p.fear} tone="red" label="Fear" /><Meter value={p.respect} tone="gold" label="Respect" /></div>
        {(() => { const r = select.REPUTATION[select.reputation(w)]; return <p className="r-note"><b>{r.label}.</b> {r.blurb}{r.hard || r.soft ? ` Threats ${r.hard >= 0 ? '+' : ''}${r.hard}, deals ${r.soft >= 0 ? '+' : ''}${r.soft} on the odds.` : ''}</p>; })()}
        <Section title="Skills">
          {(Object.keys(p.skills) as (keyof typeof p.skills)[]).map(s => <Meter key={s} value={p.skills[s]} max={10} label={s} right={`${p.skills[s]} · ${p.xp[s]}/${40 + p.skills[s] * 18}`} />)}
          <p className="r-note">You get better at what you do: every threat is muscle, every conversation charm, every job the skills it leans on. Or train: once a skill a day, more for every day in a row{select.streakNow(w) > 1 ? ` (${select.streakNow(w)} running)` : ''}.</p>
          {(Object.keys(select.TRAINING) as (keyof typeof p.skills)[]).map(s => { const t = select.TRAINING[s];
            if (t.at === 'books') return <Do key={s} action={{ type: 'train', skill: s, at: 'books' }} label={`${t.verb}: ${s} +${select.trainXp(w, 'books')}`} icon="note" block small sub={`${t.blurb} ${select.TRAIN.ap} hours, by day, anywhere.`} />;
            const places = t.at; const here = select.cityOfBlock(w, p.blockId);
            const b = Object.values(w.businesses).filter(x => places.includes(x.type) && x.closed <= 0 && select.cityOfBlock(w, x.blockId) === here).sort((x, y) => Number(y.blockId === p.blockId) - Number(x.blockId === p.blockId) || Number(y.ownedBy === PLAYER || y.protection?.by === PLAYER) - Number(x.ownedBy === PLAYER || x.protection?.by === PLAYER) || y.tier - x.tier)[0];
            return b ? <Row key={s} onClick={() => openSheet({ kind: 'business', id: b.id })} left={<Icon name="fist" />} title={`${t.verb}: ${s}`} sub={`${b.name}, ${w.blocks[b.blockId].name} · ${t.half === 'day' ? 'by day' : 'after dark'}`} right={<Icon name="caret" size={16} />} /> : null; })}
        </Section>
        <Section title="Habit" right={<span className="r-note">{Math.round(p.habit ?? 0)}/100</span>}>
          <Meter value={p.habit ?? 0} tone="red" label={select.shaking(w) ? 'Shaking' : (p.habit ?? 0) >= select.HABIT.withdrawal ? 'Hooked' : 'In hand'} />
          <p className="r-note">Bennies and a bump buy hours or an edge today. Each leaves habit, which fades by {select.HABIT.fade} a clean day; past {select.HABIT.withdrawal}, a day without one costs hours the next morning. The fixer sells both at any hour.</p>
          <div className="r-inline-actions">
            {(['pep', 'nerve'] as const).map(k => <Do key={k} action={{ type: 'take_boost', kind: k, at: 'fixer' }} label={`${select.BOOSTS[k].label} · ${fmt(select.BOOSTS[k].price)}`} small />)}
            {(p.habit ?? 0) >= 10 && <Do action={{ type: 'dry_out' }} label={`Dry out · ${fmt(select.HABIT.dryOut.price)}`} small kind="ghost" />}
          </div>
        </Section>
        <Section title="Getting out">
          <p className="r-note">Hold {fmt(select.STRAIGHT.clean)} clean, heat under {select.STRAIGHT.heat} and no open files for {select.STRAIGHT.days} days, and you can walk away. {p.straightDays ? `${p.straightDays} day${p.straightDays > 1 ? 's' : ''} so far.` : ''}</p>
          <Do action={{ type: 'retire' }} label="Walk away" kind="primary" block confirm="Tap again: this ends the game" />
        </Section>
      </>}
    </div>
  );
}

export function RivalsTab() {
  const w = useWorld();
  const fs = Object.values(w.factions).sort((a, b) => Number(b.alive) - Number(a.alive) || a.standing - b.standing);
  return (
    <div className="r-tab">
      <h2 className="r-tab-title">Rivals</h2>
      <CommissionSection />
      <div className="r-rivals">{fs.map(f => {
        const stance = select.stanceOf(f, w.day);
        return (
          <button type="button" key={f.id} className="r-rival" onClick={() => openSheet({ kind: 'faction', id: f.id })} style={{ ['--f' as string]: mute(f.color) }}>
            <Emblem e={f.emblem} size={44} />
            <div className="grow">
              <div className="r-row-title">{f.name} {!f.alive && <Chip tone="red">Finished</Chip>}</div>
              <div className="r-row-sub">{select.factionBlocks(w, f.id).length} blocks · {f.soldiers} soldiers · {w.districts[f.homeDistrictId]?.name}{Object.keys(w.cities ?? {}).length ? `, ${select.cityName(w, w.districts[f.homeDistrictId]?.cityId || 'c0')}` : ''}</div>
              <Dial value={f.standing} label={select.STANCE_LABEL[stance]} />
            </div>
          </button>
        );
      })}</div>
      <p className="r-note">They run the same game you do — protection, rackets, soldiers, ground — and they fight each other as readily as you.</p>
      <button type="button" className="r-btn block" onClick={() => focusBlock(w.player.blockId)}>Show me the map</button>
      <button type="button" className="r-btn block" onClick={() => openSheet({ kind: 'region' })}>The region: the cities down the road</button>
    </div>
  );
}
