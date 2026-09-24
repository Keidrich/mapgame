import { useState } from 'react';
import { OFFICIALS, TRAITS } from '@r/content/world';
import { select, SKILLS, PLAYER, type World } from '@r/sim/index';
import type { Npc } from '@r/sim/types';
import { Icon } from '@ui/icons';
import { act, openSheet, useWorld } from '../store';
import { NpcFace } from './Faces';
import { Chip, Dial, Do, Empty, Meter, Row, Section, Sheet, fmt } from './kit';
import { KitList, ShopSection } from './Armoury';
import { HostageCard } from './Hostages';
import { CaseSection } from './JobFaction';

export function roleLine(w: World, n: Npc): string {
  const work = n.workId ? w.businesses[n.workId] : undefined;
  if (n.crew) return `Your crew · level ${n.crew.level}`;
  const sc = select.crewOf(w, n.id);
  if (sc) return `Runs the ${sc.name} — ${sc.members} on the corner`;
  if (n.official) return `${OFFICIALS[n.official].label}${n.precinctId ? `, ${n.precinctId === 'p0' ? 'First' : n.precinctId === 'p1' ? 'Second' : 'Third'} Precinct` : ''}`;
  if (n.role === 'boss' && n.faction) return `Boss of ${w.factions[n.faction]?.name}`;
  if (n.role === 'lieutenant' && n.faction) return `Lieutenant, ${w.factions[n.faction]?.name}`;
  if (n.role === 'fixer') return 'Fixer — washes money, knows people';
  if (work && work.ownerId === n.id) return `Owns ${work.name}`;
  const reg = Object.values(w.businesses).find(b => b.patronIds.includes(n.id));
  return reg ? `Regular at ${reg.name}` : 'Lives locally';
}

export function PersonSheet({ id }: { id: string }) {
  const w = useWorld();
  const n = w.npcs[id];
  if (!n) return <Sheet title="Nobody"><Empty>They are gone.</Empty></Sheet>;
  const here = n.homeBlockId === w.player.blockId;
  const home = w.blocks[n.homeBlockId];
  const work = n.workId ? w.businesses[n.workId] : undefined;
  const fac = n.faction && n.faction !== PLAYER ? w.factions[n.faction] : undefined;
  return (
    <Sheet title={select.fullName(n)} kicker={roleLine(w, n)} art={<NpcFace n={n} size={64} tint={fac?.color ? `${fac.color}55` : undefined} />}>
      <div className="r-chips">
        {!n.alive && <Chip tone="red">Dead</Chip>}
        {n.jailedDays ? <Chip tone="blue">In jail · {n.jailedDays}d</Chip> : null}
        {fac && <Chip tone="red">{fac.short}</Chip>}
        {n.known ? n.traits.map(t => <Chip key={t} title={TRAITS[t].blurb}>{TRAITS[t].label}</Chip>) : <Chip tone="muted">Not sized up — talk to them</Chip>}
        {n.known && <Chip tone="muted" title="How much pressure it takes before they fold">Nerve {n.nerve}</Chip>}
        {n.payroll ? <Chip tone="gold">On your payroll</Chip> : null}
        {select.isHeld(w, n.id) ? <Chip tone="red">{select.heldBy(w, n.id)!.holder === PLAYER ? 'In your back room' : 'Being held'}</Chip> : null}
        {n.rel.owes ? <Chip tone="gold">Owes you {n.rel.owes > 1 ? `×${n.rel.owes}` : 'one'}</Chip> : null}
        <Chip tone="muted">{n.age} · {n.pronoun === 'he' ? 'he/him' : n.pronoun === 'she' ? 'she/her' : 'they/them'}</Chip>
      </div>

      <div className="r-rel">
        <Dial value={n.rel.trust} label="Trust" />
        <Meter value={n.rel.fear} tone="red" label="Fear" />
        <Meter value={n.rel.respect} tone="gold" label="Respect" />
      </div>

      {n.agenda?.known && <div className="r-callout"><b>What they need:</b> {select.agendaLine(w, n)}.</div>}
      {n.secret?.known && <div className="r-callout dark"><b>What you know:</b> {select.secretLine(n)}.</div>}

      {n.crew ? <CrewPanel n={n} /> : n.alive && (
        <Section title="Face to face" right={!here ? <span className="r-note">{home.name}</span> : <Chip tone="green">Here</Chip>}>
          {!here && <Do action={{ type: 'travel', blockId: n.homeBlockId }} label={`Go to ${home.name}`} icon="legwork" block />}
          <Scenes n={n} />
        </Section>
      )}

      {select.heldBy(w, n.id) && <HostageCard h={select.heldBy(w, n.id)!} />}
      {n.alive && !select.heldBy(w, n.id) && <CaseSection target={{ npcId: n.id }} title={n.crew ? 'Get them out' : 'Make them a job'} note={n.crew ? 'They are inside. Something can be done about that.' : n.official ? 'Somebody in the building. What they can do for you is worth more than what they carry.' : undefined} />}
      {n.id === w.fixerId && n.alive && (n.rel.met ? <ShopSection at="fixer" title="What the fixer can get you" /> : <p className="r-note">Introduce yourself and the fixer will sell you what no shop will.</p>)}
      {n.known && (
        <Section title="Skills">
          <div className="r-skills">{SKILLS.map(s => <div key={s}><span>{s}</span><b>{n.skills[s]}</b></div>)}</div>
        </Section>
      )}

      <Section title="Their people">
        {n.ties.length ? n.ties.map(t => { const o = w.npcs[t.id]; if (!o) return null; return <Row key={t.id} onClick={() => openSheet({ kind: 'person', id: o.id })} left={<NpcFace n={o} size={32} />} title={select.fullName(o)} sub={`${t.kind === 'family' ? 'Family' : t.kind === 'friend' ? 'Friend' : t.kind === 'partner' ? 'Partner' : 'Bad blood'}${o.alive ? '' : ' · dead'}`} />; }) : <Empty>Nobody close.</Empty>}
      </Section>
      {work && <Section title="Work"><Row onClick={() => openSheet({ kind: 'business', id: work.id })} left={<Icon of="business" id={work.type} />} title={work.name} sub={`${home.name}`} /></Section>}
      {n.memory.length > 0 && <Section title="What they remember">{n.memory.slice().reverse().map((m, i) => <p key={i} className="r-memory"><span>Day {m.day}</span>{m.text}</p>)}</Section>}
    </Sheet>
  );
}

function Scenes({ n }: { n: Npc }) {
  const w = useWorld();
  const [rate, setRate] = useState(0.12);
  const [open, setOpen] = useState<string | null>(null);
  const work = n.workId ? w.businesses[n.workId] : undefined;
  const owner = work?.ownerId === n.id;
  const kinds: select.SceneKind[] = ['chat', 'intimidate'];
  if (owner && work!.tier < 3) kinds.push('protect', 'squeeze');
  if (owner) kinds.push('buy');
  if (!n.faction && !n.official) kinds.push('recruit');
  if (n.official) kinds.push('bribe');
  if (n.agenda?.known) kinds.push('settle');
  if (n.secret?.known) kinds.push('lean');
  if (n.rel.owes) kinds.push('favour');
  if (select.crewOf(w, n.id)) kinds.push('crew_pay', 'crew_take', 'crew_run');
  return (
    <div className="r-scenes">
      {kinds.map(k => {
        const q = select.quote(w, k, n.id, { businessId: owner ? work!.id : undefined, rate });
        const hide = q.disabled && /^Only|^Not an official|^It is yours|^They already pay|^An institution/.test(q.disabled);
        if (hide) return null;
        const away = q.disabled?.startsWith('Go to');
        return (
          <div key={k} className={`r-scene${q.disabled && !away ? ' off' : ''}`}>
            <button type="button" className="r-scene-main" disabled={!!q.disabled} onClick={() => act({ type: 'scene', kind: k, npcId: n.id, businessId: owner ? work!.id : undefined, rate })}>
              <span className="r-scene-label">{q.label}</span>
              {q.chance < 100 && <span className={`r-odds ${q.chance >= 65 ? 'good' : q.chance >= 40 ? 'mid' : 'bad'}`}>{Math.round(q.chance)}%</span>}
              <span className="r-scene-cost">{q.ap ? `${q.ap} AP` : 'free'}{q.cash ? ` · ${fmt(q.cash)}${q.clean ? ' clean' : ''}` : ''}</span>
            </button>
            <div className="r-scene-text">
              {q.disabled && !away ? <span className="r-why">{q.disabled}</span> : <><span className="gain">{q.gain}</span>{q.risk && q.risk !== 'Nothing.' && <span className="risk"> Risk: {q.risk}</span>}</>}
              {q.factors.length > 0 && <button type="button" className="r-link" onClick={() => setOpen(open === k ? null : k)}>{open === k ? 'hide the odds' : 'why these odds'}</button>}
            </div>
            {open === k && <ul className="r-factors">{q.factors.map((f, i) => <li key={i}><span>{f.label}</span><b className={f.n >= 0 ? 'pos' : 'neg'}>{f.n >= 0 ? '+' : ''}{f.n}</b></li>)}</ul>}
            {k === 'protect' && !q.disabled && (
              <label className="r-rate">Rate <input type="range" min={5} max={30} value={Math.round(rate * 100)} onChange={e => setRate(Number(e.target.value) / 100)} /> <b>{Math.round(rate * 100)}%</b>{rate > select.FAIR_RATE ? <span className="r-why"> over 15% they resent it</span> : null}</label>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CrewPanel({ n }: { n: Npc }) {
  const w = useWorld();
  const c = n.crew!;
  const a = c.assignment;
  const where = !a ? 'Free' : a.kind === 'racket' ? `Running the ${w.rackets[a.racketId]?.kind.replace(/_/g, ' ')} at ${w.businesses[w.rackets[a.racketId]?.businessId]?.name}`
    : a.kind === 'lab' ? 'Working a lab' : a.kind === 'guard' ? `Guarding ${w.blocks[a.blockId]?.name}` : a.kind === 'district' ? `Lieutenant over ${w.districts[a.districtId]?.name}` : `On a job: ${w.jobs[a.jobId]?.title}`;
  const unminded = w.player.racketIds.map(id => w.rackets[id]).filter(r => r && !r.runnerId);
  const districts = [...new Set(select.playerBlocks(w).map(b => b.districtId))];
  return (
    <Section title="Working for you" right={<Chip tone={c.status === 'ready' ? 'green' : c.status === 'jailed' ? 'blue' : 'red'}>{c.status}{c.statusDays ? ` · ${c.statusDays}d` : ''}</Chip>}>
      <div className="r-rel">
        <Meter value={c.loyalty} tone="green" label="Loyalty" />
        <Meter value={c.xp} max={100 * c.level} tone="gold" label={`Level ${c.level}`} right={`${c.xp}/${100 * c.level}`} />
      </div>
      <p className="r-note">{where}. Paid {fmt(c.cut)} a day.</p>
      <div className="r-assign">
        {a && a.kind !== 'job' && <Do action={{ type: 'assign', npcId: n.id, assignment: null }} label="Stand down" small />}
        <Do action={{ type: 'assign', npcId: n.id, assignment: { kind: 'guard', blockId: w.player.blockId } }} label={`Guard ${w.blocks[w.player.blockId].name}`} icon="guard" small />
        {unminded.slice(0, 4).map(r => <Do key={r.id} action={{ type: 'assign', npcId: n.id, assignment: { kind: 'racket', racketId: r.id } }} label={`Run ${r.kind.replace(/_/g, ' ')} at ${w.businesses[r.businessId].name}`} icon={r.kind} small />)}
        {w.player.safehouseIds.flatMap(sid => w.safehouses[sid].labs.filter(l => !l.workerId).map(l => <Do key={l.id} action={{ type: 'assign', npcId: n.id, assignment: { kind: 'lab', labId: l.id } }} label={`Work the ${l.kind} at ${w.safehouses[sid].name}`} icon="production" small />))}
        {districts.map(d => <Do key={d} action={{ type: 'assign', npcId: n.id, assignment: { kind: 'district', districtId: d } }} label={`Lieutenant over ${w.districts[d].name}`} icon="lieutenant" small />)}
      </div>
      {a?.kind === 'district' && <Do action={{ type: 'audit', npcId: n.id }} label={`Go through the books (${select.auditOdds(w, n)}% to catch a skim)`} icon="note" block sub="A lieutenant with a hand in the till makes the whole district arrive light. Checking costs them a little loyalty either way." />}
      <p className="r-over">What they carry</p>
      <KitList who={n.id} />
      <Do action={{ type: 'fire', npcId: n.id }} label="Let them go" kind="danger" small confirm="Tap again to let them go" />
    </Section>
  );
}
