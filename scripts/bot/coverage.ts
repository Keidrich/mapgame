/**
 * What the soak actually exercised.
 *
 * The bot's job is to find bugs, and for three feature passes running it quietly could not reach
 * the things that had just been built: it never got to tier 2, never escalated an Authority,
 * never had a card in its pocket. The economy curve looked fine and meant nothing.
 *
 * So the run now counts what it touched and says out loud what it never reached. A zero in this
 * table is the point of the table: it means that system had no coverage this run, and any
 * conclusion drawn about it from the soak is worthless.
 */
export type Counter =
  | 'days' | 'ops_planned' | 'ops_done' | 'ops_failed'
  | 'tier2_ops' | 'complications' | 'complications_answered' | 'complications_absent'
  | 'confrontations' | 'law_ops' | 'attention_bought' | 'sprung' | 'cases_killed'
  | 'cards_run' | 'cards_dumped' | 'taps' | 'secrets_sold' | 'scrubs'
  | 'items_bought' | 'rackets_started' | 'businesses_bought' | 'crew_hired'
  | 'launders' | 'fixer_launders' | 'raids' | 'busts' | 'moves'
  // the production pack: automation, distribution, and what a bank or a depot is worth
  | 'foremen' | 'foreman_switches' | 'supply_set' | 'supply_delivered'
  // making and moving a product yourself: the opening a player with nobody actually has
  | 'lines_built' | 'lines_self_worked' | 'street_sales' | 'solo_ops'
  | 'intel_ratted' | 'skims' | 'routes' | 'route_used' | 'consigns' | 'offshores' | 'lanes' | 'offshore_filed'
  // conversations and the agendas they can settle
  | 'talks' | 'talk_openers' | 'talk_closed' | 'agendas_settled' | 'agendas_trapped' | 'favours_owed'
  // the lieutenant who keeps turning up, and the people who work for you without being crew
  | 'nemesis_met' | 'nemesis_made' | 'defections' | 'assets_turned' | 'asset_warnings' | 'referrals'
  // the corners: parleying with a street crew, and the third thing you can do with one
  | 'parleys' | 'crews_funded' | 'funded_kicks'
  // what a fortune is for: the five sinks, each counted separately because each is a separate
  // claim about where late money goes, and a table that lumped them would hide four failures
  | 'tier4_bought' | 'favours_bought' | 'lifestyle_bought' | 'legitimacy_bought' | 'ceilings_bought'
  // what is at stake: the personal risk, the person outside it, and the two ways out
  | 'hunted' | 'loved_hit' | 'succession' | 'went_straight'
  // a world that moves without you, and the clock it moves on
  | 'faction_wars' | 'faction_absorbs' | 'upstart_grew' | 'hours_set'
  // the content pack: one-off people, one-off places, and the texture between them
  | 'specialists_hired' | 'landmark_ops' | 'headlines' | 'encounters';

export interface Coverage {
  counts: Record<Counter, number>;
  /** Ops seen by kind, so a roster of 40 with 4 ever run is visible rather than implied. */
  opKinds: Record<string, number>;
  /** Complication kinds raised, same reason. */
  complicationKinds: Record<string, number>;
  /** Anything the bot noticed going wrong that was not an exception. */
  warnings: string[];
}

export function newCoverage(): Coverage {
  return { counts: Object.create(null) as Record<Counter, number>, opKinds: {}, complicationKinds: {}, warnings: [] };
}
export function bump(c: Coverage, k: Counter, n = 1) { c.counts[k] = (c.counts[k] ?? 0) + n; }
export function bumpOp(c: Coverage, kind: string) { c.opKinds[kind] = (c.opKinds[kind] ?? 0) + 1; }
export function bumpComplication(c: Coverage, kind: string) { c.complicationKinds[kind] = (c.complicationKinds[kind] ?? 0) + 1; }
export function warn(c: Coverage, text: string) { if (!c.warnings.includes(text)) c.warnings.push(text); }
export const count = (c: Coverage, k: Counter) => c.counts[k] ?? 0;

/**
 * Systems worth reporting on, and what counts as having touched them. `needs` is what the run
 * has to have done for the system to count as covered at all.
 */
export const SYSTEMS: { label: string; needs: Counter[]; hint: string }[] = [
  { label: 'ops, any tier', needs: ['ops_done', 'ops_failed'], hint: 'the bot never finished a job' },
  { label: 'ops, tier 2+', needs: ['tier2_ops'], hint: 'nothing above street work ran: heists, war work and the law are all untested' },
  { label: 'complications', needs: ['complications'], hint: 'no tier-2 job was interrupted, so the whole mid-job answer path is untested' },
  { label: 'confrontations', needs: ['confrontations'], hint: 'nobody came to the door; combat answers are untested' },
  { label: 'law-facing ops', needs: ['law_ops'], hint: 'no buy-down, spring or file-kill ran' },
  { label: 'the wire', needs: ['cards_run', 'cards_dumped', 'taps', 'secrets_sold'], hint: 'no cards, taps or dirt: the whole cyber lane is untested' },
  { label: 'scrubbing wire heat', needs: ['scrubs'], hint: 'wire heat was never cleaned up' },
  { label: 'kit', needs: ['items_bought'], hint: 'nothing was ever bought or carried' },
  { label: 'foremen', needs: ['foremen'], hint: 'no production was ever put on automation, so recipe-switching and auto-restock are untested' },
  { label: 'making a product', needs: ['lines_built'], hint: 'no production line was ever built, so the whole make-it-yourself opening — the one a player with no crew and no rackets actually has — is untested' },
  { label: 'selling it yourself', needs: ['street_sales'], hint: 'nothing was ever sold on a corner by hand, so street price, demand and quality are untested outside the racket tick' },
  { label: 'jobs run alone', needs: ['solo_ops'], hint: 'every job the bot ran had crew on it, so nothing says whether a player with nobody can land anything' },
  { label: 'standing orders', needs: ['supply_set', 'supply_delivered'], hint: 'every product racket was left on its default rule; distribution is untested' },
  { label: 'institutional intel', needs: ['intel_ratted'], hint: 'nobody inside an institution was ever got at, so the five buildings that pay out only through the wire do nothing in the sweep' },
  { label: 'offshore accounts', needs: ['offshores'], hint: 'the accountant lane never opened, so the biggest laundering capacity in the game and its paper trail are both untested' },
  { label: 'conversations', needs: ['talks'], hint: 'every scene was a single button press; the opener/closer path is untested' },
  { label: 'settling an agenda', needs: ['agendas_settled'], hint: 'nobody ever had their problem settled, so reciprocity never arrives from the only system that generates it on demand' },
  { label: 'using one against them', needs: ['agendas_trapped'], hint: 'the dark half of agenda resolution never ran — it is half a shipped feature with no coverage' },
  { label: 'a nemesis', needs: ['nemesis_made'], hint: 'no lieutenant was ever met often enough to be changed by it, so the whole recurring-antagonist arc is untested' },
  { label: 'informants and assets', needs: ['assets_turned'], hint: 'nobody was ever turned, so early warning and a pair of hands are both untested' },
  { label: 'introductions', needs: ['referrals'], hint: 'nobody ever vouched for the player, so the one shortcut past the familiarity floor is untested' },
  { label: 'street crews', needs: ['parleys'], hint: 'nobody ever stood on a crew\'s corner and talked, so payroll, folding them in and running them off are all untested' },
  { label: 'staked crews', needs: ['crews_funded'], hint: 'no crew was ever fronted a racket, so the third mode — somebody else running your money — is untested' },
  { label: 'laundering', needs: ['launders', 'fixer_launders'], hint: 'dirty money never got washed' },
  { label: 'police pressure', needs: ['raids', 'busts'], hint: 'the police never actually did anything' },
  // --- the money sinks. Late cash had nowhere to go for four passes; these are where it goes now.
  { label: 'the fourth tier', needs: ['tier4_bought'], hint: 'no institution was ever bought, so the top of the ladder and its standing gate are untested' },
  { label: 'buying a favour', needs: ['favours_bought'], hint: 'nobody important was ever paid to owe you one, so cash-for-pull is untested' },
  { label: 'lifestyle', needs: ['lifestyle_bought'], hint: 'no home, car or security was ever bought, so what a fortune buys you personally is untested' },
  { label: 'buying legitimacy', needs: ['legitimacy_bought'], hint: 'nobody ever bought respectability, so the heat discount and its tension with the rest of the game are untested' },
  { label: 'raising a ceiling', needs: ['ceilings_bought'], hint: 'no hard cap was ever bought upward, so permanent headroom is untested' },
  // --- what is actually at stake
  { label: 'they come for you', needs: ['hunted'], hint: 'nobody ever came for the player personally, so the whole point of a nemesis passing `named` is untested' },
  { label: 'somebody to protect', needs: ['loved_hit'], hint: 'nobody ever went near the person outside all this, so the stake the rest of it is for never came due' },
  { label: 'succession', needs: ['succession'], hint: 'the outfit never changed hands, so the one thing that happens after the player dies is untested' },
  { label: 'getting out', needs: ['went_straight'], hint: 'nobody ever went straight, so the clean ending exists only in the reducer' },
  // --- a world that does not wait
  { label: 'factions on their own', needs: ['faction_wars', 'faction_absorbs'], hint: 'no outfit ever moved on another without the player, so the map only ever changes when you touch it' },
  { label: 'a rival who grows', needs: ['upstart_grew'], hint: 'the upstart never got anywhere, so the race — as opposed to the siege — is untested' },
  { label: 'the clock', needs: ['hours_set'], hint: 'every job ran at the same hour, so time of day is a screen with no consequences behind it' },
  // --- content
  { label: 'specialists', needs: ['specialists_hired'], hint: 'no set-piece ever hired a specialist, so price, reliability and the leverage door are untested' },
  { label: 'landmark jobs', needs: ['landmark_ops'], hint: 'not one of the one-off places was ever worked, so the jobs that exist in exactly one building never ran' },
  { label: 'the front page', needs: ['headlines'], hint: 'the desk never printed anything, which means the log never carried a line worth printing' },
  { label: 'street encounters', needs: ['encounters'], hint: 'nothing ever happened on the way anywhere, so the texture between the systems is untested' },
];

/**
 * Op kinds that never ran. Passed in rather than imported so this file stays free of content
 * imports; the CLI knows the full roster. A kind that never runs is either unreachable or the
 * bot does not know how to set it up — both worth knowing by name rather than as a shortfall.
 */
export function neverRan(c: Coverage, allKinds: string[]): string[] {
  return allKinds.filter(k => !(c.opKinds[k] > 0));
}

export function report(c: Coverage): string[] {
  const out: string[] = [];
  const covered = SYSTEMS.filter(s => s.needs.some(n => count(c, n) > 0));
  out.push(`coverage ${covered.length}/${SYSTEMS.length} systems`);
  for (const s of SYSTEMS) {
    const total = s.needs.reduce((n, k) => n + count(c, k), 0);
    out.push(`  ${total > 0 ? '✓' : '✗'} ${s.label.padEnd(22)} ${String(total).padStart(4)}${total > 0 ? '' : `   — ${s.hint}`}`);
  }
  const kinds = Object.entries(c.opKinds).sort((a, b) => b[1] - a[1]);
  out.push(`  ops by kind (${kinds.length} distinct): ${kinds.map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`);
  const comps = Object.entries(c.complicationKinds).sort((a, b) => b[1] - a[1]);
  if (comps.length) out.push(`  complications: ${comps.map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const auto = [
    ['foremen posted', count(c, 'foremen')], ['recipe switches', count(c, 'foreman_switches')],
    ['standing orders set', count(c, 'supply_set')], ['deliveries', count(c, 'supply_delivered')],
    ['employees got at', count(c, 'intel_ratted')], ['skims', count(c, 'skims')],
    ['routes', count(c, 'routes')], ['routes used on a job', count(c, 'route_used')],
    ['consignments', count(c, 'consigns')], ['offshore', count(c, 'offshores')], ['trade lanes', count(c, 'lanes')], ['files opened on the paper', count(c, 'offshore_filed')],
    ['lines built', count(c, 'lines_built')], ['worked by the player', count(c, 'lines_self_worked')], ['street sales', count(c, 'street_sales')], ['jobs run alone', count(c, 'solo_ops')],
  ] as const;
  out.push(`  production & intel: ${auto.map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const social = [
    ['conversations', count(c, 'talks')], ['openers worked', count(c, 'talk_openers')], ['closed on a scene', count(c, 'talk_closed')],
    ['agendas settled', count(c, 'agendas_settled')], ['agendas used against them', count(c, 'agendas_trapped')], ['people who now owe you', count(c, 'favours_owed')],
  ] as const;
  out.push(`  talk & agendas: ${social.map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const people = [
    ['lieutenants met', count(c, 'nemesis_met')], ['made into somebody', count(c, 'nemesis_made')], ['walked over to you', count(c, 'defections')],
    ['assets turned', count(c, 'assets_turned')], ['warnings received', count(c, 'asset_warnings')], ['introductions', count(c, 'referrals')],
  ] as const;
  out.push(`  nemesis & assets: ${people.map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const fortune = [
    ['institutions', count(c, 'tier4_bought')], ['favours bought', count(c, 'favours_bought')], ['lifestyle rungs', count(c, 'lifestyle_bought')],
    ['legitimacy bought', count(c, 'legitimacy_bought')], ['ceilings raised', count(c, 'ceilings_bought')],
    ['came for you', count(c, 'hunted')], ['went near your people', count(c, 'loved_hit')], ['handed over', count(c, 'succession')], ['got out', count(c, 'went_straight')],
  ] as const;
  out.push(`  fortune & stakes: ${fortune.map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const world = [
    ['wars not yours', count(c, 'faction_wars')], ['outfits swallowed', count(c, 'faction_absorbs')], ['upstart pushes', count(c, 'upstart_grew')],
    ['clock changes', count(c, 'hours_set')], ['specialists hired', count(c, 'specialists_hired')], ['landmark jobs', count(c, 'landmark_ops')],
    ['headlines', count(c, 'headlines')], ['encounters', count(c, 'encounters')],
  ] as const;
  out.push(`  world & content: ${world.map(([k, n]) => `${k} ${n}`).join(', ')}`);
  for (const warning of c.warnings) out.push(`  ! ${warning}`);
  return out;
}

/** True when every system got at least one touch — what a coverage run should be asserting. */
export function fullyCovered(c: Coverage): boolean {
  return SYSTEMS.every(s => s.needs.some(n => count(c, n) > 0));
}
export function missing(c: Coverage): string[] {
  return SYSTEMS.filter(s => !s.needs.some(n => count(c, n) > 0)).map(s => s.label);
}
