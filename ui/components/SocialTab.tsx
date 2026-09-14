import { useMemo, useRef, useState } from 'react';
import { select } from '@sim/index';
import type { Id, Npc } from '@sim/types';
import { initials, roleLabel } from '@ui/derive';
import { openSheet, useWorld } from '@ui/store';
import { Info } from './Info';
import { NoteEditor } from './Note';

/**
 * Everybody you have met, and who they have behind them.
 *
 * The roster is the same set of people their own sheets would talk about — `select.metNpcs`
 * uses the same "have we met" test the sheet uses to decide whether to show traits — grouped
 * the three ways that actually help: by who they are connected to, by where they live, and by
 * who they answer to. Tapping somebody opens their ties in place, and tapping a tie walks you
 * along it, so you can follow a family across the district without losing your place.
 */
type GroupMode = 'connections' | 'district' | 'faction';

const MODES: { id: GroupMode; label: string }[] = [
  { id: 'connections', label: '🕸 Ties' },
  { id: 'district', label: '📍 District' },
  { id: 'faction', label: '👥 Faction' },
];

export function SocialTab() {
  const w = useWorld();
  const [mode, setMode] = useState<GroupMode>('connections');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<Id | null>(null);
  const rows = useRef(new Map<Id, HTMLDivElement | null>());

  const met = select.metNpcs(w);
  const needle = q.trim().toLowerCase();
  const people = needle
    ? met.filter(n => `${n.name} ${roleLabel(n)} ${n.playerNote ?? ''}`.toLowerCase().includes(needle))
    : met;

  const groups = useMemo(() => groupPeople(w, people, mode), [w, people, mode]);

  /** Walk a tie: open that person here if you know them, otherwise their sheet. */
  const goTo = (n: Npc) => {
    if (!select.isKnown(n)) { openSheet({ kind: 'npc', npcId: n.id }); return; }
    setOpenId(n.id);
    setQ('');
    setTimeout(() => rows.current.get(n.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
  };

  return (
    <div className="panel-inner">
      <h2>Social</h2>
      <p className="small muted">{met.length} {met.length === 1 ? 'person' : 'people'} you have met. Size somebody up or spend time with them and they turn up here.<Info id="connections" /></p>

      <div className="segment mt8">
        {MODES.map(m => (
          <button type="button" key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>{m.label}</button>
        ))}
      </div>
      <input className="input mt8" placeholder="Search a name or your own notes…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search people you have met" autoComplete="off" />

      {people.length === 0 && <p className="small muted mt12">{met.length ? 'Nobody here matches that.' : 'You have not met anybody yet. Open a business on your block and size up whoever is inside.'}</p>}

      {groups.map(g => (
        <div key={g.title}>
          <div className="section-title">{g.title} <span className="muted small">({g.people.length})</span></div>
          <div className="col" style={{ gap: 6 }}>
            {g.people.map(n => (
              <div key={n.id} ref={el => { rows.current.set(n.id, el); }}>
                <PersonRow npc={n} open={openId === n.id} onToggle={() => setOpenId(id => (id === n.id ? null : n.id))} onWalk={goTo} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PersonRow({ npc, open, onToggle, onWalk }: { npc: Npc; open: boolean; onToggle: () => void; onWalk: (n: Npc) => void }) {
  const w = useWorld();
  const ties = select.connectionsOf(w, npc);
  const known = select.knownConnectionsOf(w, npc);
  const faction = npc.faction ? select.factionColor(w, npc.faction) : undefined;
  return (
    <>
      <button type="button" className={`listitem${open ? ' sel' : ''}`} onClick={onToggle} aria-expanded={open}>
        <div className="avatar" style={{ color: faction }}>{initials(npc.name)}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="title ellipsis">{npc.name}</div>
          <div className="sub ellipsis">{roleLabel(npc)} · {select.relLabel(npc)}{npc.crew ? ' · your crew' : ''}{npc.grudge ? ' · grudge' : ''}</div>
          {npc.playerNote && <div className="small gold ellipsis" style={{ marginTop: 2 }}>📝 {npc.playerNote}</div>}
        </div>
        {ties.length > 0 && <span className="chip" title={`${ties.length} family and friends${known.length ? `, ${known.length} you have met` : ''}`}>🕸 {ties.length}</span>}
      </button>
      {open && (
        <div className="card mt8">
          <Ties npc={npc} onWalk={onWalk} />
          <div className="mt8"><NoteEditor npcId={npc.id} /></div>
          <div className="mt8">
            <button type="button" className="btn btn-ghost btn-block" onClick={() => openSheet({ kind: 'npc', npcId: npc.id })}>Open {npc.name.split(' ')[0]}'s page</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Their family and friends, each one a step you can take. */
function Ties({ npc, onWalk }: { npc: Npc; onWalk: (n: Npc) => void }) {
  const w = useWorld();
  const ties = select.connectionsOf(w, npc);
  if (!ties.length) return <p className="small muted" style={{ margin: 0 }}>Nobody you have heard about. {npc.name.split(' ')[0]} keeps to themselves, or you have not asked around.</p>;
  const line = (label: string, kind: 'family' | 'friend') => {
    const list = ties.filter(t => t.kind === kind);
    if (!list.length) return null;
    return (
      <div className="mt8" style={{ marginTop: 6 }}>
        <div className="small muted">{label}</div>
        <div className="col" style={{ gap: 4, marginTop: 4 }}>
          {list.map(t => (
            <button type="button" key={t.npc.id} className="listitem" onClick={() => onWalk(t.npc)}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title ellipsis">{t.npc.name} <span className="muted small">({t.label})</span></div>
                <div className="sub ellipsis">{whereabouts(w, t.npc)}</div>
              </div>
              {!select.isKnown(t.npc) && <span className="chip muted">not met</span>}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return <>{line('Family', 'family')}{line('Friends', 'friend')}</>;
}

/** "runs Casa Roma on Mott St" — the same line the person's own sheet uses. */
export function whereabouts(w: ReturnType<typeof useWorld>, npc: Npc): string {
  const biz = Object.values(w.businesses).find(b => b.ownerId === npc.id);
  const block = w.blocks[npc.homeBlockId]?.name;
  if (biz) return `Runs ${biz.name}${block ? ` on ${block}` : ''}`;
  if (npc.crew) return 'In your crew';
  if (npc.faction) return `${select.factionName(w, npc.faction)}${block ? ` · ${block}` : ''}`;
  return block ? `Around ${block}` : 'Whereabouts unknown';
}

function groupPeople(w: ReturnType<typeof useWorld>, people: Npc[], mode: GroupMode): { title: string; people: Npc[] }[] {
  const by = new Map<string, Npc[]>();
  const push = (key: string, n: Npc) => { const list = by.get(key) ?? []; list.push(n); by.set(key, list); };
  for (const n of people) {
    if (mode === 'district') push(w.districts[w.blocks[n.homeBlockId]?.districtId ?? '']?.name ?? 'Somewhere else', n);
    else if (mode === 'faction') push(n.crew ? 'Your crew' : n.faction ? select.factionName(w, n.faction) : n.official ? 'City hall' : 'Nobody in particular', n);
    else push(select.knownConnectionsOf(w, n).length ? 'Connected to people you know' : 'No ties to anyone you have met', n);
  }
  const order = (title: string) => (title === 'Connected to people you know' ? -2 : title === 'Your crew' ? -1 : title.startsWith('No ties') || title === 'Nobody in particular' || title === 'Somewhere else' ? 1 : 0);
  return [...by.entries()]
    .map(([title, list]) => ({ title, people: list }))
    .sort((a, b) => order(a.title) - order(b.title) || b.people.length - a.people.length || a.title.localeCompare(b.title));
}
