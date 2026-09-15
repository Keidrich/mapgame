import { select } from '@sim/index';
import type { WebKind, WebNode } from '@sim/relationships';
import { openSheet, useWorld } from '@ui/store';
import { Icon } from '@ui/icons';
import { initials } from '@ui/derive';

/**
 * The web, drawn.
 *
 * Four rings around you: yours (crew and assets), theirs (nemeses and the people who run the
 * outfits), and the connective tissue — anybody you have met who ties two of those together.
 * The lines between them are the connections graph that already decides how word travels, which
 * is the whole reason this is worth drawing: a list can tell you that you have an informant
 * inside the Delgados and that a lieutenant keeps turning up, and only a picture can tell you
 * they are cousins.
 *
 * Every position comes from `select.relationshipWeb` — this file scales a unit circle and picks
 * colours, and decides nothing. That is not ceremony: the layout depends on who is in the world,
 * which makes it a derived value, and a derived value belongs in `/sim` where it can be tested
 * without a renderer.
 */

/** Amber is yours, red is trouble, grey is everybody else. The app's own three-colour rule. */
const TONE: Record<WebKind, string> = {
  you: 'var(--gold)',
  crew: 'var(--gold)',
  asset: 'var(--gold-3)',
  nemesis: 'var(--red)',
  faction: '#8b93a3',
  known: '#5f6a7c',
};
const ICON: Record<WebKind, string> = {
  you: 'you', crew: 'crew', asset: 'watching', nemesis: 'crackdown', faction: 'social', known: 'person',
};

const SIZE = 320;            // viewBox is square; the element scales to whatever width it has
const R = SIZE / 2 - 34;     // room for the outermost label

export function RelationshipMap() {
  const w = useWorld();
  const web = select.relationshipWeb(w);
  const at = (n: WebNode) => ({ cx: SIZE / 2 + n.x * R, cy: SIZE / 2 + n.y * R });
  const byId = new Map(web.nodes.map(n => [n.id, n]));

  if (web.nodes.length <= 1) {
    return <p className="small muted mt12">Nobody is anything to you yet. Take somebody on, turn somebody, or cross somebody often enough that they start turning up, and the web draws itself.</p>;
  }

  return (
    <div className="webmap mt8">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Your relationships: ${web.nodes.length - 1} people`}>
        {/* the rings themselves, faintly, so distance from the middle reads as meaning something */}
        {[1, 2, 3].map(ring => (
          <circle key={ring} cx={SIZE / 2} cy={SIZE / 2} r={(ring / 3) * R} fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4" />
        ))}
        {web.links.map((l, i) => {
          const a = byId.get(l.a), b = byId.get(l.b);
          if (!a || !b) return null;
          const pa = at(a), pb = at(b);
          return (
            <line key={i} x1={pa.cx} y1={pa.cy} x2={pb.cx} y2={pb.cy}
              stroke={l.kind === 'yours' ? 'var(--gold-3)' : l.kind === 'family' ? '#6d7686' : '#464e5c'}
              strokeWidth={l.kind === 'yours' ? 1.4 : 1}
              strokeDasharray={l.kind === 'friend' ? '3 3' : undefined} opacity={l.kind === 'yours' ? 0.75 : 0.6} />
          );
        })}
        {web.nodes.map(n => {
          const { cx, cy } = at(n);
          const r = n.kind === 'you' ? 15 : n.crowded ? 6 + n.weight * 3 : 7 + n.weight * 5;
          const label = n.kind === 'you' ? 'You' : n.name.split(' ')[0];
          return (
            <g key={n.id} className="webnode" onClick={() => n.id !== 'player' && openSheet({ kind: 'npc', npcId: n.id })} role={n.id === 'player' ? undefined : 'button'}>
              <title>{`${n.name} — ${n.note}`}</title>
              <circle cx={cx} cy={cy} r={r} fill="var(--bg)" stroke={TONE[n.kind]} strokeWidth={n.hostile ? 2 : 1.4} />
              <text x={cx} y={cy + 3} textAnchor="middle" fontSize="8" fill={TONE[n.kind]} fontFamily="var(--font-mono)">
                {n.kind === 'you' ? 'YOU' : initials(n.name)}
              </text>
              {n.ring <= 2 && !n.crowded && (
                <text x={cx} y={cy + r + 9} textAnchor="middle" fontSize="7.5" fill="var(--faint)" fontFamily="var(--font-mono)">{label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="weblegend">
        {(['crew', 'asset', 'nemesis', 'faction', 'known'] as WebKind[]).map(k => (
          <span key={k} style={{ color: TONE[k] }}>
            <Icon name={ICON[k]} size={11} /> {k === 'crew' ? 'Yours' : k === 'asset' ? 'Assets' : k === 'nemesis' ? 'Trouble' : k === 'faction' ? 'Their people' : 'Ties them together'}
          </span>
        ))}
      </div>
    </div>
  );
}
