import { select } from '@sim/index';
import { useWorld } from '@ui/store';
import { Info } from './Info';
import { Section } from './Act';

/**
 * The record.
 *
 * Aggregated entirely from things already written down — the log, the ledger, the ops, the
 * factions (`sim/trophies.ts`). A row with nothing in it is left in rather than hidden: "First
 * body — never" is part of the record, and arguably the most interesting line on the page.
 */
export function TrophyScreen() {
  const w = useWorld();
  const rows = select.trophies(w);
  return (
    // Shut by default: it is a dozen rows of "what you have done", which is reference rather than
    // anything you act on, and it sits between the news and the log on an already long screen.
    <Section id="trophies" title="The record" defaultOpen={false} info={<Info id="trophies" />}>
      <div className="col" style={{ gap: 6 }}>
        {rows.map(t => (
          <div key={t.id} className={`trophy${t.value ? '' : ' empty'}`}>
            <div className="row between">
              <span className="trophy-label">{t.label}</span>
              <span className="trophy-value">{t.value ?? '—'}</span>
            </div>
            {t.detail && <div className="small muted mt4">{t.detail}</div>}
            {t.day !== undefined && <div className="tiny faint">Day {t.day}</div>}
          </div>
        ))}
      </div>
    </Section>
  );
}
