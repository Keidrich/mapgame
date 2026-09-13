import type { CheatKind } from '@sim/actions';
import { closeHelp, useStore } from '@ui/store';
import { Act, Disclosure } from './Act';
import { Sheet } from './Sheet';

/** Testing tools. Temporary, deliberately behind a fold, and every one of them stamps the save as cheated. */
const CHEATS: { what: CheatKind; label: string; icon: string }[] = [
  { what: 'cash', label: '+$10,000 clean', icon: '💵' },
  { what: 'dirty', label: '+$10,000 dirty', icon: '💰' },
  { what: 'ap', label: 'Refill AP', icon: '⚡' },
  { what: 'legwork', label: 'Refill legwork', icon: '🚶' },
  { what: 'heat', label: 'Clear all heat', icon: '🧊' },
  { what: 'skills', label: 'Every skill to 10', icon: '🎓' },
  { what: 'crew', label: 'Three people join your crew', icon: '👥' },
  { what: 'unlock', label: 'Unlock the op tree', icon: '🔓' },
  { what: 'safehouse', label: 'Tier 3 safehouse here', icon: '🏠' },
  { what: 'own_block', label: 'Own every business here', icon: '🏪' },
  { what: 'turf', label: 'Make this block your turf', icon: '👑' },
  { what: 'reveal', label: 'Reveal people and derelict blocks', icon: '🗺️' },
  { what: 'stash', label: '+50 of every product', icon: '📦' },
];

/** One-screen "how to play" (the README's first five minutes), opened from the ? in the HUD. */
export function HelpSheet() {
  return (
    <Sheet title="How to play" subtitle="The first five minutes" icon="❓" onClose={closeHelp}>
      <div className="help">
        <p className="small" style={{ margin: '0 0 10px', color: 'var(--gold)' }}>Anything with a dotted underline, or a ? in a chip, explains itself. Tap it (or hover on a computer) to find out what the number does.</p>
        <ol>
          <li>Tap the bright hex in the middle: that is your block. Open a business and read the owner's traits. Cowards and low-nerve owners fold fast; hotheads and honest owners fight back.</li>
          <li><b>Threaten</b> an owner until their fear is up, then <b>Shakedown</b> for cash today or <b>Protect</b> for a daily cut. Fair rates (10 to 15%) keep owners loyal.</li>
          <li>You stand on one block at a time, marked 🚶 on the map. Anything face to face needs you there: tap a place or a person and <b>Walk over</b> first. Walking spends <b>legwork</b>, not AP, and legwork comes back every day. Blocks you run are free to walk through, so taking ground makes the city smaller.</li>
          <li>Talk to patrons (<b>Visit</b>). At trust 20 you can <b>Recruit</b> them; assign crew to run rackets so they earn full income and get busted less. Once someone has loyalty 50 and a few days in, make them a <b>lieutenant</b> over a district: rackets there run themselves, but watch the books.</li>
          <li>Add a <b>Numbers</b> racket to a place you protect, rent a <b>safehouse</b> on your block, build a <b>still</b>, stock it, and sell booze on the street or through a <b>Dealing</b> racket.</li>
          <li><b>End Day</b> each turn. Read the event cards. Watch heat: past 60 you get raided, at 100 you get busted. Bribe the captain or pay the sergeant to cool off.</li>
          <li>Check <b>Factions</b> before pushing into coloured blocks. Tension means a warning, beef means sabotage, war means bodies. Sit-downs, tribute, and ceding a block buy peace. When a boss falls, back a lieutenant; when two factions fight, <b>broker</b> a truce for a fee.</li>
          <li>Small street crews hold corners between the factions. <b>Parley</b> with the boss (payroll, join, or run them off) or take the corner. Ignore them and they grow.</li>
          <li>Product has <b>quality</b>: better workers, upgraded productions and recipes (steal a formula, or recruit someone who knows one) sell higher. Watch for bad batches and shortages.</li>
          <li>Ops open up as you grow: the tree shows everything, including what is still locked and why. The street tier runs solo. <b>Scout the Edges</b> of a quiet district for derelict blocks, then <b>Take the Lot</b>: a safehouse on claimed ground is free, and nobody there can testify against you.</li>
          <li>A hit or a big job opens a <b>cold case</b>. Scare or pay the witness, bribe the captain, keep a lawyer. After day 15 the bosses form the <b>Commission</b>: earn a chair and vote.</li>
        </ol>
        <p className="small muted mt12">Every action costs AP (the gold pips). Cash is clean money; dirty money needs laundering before it buys anything legitimate. Own 60% of the blocks to take the city.</p>
        <Cheats />
      </div>
    </Sheet>
  );
}

function Cheats() {
  const cheated = useStore(s => !!s.world?.cheated);
  return (
    <div className="mt12">
      <Disclosure label="Testing tools" icon="🛠️">
        <p className="small muted" style={{ margin: 0 }}>
          For testing this build. Anything here happens instantly and for free, and marks the save as cheated{cheated ? ' — which this one already is.' : '.'}
        </p>
        <div className="col mt8">
          {CHEATS.map(c => <Act key={c.what} action={{ type: 'cheat', what: c.what }} label={c.label} icon={c.icon} block small />)}
        </div>
      </Disclosure>
    </div>
  );
}
