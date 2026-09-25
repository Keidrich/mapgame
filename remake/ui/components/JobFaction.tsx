import { useState } from 'react';
import { APPROACH_INFO, JOBS, SPECIALISTS, STYLES } from '@r/content/world';
import { select, type Id } from '@r/sim/index';
import type { Approach, Job, SpecialistKind } from '@r/sim/types';
import { Face } from './Faces';
import { ALL_ICONS, Icon } from '@ui/icons';
import type { Action } from '@r/sim/index';
import { can } from '@r/sim/index';
import { openSheet, useWorld } from '../store';
import { Emblem, NpcFace } from './Faces';
import { mute } from './tone';
import { Chip, Dial, Do, Empty, Row, Section, Sheet, fmt } from './kit';

const JOB_ICON: Record<string, string> = { burglary: 'lockpicks', robbery: 'robbery', heist: 'heist_bank', hijack: 'hijack_load', hit: 'hit', kidnap: 'kidnap', arson: 'arson_hire', sabotage: 'war_strike', con: 'long_con', fraud: 'check_kiting', hack: 'hack', smuggle: 'smuggle_run', raid: 'raid_rival', frame: 'frame', setpiece: 'crown' };
/** The catalogue's kinds share the original's op ids, and so its icons. */
export const kindIcon = (k: string) => JOB_ICON[k] ?? (ALL_ICONS[k] ? k : 'ops');
export const jobIcon = (j: Job) => kindIcon(j.kind);

/**
 * Every job a target could carry, as buttons: the ones you can case now first, then — folded away —
 * the ones you are not ready for, each with the reason. Used on places, people, streets and files.
 */
export function CaseSection({ target, title = 'Case it', note, only }: { target: { businessId?: Id; npcId?: Id; blockId?: Id; caseId?: Id }; title?: string; note?: string; only?: (k: string) => boolean }) {
  const w = useWorld();
  const [more, setMore] = useState(false);
  const kinds = select.caseKinds(w, target).filter(k => k !== 'setpiece' && (!only || only(k)));
  if (!kinds.length) return null;
  const act = (k: typeof kinds[number]): Action => ({ type: 'case', kind: k, ...target });
  const ready = kinds.filter(k => can(w, act(k)).ok || /action points|Deal with|waiting on/.test(can(w, act(k)).why ?? '')).sort((a, b) => JOBS[a].tier - JOBS[b].tier);
  const locked = kinds.filter(k => !ready.includes(k));
  return (
    <Section title={title} right={<span className="r-note">{ready.length} of {kinds.length}</span>}>
      <p className="r-note">{note ?? 'Spend an hour on it, and put a job on your board.'}</p>
      <div className="r-inline-actions">{ready.map(k => <Do key={k} action={act(k)} label={JOBS[k].label} icon={kindIcon(k)} small />)}</div>
      {locked.length > 0 && <button type="button" className="r-link" onClick={() => setMore(m => !m)}>{more ? 'Hide' : `${locked.length} more you are not ready for`}</button>}
      {more && <ul className="r-factors">{locked.map(k => <li key={k}><span>{JOBS[k].label}</span><b className="neg">{can(w, act(k)).why}</b></li>)}</ul>}
    </Section>
  );
}

export function payoutLine(j: Job, approach?: Approach): string {
  const p = select.payoutFor(j, approach);
  const parts = [p.dirty ? `${fmt(p.dirty)} dirty` : '', p.clean ? `${fmt(p.clean)} clean` : '', p.goods ? `${p.goods} hot goods` : ''].filter(Boolean);
  if (j.setpiece && !parts.length) return j.setpiece.id === 'locker' ? 'Nothing in the bag — the paper on you burns' : 'Respect, and what it does';
  if (parts.length) return parts.join(' + ');
  if (j.kind === 'hit' || j.kind === 'frame' || j.kind === 'sabotage' || j.kind === 'arson') return 'Nothing in the bag — the point is what it does';
  // no money in it: say what it does pay, in the coin it pays (it said "Respect, mostly" for jobs that paid fear)
  const rep = [p.fear ? `fear +${p.fear}` : '', p.respect ? `respect +${p.respect}` : ''].filter(Boolean).join(', ');
  return rep ? `No money: ${rep}` : 'No money in it';
}

export function JobSheet({ id }: { id: string }) {
  const w = useWorld();
  const j = w.jobs[id];
  // an offer opens with the fewest people it needs already picked — the best at what it leans on,
  // free ones first — so "Take it on" is live the moment the sheet opens; a new player met a
  // greyed-out button and an empty list, and the tutorial's job step took them days
  const [pick, setPick] = useState<Id[]>(() => {
    if (!j || j.status !== 'offer' || !j.crewMin) return [];
    return select.crew(w).filter(n => n.crew!.status === 'ready' && n.crew!.assignment?.kind !== 'job')
      .sort((a, b) => Number(!!a.crew!.assignment) - Number(!!b.crew!.assignment) || j.leans.reduce((t, s) => t + b.skills[s] - a.skills[s], 0))
      .slice(0, j.crewMin).map(n => n.id);
  });
  if (!j) return <Sheet title="Gone"><Empty>That job is off the board.</Empty></Sheet>;
  const def = JOBS[j.kind];
  const src = j.sourceId ? w.npcs[j.sourceId] : undefined;
  const target = j.targetBusinessId ? w.businesses[j.targetBusinessId] : undefined;
  const tnpc = j.targetNpcId ? w.npcs[j.targetNpcId] : undefined;
  const fac = j.targetFaction ? w.factions[j.targetFaction] : undefined;
  const avail = select.crew(w).filter(n => n.crew!.status === 'ready' && (!n.crew!.assignment || n.crew!.assignment.kind !== 'job'));
  const team = j.status === 'offer' ? pick : j.crewIds;
  const toggle = (nid: Id) => setPick(p => (p.includes(nid) ? p.filter(x => x !== nid) : p.length >= j.crewMax ? p : [...p, nid]));
  return (
    <Sheet title={j.title} kicker={`${def.label} · tier ${j.tier} · ${w.blocks[j.blockId].name}`} art={<span className="r-bizicon big"><Icon name={jobIcon(j)} size={30} /></span>}>
      <p className="r-pitch">{src && <NpcFace n={src} size={28} />}<span>{j.pitch}</span></p>
      <div className="r-stats">
        <div><span>Take</span><b>{payoutLine(j, j.approach)}</b></div>
        <div><span>Crew</span><b>{j.crewMin ? `${j.crewMin}–${j.crewMax} + you` : `you, +${j.crewMax}`}</b></div>
        <div><span>Planning</span><b>{j.planDays ? `${j.planDays} day${j.planDays > 1 ? 's' : ''}` : 'none'}</b></div>
        {/* the heat as the approaches will bring it: the bare figure hid that loud is ×1.5 and a job gone wrong ×1.4 on top */}
        <div><span>Heat</span><b>{j.heat > 0 ? `+${Math.round(j.heat * APPROACH_INFO.quiet.heat)}–${Math.round(j.heat * APPROACH_INFO.loud.heat)}` : j.heat}</b></div>
      </div>
      <div className="r-chips">
        {target && <button type="button" className="r-chip link" onClick={() => openSheet({ kind: 'business', id: target.id })}>{target.name} · security {target.security}</button>}
        {tnpc && <button type="button" className="r-chip link" onClick={() => openSheet({ kind: 'person', id: tnpc.id })}>{select.fullName(tnpc)}</button>}
        {fac && <Chip tone="red"><Emblem e={fac.emblem} size={12} /> The {fac.short} will take it personally</Chip>}
        <Chip tone="muted">Leans on {j.leans.join(', ')}</Chip>
        {j.status !== 'offer' && j.status !== 'done' && j.status !== 'failed' && <Chip tone="gold">{j.status === 'planning' ? `Planning · ${j.daysLeft}d left` : j.status === 'ready' ? 'Ready' : 'Waiting on you'}</Chip>}
        {j.status === 'offer' && <Chip tone="muted">Off the board day {j.expires}</Chip>}
        {j.setpiece && <Chip tone="violet">{j.setpiece.stages} stages{j.setpiece.stage ? ` · on stage ${j.setpiece.stage}` : ''} — a call at every one</Chip>}
      </div>

      {j.result && <div className={`r-callout ${j.result.success ? '' : 'dark'}`}><b>{j.result.success ? 'Done.' : 'It went wrong.'}</b> {j.result.text}</div>}

      {j.status === 'offer' && (
        <Section title="Who goes" right={<span className="r-note">{pick.length}/{j.crewMax}{j.crewMin ? ` · at least ${j.crewMin}` : ''}</span>}>
          {avail.length ? avail.map(n => (
            <button type="button" key={n.id} className={`r-pickrow${pick.includes(n.id) ? ' on' : ''}`} onClick={() => toggle(n.id)} aria-pressed={pick.includes(n.id)}>
              <NpcFace n={n} size={30} />
              <span className="grow"><b>{select.fullName(n)}</b><span className="r-row-sub">{j.leans.map(s => `${s} ${n.skills[s]}`).join(' · ')}{n.crew!.assignment ? ' · pulled off their post' : ''}</span></span>
              <span className="r-check">{pick.includes(n.id) ? '✓' : ''}</span>
            </button>
          )) : <Empty>{j.crewMin ? 'Nobody free. Recruit, or pull somebody off a post.' : 'You can do this one alone.'}</Empty>}
        </Section>
      )}

      {(j.status === 'ready' || j.status === 'planning') && j.crewIds.length < j.crewMax && avail.length > 0 && (
        <Section title="Short a pair of hands?" right={<span className="r-note">{j.crewIds.length}/{j.crewMax}</span>}>
          {avail.map(n => <Row key={n.id} left={<NpcFace n={n} size={28} />} title={select.fullName(n)} sub={j.leans.map(s => `${s} ${n.skills[s]}`).join(' · ')} right={<Do action={{ type: 'join_job', jobId: j.id, npcId: n.id }} label="Send them" small />} />)}
        </Section>
      )}
      {(j.status === 'offer' || j.status === 'ready' || j.status === 'planning') && (
        <Section title={j.status === 'offer' ? 'How it would go' : 'Go'}>
          {def.approaches.map(a => {
            const o = select.jobOdds(w, j, team, a);
            return (
              <div key={a} className="r-approach">
                <div className="r-approach-head">
                  <b>{APPROACH_INFO[a].label}</b>
                  <span className={`r-odds ${o.chance >= 65 ? 'good' : o.chance >= 40 ? 'mid' : 'bad'}`}>{o.chance}%</span>
                  <span className="r-note grow">{APPROACH_INFO[a].blurb} Take: {payoutLine(j, a).replace(/^./, c => c.toLowerCase())}. Heat +{Math.round(j.heat * APPROACH_INFO[a].heat)}, +{Math.round(j.heat * APPROACH_INFO[a].heat * 1.4)} if it goes wrong.</span>
                </div>
                <ul className="r-factors">{[{ label: 'Where it starts', n: o.chance - o.factors.reduce((t, f) => t + f.n, 0) }, ...o.factors].map((f, i) => <li key={i}><span>{f.label}</span><b className={f.n >= 0 ? 'pos' : 'neg'}>{f.n >= 0 && i ? '+' : ''}{f.n}</b></li>)}</ul>
                {j.status !== 'offer' && <Do action={{ type: 'launch_job', jobId: j.id, approach: a }} label={`Go in ${APPROACH_INFO[a].label.toLowerCase()}`} kind="primary" block />}
              </div>
            );
          })}
          {j.status === 'offer' && <Do action={{ type: 'take_job', jobId: j.id, crewIds: pick }} label="Take it on" kind="primary" block sub={j.planDays ? `They spend ${j.planDays} day${j.planDays > 1 ? 's' : ''} planning; every day planned helps.` : 'Ready to go straight away.'} />}
          {j.status !== 'offer' && <Do action={{ type: 'drop_job', jobId: j.id }} label="Call it off" kind="ghost" small />}
        </Section>
      )}
      {(j.status === 'planning' || j.status === 'ready') && (
        <Section title="A specialist" right={<span className="r-note">through the fixer</span>}>
          {j.specialist ? <Row left={<Face seed={j.specialist.face} size={36} />} title={`${j.specialist.name}, ${SPECIALISTS[j.specialist.kind].label.toLowerCase()}`} sub={`${j.specialist.skill} ${j.specialist.level} for this job · paid ${fmt(j.specialist.fee)}`} />
            : <>
              <p className="r-note">Somebody better than anybody you have, for this job only. Paid up front, win or lose.</p>
              {(Object.keys(SPECIALISTS) as SpecialistKind[]).filter(k => j.leans.includes(SPECIALISTS[k].skill)).map(k => <Do key={k} action={{ type: 'hire_specialist', jobId: j.id, kind: k }} label={`Hire a ${SPECIALISTS[k].label.toLowerCase()} (${SPECIALISTS[k].skill})`} sub={SPECIALISTS[k].blurb} block />)}
            </>}
        </Section>
      )}
      {team.length > 0 && j.status !== 'offer' && <Section title="The team">{team.map(nid => { const n = w.npcs[nid]; return n ? <Row key={nid} onClick={() => openSheet({ kind: 'person', id: nid })} left={<NpcFace n={n} size={30} />} title={select.fullName(n)} sub={j.leans.map(s => `${s} ${n.skills[s]}`).join(' · ')} /> : null; })}</Section>}
    </Sheet>
  );
}

export function FactionSheet({ id }: { id: string }) {
  const w = useWorld();
  const f = w.factions[id];
  const boss = w.npcs[f.bossId];
  const stance = select.stanceOf(f, w.day);
  const blocks = select.factionBlocks(w, id).length;
  return (
    <Sheet title={f.name} kicker={`${STYLES[f.style].label} · ${f.temperament} · ${w.districts[f.homeDistrictId]?.name}`} art={<Emblem e={f.emblem} size={56} />}>
      <div className="r-chips">
        {!f.alive && <Chip tone="red">Finished</Chip>}
        <Chip tone={stance === 'war' || stance === 'beef' ? 'red' : stance === 'allied' ? 'green' : 'muted'}>{select.STANCE_LABEL[stance]}</Chip>
        {f.truceUntil && f.truceUntil > w.day ? <Chip tone="blue">Truce until day {f.truceUntil}</Chip> : null}
        <Chip tone="muted">{blocks} blocks · {f.soldiers} soldiers · {f.cash > 50000 ? 'rich' : f.cash > 15000 ? 'comfortable' : f.cash > 0 ? 'getting by' : 'broke'}</Chip>
      </div>
      <Dial value={f.standing} label="How they feel about you" />
      <p className="r-note">Above +50 you are allies; down to −10 it is peace. Below −30 it is beef — they wreck rackets and take places off you. Below −55 it is war, and somebody will come for you personally.</p>
      {f.grievances.length > 0 && <Section title="What they hold against you">{f.grievances.map((g, i) => <p key={i} className="r-memory">{g}</p>)}</Section>}
      <Section title="The people">
        {boss && <Row onClick={() => openSheet({ kind: 'person', id: boss.id })} left={<NpcFace n={boss} size={40} tint={`${mute(f.color)}66`} />} title={select.fullName(boss)} sub="Boss" />}
        {f.lieutenantIds.map(lid => { const n = w.npcs[lid]; return n ? <Row key={lid} onClick={() => openSheet({ kind: 'person', id: lid })} left={<NpcFace n={n} size={32} tint={`${mute(f.color)}44`} />} title={select.fullName(n)} sub={n.alive ? 'Lieutenant' : 'Dead'} /> : null; })}
      </Section>
      {f.alive && (
        <Section title="Talk to them">
          <div className="r-inline-actions">
            {[500, 1500, 5000].map(a => <Do key={a} action={{ type: 'tribute', factionId: id, amount: a }} label={`Send ${fmt(a)}`} small sub={`standing +${select.tributeEffect(f, a, w)}`} />)}
          </div>
          {(['truce', 'split', 'alliance'] as const).map(o => { const q = select.sitDownOdds(w, f, o); return <Do key={o} action={{ type: 'sit_down', factionId: id, offer: o }} label={`Sit down: ${o === 'truce' ? 'a truce' : o === 'split' ? 'split the difference' : 'an alliance'} (${q.chance}%)`} sub={q.text} block />; })}
          <Do action={{ type: 'declare_war', factionId: id }} label="Declare war" kind="danger" block confirm="Tap again: this is war" sub="Their standing drops to war. Your name grows; so does the danger." />
        </Section>
      )}
    </Sheet>
  );
}
