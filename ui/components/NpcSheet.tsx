import { useState } from 'react';
import { select } from '@sim/index';
import type { Assignment, Id } from '@sim/types';
import { PRODUCTION_DEFS, RACKET_DEFS, RECIPES, TRAIT_LABELS } from '@content/rackets';
import { assignmentLabel, cap, fmtMoney, initials, playerRackets, playerSafehouses, roleLabel } from '@ui/derive';
import { openSheet, useWorld } from '@ui/store';
import { Sheet } from './Sheet';
import { Meter, RelMeters, SkillBars } from './Meter';
import { Act, AmountPicker, Disclosure, SceneAct } from './Act';
import { Info, Term, TermChip } from './Info';
import { AwayNotice } from './Walk';
import { NoteEditor } from './Note';
import { LedgerPanel } from './Ledger';
import { whereabouts } from './SocialTab';
import { Icon, IconTile } from '@ui/icons';

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
          : <TermChip id={n.hint ? 'cased' : 'known'}><span className="muted">{n.hint ?? 'Traits unknown'}</span></TermChip>}
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
        {select.isNemesis(n) && <TermChip id="nemesis" tone="var(--red)">Has had the better of you {n.nemesis!.wins}×</TermChip>}
        {n.official && <TermChip id="corruption">Corruption {n.official.corruption}</TermChip>}
        {n.official?.boughtBy && <TermChip id="boughtBy" tone={select.factionColor(w, n.official.boughtBy)}>Bought by {select.factionName(w, n.official.boughtBy)}</TermChip>}
      </div>
      <div className="mt12"><SkillBars skills={n.skills} /></div>
      <div className="mt12"><RelMeters rel={n.rel} /></div>
      <Standing npcId={npcId} />
      <AgendaActions npcId={npcId} />
      <StandingPlays npcId={npcId} />
      <dl className="kv mt12">
        <dt><Term id="findAt">Find at</Term></dt>
        <dd>{where ? <button type="button" className="chip btn" onClick={() => openSheet({ kind: 'business', businessId: where.id })}>{where.name}</button> : home ? <button type="button" className="chip btn" onClick={() => openSheet({ kind: 'block', blockId: home.id })}>{home.name}</button> : '—'}</dd>
        {faction && <><dt><Term id="stance">Faction</Term></dt><dd style={{ color: faction.color }}>{faction.name} ({cap(select.stanceWithPlayer(w, faction.id))})</dd></>}
        <dt><Term id="nerve">Nerve</Term></dt><dd>{select.isKnown(n) ? n.nerve : '?'}</dd>
      </dl>
      {n.playerNote && (
        <div className="card mt12" style={{ borderColor: 'var(--gold)' }}>
          <b className="small gold"><Icon name="note" size={13} /> Your note</b>
          <p className="small" style={{ margin: '4px 0 0' }}>{n.playerNote}</p>
        </div>
      )}
      <TapPanel npcId={npcId} />
      <LedgerPanel npcId={npcId} collapsed />
      <Connections npcId={npcId} />
      {/* the sim's own flavour, kept separate from the player's note above */}
      {n.notes.length > 0 && <ul className="small muted mt8" style={{ paddingLeft: 18, margin: 0 }}>{n.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      <Disclosure label={n.playerNote ? 'Edit your note' : 'Make a note'} icon="note"><NoteEditor npcId={npcId} /></Disclosure>

      {n.crew && <CrewSection npcId={npcId} />}

      <AwayNotice blockId={select.npcReachBlock(w, n)} what={n.name} />
      <div className="section-title">Actions<Info id="odds" /></div>
      <div className="actions">
        {!select.isKnown(n) && n.alive && <Act action={{ type: 'read', npcId }} label="Size them up" icon="search" />}
        <SceneAct scene={{ kind: 'visit', npcId }} label="Visit" icon="crew" />
        <SceneAct scene={{ kind: 'threaten', npcId }} label="Threaten" icon="intimidate" kind="danger" />
        <Disclosure label="Gift" icon="gift">
          <AmountPicker presets={[100, 500, 2000]} value={gift} onChange={setGift} min={1} />
          <div className="mt8"><Act action={{ type: 'gift', npcId, amount: gift }} label={`Give ${fmtMoney(gift)}`} kind="primary" block /></div>
        </Disclosure>
        {canRecruit && <SceneAct scene={{ kind: 'recruit', npcId }} label="Recruit" icon="person" kind="primary" />}
        {n.role === 'fixer' && n.alive && <FixerAct npcId={npcId} />}
        {n.official && (
          <Disclosure label={`Bribe the ${n.official.kind}`} icon="collect" kind="primary">
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
    <Disclosure label="Wash money" icon="laundering" kind="primary">
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
/**
 * A tap you have left running on somebody, and the one decision it asks: how long to leave it.
 * The risk shown is the real number `tapRisk` rolls against, and it climbs every day — pulling it
 * costs nothing, which is deliberate: getting out should never be the part you think twice about.
 */
function TapPanel({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const n = w.npcs[npcId];
  if (!n?.tap) {
    if (!n?.ratted) return null;
    return <p className="tiny muted mt8"><Icon name="rat" size={12} /> You have been inside their business. <Term id="ratted">That is what wire fraud reads.</Term></p>;
  }
  const days = select.daysTapped(w, n);
  const risk = Math.round(select.tapRisk(w, n) * 100);
  return (
    <div className="card mt12" style={{ borderColor: risk >= 25 ? 'var(--red)' : 'var(--gold)' }}>
      <div className="row between">
        <b className="small"><Icon name="rat" size={13} /> You are listening<Info id="tap" /></b>
        <span className={`chip ${risk >= 25 ? 'red' : ''}`}>{risk}% a day they find it</span>
      </div>
      <p className="small muted mt8" style={{ margin: '8px 0 0' }}>
        {days === 0 ? 'Went on today.' : `Running ${days} day${days === 1 ? '' : 's'}.`} Every day it runs is a day it is likelier to be found,
        and being found costs you everything they thought of you.
      </p>
      <div className="mt8"><Act action={{ type: 'pull_tap', npcId }} label="Take it off" icon="cross" kind="ghost" block /></div>
    </div>
  );
}

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
          <span className="muted"> ({t.label}), {whereabouts(w, t.npc).toLowerCase()}</span>
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
  const options: { label: string; a: Assignment; ico: string }[] = [];
  for (const r of playerRackets(w)) if (!r.runnerId || r.runnerId === npcId) options.push({ label: `${RACKET_DEFS[r.kind].label} at ${w.businesses[r.businessId]?.name ?? '?'}`, a: { kind: 'racket', racketId: r.id }, ico: r.kind });
  for (const sh of playerSafehouses(w)) for (const pid of sh.productionIds) { const p = w.productions[pid]; if (p && (!p.workerId || p.workerId === npcId)) options.push({ label: `${PRODUCTION_DEFS[p.kind].label} at ${sh.name}`, a: { kind: 'production', productionId: pid }, ico: p.kind }); }
  for (const b of select.playerBlocks(w)) options.push({ label: `Guard ${b.name}`, a: { kind: 'guard', blockId: b.id }, ico: 'guard' });
  options.push({ label: 'Collect', a: { kind: 'collect' }, ico: 'collect' });
  options.push({ label: 'On the wire (work the cards)', a: { kind: 'hack' }, ico: 'hack' });
  // a foreman is the production assignment with its head up: recipe, ingredients and output
  for (const sh of playerSafehouses(w)) for (const pid of sh.productionIds) {
    const pr = w.productions[pid]; if (!pr) continue;
    const taken = select.foremanOf(w, pid);
    if (!taken || taken.id === npcId) options.push({ label: `Run the ${PRODUCTION_DEFS[pr.kind].label.toLowerCase()} at ${sh.name}`, a: { kind: 'foreman', productionId: pid }, ico: 'foreman' });
  }
  for (const d of select.districtsRunnable(w)) { const cur = select.lieutenantOf(w, d.id); if (!cur || cur.id === npcId) options.push({ label: `Run ${d.name}`, a: { kind: 'lieutenant', districtId: d.id }, ico: 'lieutenant' }); }
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
            <div className="row between"><b><Icon name="lieutenant" size={13} /> <Term id="lieutenant">Lieutenant</Term>, {lt.name}</b><span className="small muted">{fmtMoney(ltIncome)}/day from rackets there</span></div>
            <p className="small muted mt8">Covers rackets with no runner, runs off rival muscle, firms up your blocks. Costs more. The book is theirs to keep, honestly or not.</p>
            <div className="mt8"><Act action={{ type: 'audit', npcId }} label="Go over the books" icon="accountant" block /><Info id="audit" /></div>
          </div>
        )}
        {c.status !== 'dead' && (
          <div className="mt8">
            <label className="field"><Term id="assignment">Assignment</Term></label>
            {/* a native select cannot hold a drawing, so the icon for what is picked sits beside it */}
            <div className="row">
              <IconTile name={options[pick]?.ico ?? 'crew'} size={40} tone="gold" />
              <select className="select grow" value={pick} onChange={e => setPick(Number(e.target.value))}>
                {options.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
              </select>
            </div>
            {picked?.kind === 'lieutenant' && <p className="small muted mt8">Needs loyalty 50, five days in the crew, and some muscle, brains and charm between them. Their cut goes up by half.</p>}
            {picked?.kind === 'foreman' && <p className="small muted mt8">They keep it on the best recipe you know, buy ingredients when it runs dry, and move the output somewhere with room — without being asked. They count as the worker too.</p>}
            {picked?.kind === 'hack' && <p className="small muted mt8">They work the card pile all day and hand over most of what it makes — nothing in your handwriting, but a little wire heat every day. They will not bother unless you are holding at least three live cards. Tech is what makes them worth it.</p>}
            <div className="row mt8">
              <div className="grow"><Act action={{ type: 'assign', npcId, assignment: options[pick]?.a }} label="Assign" kind="primary" block /></div>
              {c.assignment && <Act action={{ type: 'assign', npcId }} label="Unassign" kind="ghost" />}
            </div>
          </div>
        )}
        <div className="mt8"><Act action={{ type: 'fire', npcId }} label="Fire" icon="spring_crew" kind="danger" confirm={`Fire ${n.name}?`} /></div>
      </div>
    </>
  );
}

/**
 * Where you stand with somebody, past the three bars. These are the things that decide whether
 * a real ask lands, and before this panel they were invisible: a player who kept being told
 * "that is not a reason to hand you a third of the till" had nowhere to look to find out why.
 */
function Standing({ npcId }: { npcId: string }) {
  const w = useWorld();
  const n = w.npcs[npcId]; if (!n) return null;
  const days = select.daysKnown(w, n);
  const met = n.rel.metDay !== undefined;
  const owed = select.favours(n);
  const hold = select.leverageOver(w, n);
  return (
    <div className="chips mt8">
      <TermChip id="familiarity" tone={select.familiar(w, n) ? 'var(--green)' : undefined}>
        {!met ? 'Never dealt with them' : `Known ${days} day${days === 1 ? '' : 's'} · ${n.rel.contacts ?? 0} time${(n.rel.contacts ?? 0) === 1 ? '' : 's'}`}
      </TermChip>
      {owed > 0 && <TermChip id="favour" tone="var(--green)">Owes you {owed === 1 ? 'a favour' : `${owed} favours`}</TermChip>}
      {hold && <TermChip id="hold" tone="var(--gold)" note={hold.why}>You have a hold</TermChip>}
    </div>
  );
}

/**
 * Doing something about what they actually want.
 *
 * Only shows once the player has established the agenda — a size-up, a look through their books,
 * or a tap. The moves themselves come from `content/agendas.ts`; this only renders them, and the
 * odds and the price are the ones the reducer will use.
 */
function AgendaActions({ npcId }: { npcId: string }) {
  const w = useWorld();
  const n = w.npcs[npcId]; if (!n) return null;
  const moves = select.agendaMoves(w, n);
  if (!moves.length) return null;
  return (
    <>
      <div className="section-title">What they want<Info id="agendaMove" /></div>
      <p className="small muted">{select.agendaLabel(n)}{select.agendaTargetName(w, n) ? ` — ${select.agendaTargetName(w, n)}` : ''}. Settle it and they will owe you something real.</p>
      <div className="actions">
        {moves.map(m => {
          const cost = select.agendaCost(w, n, m.mode);
          return (
            <Act key={m.mode}
              action={{ type: 'resolve_agenda', npcId: n.id, mode: m.mode }}
              label={`${m.label}${cost ? ` · ${fmtMoney(cost)}` : ''} · ${select.agendaChance(w, n, m.mode)}%`}
              icon={m.icon}
              kind={m.mode === 'trap' ? 'danger' : 'primary'} />
          );
        })}
      </div>
    </>
  );
}

/**
 * The plays that need a real relationship behind them: a standing arrangement, an introduction,
 * and — for somebody else's lieutenant — walking out on their own people.
 *
 * All three are gated by the same `concessionReason` every other big ask goes through, so the
 * refusal a player reads here is the same sentence they read on a protection they cannot install.
 * Shown even when refused, because the refusal is the instruction.
 */
function StandingPlays({ npcId }: { npcId: Id }) {
  const w = useWorld();
  const n = w.npcs[npcId]; if (!n || n.crew) return null;
  const asset = n.asset;
  const refs = select.referrals(w, n).slice(0, 4);
  const canDefect = n.role === 'lieutenant' && n.faction && n.faction !== 'player';
  const why = { informant: select.assetReason(w, n, 'informant'), muscle: select.assetReason(w, n, 'muscle'), defect: canDefect ? select.defectReason(w, n) : 'x' };
  if (asset === undefined && why.informant && why.muscle && !refs.length && (!canDefect || why.defect)) {
    // nothing is on offer and nothing would be legible: say so once rather than show three
    // disabled buttons with the same sentence under each
    return <p className="small muted mt8">{select.concessionReason(w, n, 'anything standing') ?? 'Nothing standing to ask of them right now.'}</p>;
  }
  return (
    <>
      <div className="section-title">Standing arrangements<Info id="asset" /></div>
      {asset ? (
        <p className="small">
          <b className="green"><Icon name={asset.kind === 'informant' ? 'rat' : 'fist'} size={12} /> {asset.kind === 'informant' ? 'Your ears' : 'Your hands'}</b>{' '}
          since day {asset.since} · used {asset.used} time{asset.used === 1 ? '' : 's'}
          {asset.factionId && <> · hears around {select.factionName(w, asset.factionId)}</>}
          {select.goneCold(w, n) && <span className="orange"> · gone quiet; ask them for something</span>}
        </p>
      ) : (
        <div className="actions">
          <Act action={{ type: 'turn_asset', npcId: n.id, kind: 'informant' }} label="Ask them to keep their ears open" icon="boiler_room" />
          <Act action={{ type: 'turn_asset', npcId: n.id, kind: 'muscle' }} label="Ask them to turn up when it goes wrong" icon="protection" />
        </div>
      )}
      {canDefect && (
        <div className="actions mt8">
          <Act action={{ type: 'defect', npcId: n.id }} label={`Ask ${select.nemesisName(n).split(' ')[0]} to walk`} icon="spring_crew" kind="danger" />
        </div>
      )}
      {refs.length > 0 && (
        <>
          <div className="section-title">An introduction<Info id="referral" /></div>
          <p className="small muted">{n.name} could put their name to you with somebody they know. A stranger stops being one.</p>
          <div className="actions">
            {refs.map(r => <Act key={r.id} action={{ type: 'introduce', npcId: n.id, toNpcId: r.id }} label={r.name} icon="crew" />)}
          </div>
        </>
      )}
    </>
  );
}
