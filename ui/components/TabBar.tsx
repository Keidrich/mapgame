import { setTab, useStore, type Tab } from '@ui/store';
import { activeOps } from '@ui/derive';
import { Icon } from '@ui/icons';

/**
 * Crew and Factions were the same emoji, which is the sort of thing nobody notices and everybody
 * feels. Every tab has its own drawing now, and the icon name is the tab id, so a new tab gets an
 * icon by existing.
 */
const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: 'Map' }, { id: 'crew', label: 'Crew' }, { id: 'ops', label: 'Ops' },
  { id: 'social', label: 'Social' }, { id: 'factions', label: 'Factions' }, { id: 'empire', label: 'Empire' },
];

export function TabBar() {
  const tab = useStore(s => s.tab);
  const w = useStore(s => s.world);
  const readyOps = w ? activeOps(w).filter(o => o.status === 'ready').length : 0;
  return (
    <nav className="tabbar">
      {TABS.map(t => (
        <button type="button" key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
          <span className="ico"><Icon name={t.id} size={20} /></span>{t.label}
          {t.id === 'ops' && readyOps > 0 && <span className="dot" />}
        </button>
      ))}
    </nav>
  );
}
