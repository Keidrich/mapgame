import { setTab, useStore, type Tab } from '@ui/store';
import { activeOps } from '@ui/derive';

const TABS: { id: Tab; label: string; ico: string }[] = [
  { id: 'map', label: 'Map', ico: '🗺️' }, { id: 'crew', label: 'Crew', ico: '👥' }, { id: 'ops', label: 'Ops', ico: '🎯' },
  { id: 'social', label: 'Social', ico: '🕸️' }, { id: 'factions', label: 'Factions', ico: '👥' }, { id: 'empire', label: 'Empire', ico: '🏛️' },
];

export function TabBar() {
  const tab = useStore(s => s.tab);
  const w = useStore(s => s.world);
  const readyOps = w ? activeOps(w).filter(o => o.status === 'ready').length : 0;
  return (
    <nav className="tabbar">
      {TABS.map(t => (
        <button type="button" key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
          <span className="ico">{t.ico}</span>{t.label}
          {t.id === 'ops' && readyOps > 0 && <span className="dot" />}
        </button>
      ))}
    </nav>
  );
}
