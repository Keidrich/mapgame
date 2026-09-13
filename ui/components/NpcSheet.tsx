import { useState } from 'react';
import { select } from '@sim/index';
import type { Assignment, Id, World } from '@sim/types';
import { PRODUCTION_DEFS, RACKET_DEFS, RECIPES, TRAIT_LABELS } from '@content/rackets';
import { assignmentLabel, cap, fmtMoney, initials, playerRackets, playerSafehouses, roleLabel } from '@ui/derive';
import { openSheet, useWorld } from '@ui/store';
import { Sheet } from './Sheet';
import { Meter, RelMeters, SkillBars } from './Meter';
import { Act, AmountPicker, Disclosure, SceneAct } from './Act';
import { Info, Term, TermChip } from './Info';
import { AwayNotice } from './Walk';

export function NpcSheet({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const n = w.npcs[npcId];
  if (!n) return null;
  const where = select.npcLocation(w, n);
  const home = w.blocks[n.homeBlockId];
  const faction = n.faction ? w.factions[n.faction] : undefined;
  const [gift, setGift] = useState(500);
  const [bribe, setBribe] = useState(1000);
  const canRecruit = (n.role === 'patron' || n.role === 'owner') && !n.crew;

  return (
    <Sheet title={n.name} subtitle={`${roleLabel(n)}${faction ? ` · ${faction.name}` : ''}${!n.alive ? ' · deceased' : ''}`} icon={<span className="avatar" style={{ color: faction?.color }}>{initials(n.name)}</span>} accent={faction?.color}>
      <div className="chips">
        {select.isKnown(n)
          ? n.traits.map(t => <TermChip key={t} id={`trait:${t}`}>{TRAIT_LABELS[t] ?? t}</TermChip>)
          : <TermChip id="known"><span className="muted">Traits unknown</span></TermChip>}
        <TermChip id="relLabel" title="How they see you" body={relBlurb(n)}>{select.relLabel(n)}</TermChip>
        {select.isHeld(n) && <TermChip id="hostage" tone="var(--red)">Held by you</TermChip>}
        {n.grudge && <TermChip id="grudge" tone="var(--red)">Holds a grudge</TermChip>}
        {n.homeBlockId === w.player.homeBlockId && <TermChip id="homeTurf" tone="var(--gold)">Home turf</TermChip>}
        {select.agendaLabel(n) && <TermChip id="agenda" tone="var(--blue)">{select.agendaLabel(n)}</TermChip>}
        {select.caseWitnessOf(w, n.id) && <TermChip id="witness" tone="var(--red)">Witness: {select.caseWitnessOf(w, n.id)!.title}</TermChip>}
        {n.recipe && select.isKnown(n) && RECIPES[n.recipe] && (
          <TermChip id="recipeKnown" tone="var(--gold)" note={`${RECIPES[n.recipe].label}: ${RECIPES[n.recipe].blurb}`}>
            {n.crew ? `Knows ${RECIPES[n.recipe].label}` : `Knows a recipe: ${RECIPES[n.recipe].label}`}
          </TermChip>
        )}
        {n.official && <TermChip id="corruption">Corruption {n.official.corruption}</TermChip>}
        {n.official?.boughtBy && <TermChip id="boughtBy" tone={select.factionColor(w, n.official.boughtBy)}>Bought by {select.factionName(w, n.official.boughtBy)}</TermChip>}
      </div>
      <div className="mt12"><SkillBars skills={n.skills} /></div>
      <div className="mt12"><RelMeters rel={n.rel} /></div>
      <dl className="kv mt12">
        <dt><Term id="findAt">Find at</Term></dt>
        <dd>{where ? <button type="button" className="chip btn" onClick={() => openSheet({ kind: 'business', businessId: where.id })}>{where.name}</button> : home ? <button type="button" className="chip btn" onClick={() => openSheet({ kind: 'block', blockId: home.id })}>{home.name}</button> : '—'}</dd>
        {faction && <><dt><Term id="stance">Faction</Term></dt><dd style={{ color: faction.color }}>{faction.name} ({cap(select.stanceWithPlayer(w, faction.id))})</dd></>}
        <dt><Term id="nerve">Nerve</Term></dt><dd>{select.isKnown(n) ? n.nerve : '?'}</dd>
      </dl>
      <Connections npcId={npcId} />
      {n.notes.length > 0 && <ul className="small muted mt8" style={{ paddingLeft: 18, margin: 0 }}>{n.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}

      {n.crew && <CrewSection npcId={npcId} />}

      <AwayNotice blockId={select.npcReachBlock(w, n)} what={n.name} />
      <div className="section-title">Actions<Info id="odds" /></div>
      <div className="actions">
        {!select.isKnown(n) && n.alive && <Act action={{ type: 'read', npcId }} label="Size them up" icon="🧐" />}
        <SceneAct scene={{ kind: 'visit', npcId }} label="Visit" icon="🤝" />
        <SceneAct scene={{ kind: 'threaten', npcId }} label="Threaten" icon="😠" kind="danger" />
        <Disclosure label="Gift" icon="🎁">
          <AmountPicker presets={[100, 500, 2000]} value={gift} onChange={setGift} min={1} />
          <div className="mt8"><Act action={{ type: 'gift', npcId, amount: gift }} label={`Give ${fmtMoney(gift)}`} kind="primary" block /></div>
        </Disclosure>
        {canRecruit && <SceneAct scene={{ kind: 'recruit', npcId }} label="Recruit" icon="🧢" kind="primary" />}
        {n.role === 'fixer' && n.alive && <FixerAct npcId={npcId} />}
        {n.official && (
          <Disclosure label={`Bribe the ${n.official.kind}`} icon="💼" kind="primary">
            <p className="small muted">{OFFICIAL_BLURB[n.official.kind]}</p>
            <AmountPicker presets={[1000, 2500, 5000, 10000]} value={bribe} onChange={setBribe} min={1} />
            <div className="mt8"><Act action={{ type: 'bribe_official', npcId, amount: bribe }} label={`Pay ${fmtMoney(bribe)}`} kind="primary" block /></div>
          </Disclosure>
        )}
      </div>
    </Sheet>
  );
}

/**
 * A fixer washes dirty money for a cut. Worse than your own laundering racket and capped
 * by the day, both improving with trust — the bridge until you can afford the real thing.
 */
function FixerAct({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const [amount, setAmount] = useState(500);
  const n = w.npcs[npcId];
  if (!n) return null;
  const rate = select.fixerRate(n.rel.trust);
  const cap = select.fixerCapToday(w, n);
  const left = select.fixerCapLeft(w, n);
  const back = Math.round(Math.min(amount, left, w.player.dirty) * rate);
  return (
    <Disclosure label="Wash money" icon="🧼" kind="primary">
      <p className="small muted">
        {Math.round(rate * 100)} cents on the dollar, up to {fmtMoney(cap)} a day — {fmtMoney(left)} left today.
        Both get better as {n.name.split(' ')[0]} comes to trust you, and neither ever matches a <Term id="laundering">laundering racket</Term> of your own.
      </p>
      <p className="small muted"><Term id="dirty">Dirty</Term> {fmtMoney(w.player.dirty)} on hand.</p>
      <AmountPicker presets={[250, 500, 1000, Math.max(1, Math.min(left, Math.floor(w.player.dirty)))]} value={amount} onChange={setAmount} min={1} />
      <div className="mt8"><Act action={{ type: 'launder_with_fixer', npcId, amount }} label={`Wash ${fmtMoney(amount)} → ${fmtMoney(back)} clean`} kind="primary" block /></div>
    </Disclosure>
  );
}

/** Who they have behind them: family first, then old friends. Tap through to any of them. */
function Connections({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const n = w.npcs[npcId];
  const ties = n ? select.connectionsOf(w, n) : [];
  if (!n || !ties.length) return null;
  // who somebody has is the same kind of knowledge as their nerve: you learn it by looking
  if (!select.isKnown(n)) return (
    <>
      <div className="section-title">People<Info id="connections" /></div>
      <p className="small muted" style={{ margin: '8px 0 0' }}>They have people. Size them up to find out who.</p>
    </>
  );
  const family = ties.filter(t => t.kind === 'family');
  const friends = ties.filter(t => t.kind === 'friend');
  const line = (label: string, list: typeof ties) => list.length ? (
    <p className="small" style={{ margin: '8px 0 0' }}>
      <span className="muted">{label}: </span>
      {list.map((t, i) => (
        <span key={t.npc.id}>
          {i > 0 && ', '}
          <button type="button" className="linkish" onClick={() => openSheet({ kind: 'npc', npcId: t.npc.id })}>{t.npc.name}</button>
          <span className="muted"> ({t.label}){whereBlurb(w, t.npc)}</span>
        </span>
      ))}
      .
    </p>
  ) : null;
  return (
    <>
      <div className="section-title">People<Info id="connections" /></div>
      {line('Family', family)}
      {line('Friends', friends)}
    </>
  );
}
/** ", runs Casa Roma on Mott St" — where you would actually find them. */
function whereBlurb(w: World, npc: { id: Id; homeBlockId: Id }): string {
  const biz = Object.values(w.businesses).find(b => b.ownerId === npc.id);
  const block = w.blocks[npc.homeBlockId];
  if (biz) return `, runs ${biz.name}${block ? ` on ${block.name}` : ''}`;
  return block ? `, around ${block.name}` : '';
}

/** The one-word relationship label means different things at different trust and fear. */
function relBlurb(n: { rel: { trust: number; fear: number; respect: number } }): string {
  const { trust, fear } = n.rel;
  return `Trust ${trust}, fear ${fear}, respect ${n.rel.respect}. Warm people do favours and join your crew; frightened people pay but look for a way out. Both together is the strongest hold there is.`;
}

const OFFICIAL_BLURB: Record<string, string> = {
  captain: 'Heat cools faster and you hear about raids before they land.',
  councillor: 'Permits: cheaper purchases and rivals get blocked.',
  judge: 'Your people walk out of the cells sooner.',
};

function CrewSection({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const n = w.npcs[npcId];
  const c = n?.crew;
  if (!n || !c) return null;
  const options: { label: string; a: Assignment }[] = [];
  for (const r of playerRackets(w)) if (!r.runnerId || r.runnerId === npcId) options.push({ label: `${RACKET_DEFS[r.kind].icon} ${RACKET_DEFS[r.kind].label} at ${w.businesses[r.businessId]?.name ?? '?'}`, a: { kind: 'racket', racketId: r.id } });
  for (const sh of playerSafehouses(w)) for (const pid of sh.productionIds) { const p = w.productions[pid]; if (p && (!p.workerId || p.workerId === npcId)) options.push({ label: `${PRODUCTION_DEFS[p.kind].icon} ${PRODUCTION_DEFS[p.kind].label} at ${sh.name}`, a: { kind: 'production', productionId: pid } }); }
  for (const b of select.playerBlocks(w)) options.push({ label: `🛡️ Guard ${b.name}`, a: { kind: 'guard', blockId: b.id } });
  options.push({ label: '💰 Collect', a: { kind: 'collect' } });
  for (const d of select.districtsRunnable(w)) { const cur = select.lieutenantOf(w, d.id); if (!cur || cur.id === npcId) options.push({ label: `⭐ Run ${d.name}`, a: { kind: 'lieutenant', districtId: d.id } }); }
  const [pick, setPick] = useState(0);
  const picked = options[pick]?.a;
  const lt = c.assignment?.kind === 'lieutenant' ? w.districts[c.assignment.districtId] : undefined;
  const ltIncome = lt ? select.districtIncome(w, lt) : 0;
  return (
    <>
      <div className="section-title">Crew</div>
      <div className="card gold">
        <div className="row between">
          <TermChip id="crewStatus" className={`s-${c.status}`}>{c.status}{c.statusDays > 0 && ` (${c.statusDays}d)`}</TermChip>
          <span className="small muted"><Term id="cut">Cut</Term> {fmtMoney(c.cut)}/day · since day {c.joinedDay}</span>
        </div>
        <div className="mt8"><Meter label={<Term id="loyalty">Loyalty</Term>} value={c.loyalty} color="var(--gold)" /></div>
        <p className="small mt8"><Term id="assignment">{assignmentLabel(w, c.assignment)}</Term></p>
        {lt && (
          <div className="card mt8">
            <div className="row between"><b>⭐ <Term id="lieutenant">Lieutenant</Term>, {lt.name}</b><span className="small muted">{fmtMoney(ltIncome)}/day from rackets there</span></div>
            <p className="small muted mt8">Covers rackets with no runner, runs off rival muscle, firms up your blocks. Costs more. The book is theirs to keep, honestly or not.</p>
            <div className="mt8"><Act action={{ type: 'audit', npcId }} label="Go over the books" icon="📒" block /><Info id="audit" /></div>
          </div>
        )}
        {c.status !== 'dead' && (
          <div className="mt8">
            <label className="field"><Term id="assignment">Assignment</Term></label>
            <select className="select" value={pick} onChange={e => setPick(Number(e.target.value))}>
              {options.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
            </select>
            {picked?.kind === 'lieutenant' && <p className="small muted mt8">Needs loyalty 50, five days in the crew, and some muscle, brains and charm between them. Their cut goes up by half.</p>}
            <div className="row mt8">
              <div className="grow"><Act action={{ type: 'assign', npcId, assignment: options[pick]?.a }} label="Assign" kind="primary" block /></div>
              {c.assignment && <Act action={{ type: 'assign', npcId }} label="Unassign" kind="ghost" />}
            </div>
          </div>
        )}
        <div className="mt8"><Act action={{ type: 'fire', npcId }} label="Fire" icon="🚪" kind="danger" confirm={`Fire ${n.name}?`} /></div>
      </div>
    </>
  );
}
