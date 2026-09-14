/**
 * Drawing an icon, and working out which one.
 *
 * One component, one registry, one resolver per content table. Components never reach into
 * `ICON_PATHS` themselves: they ask for the thing they are drawing (`<Icon of="business"
 * id={biz.type} />`) and the resolver decides. That is what makes "every business type has an
 * icon" a question a test can ask rather than a thing somebody has to eyeball.
 *
 * Nothing here knows about the sim. It maps ids to drawings and stops.
 */
import type { CSSProperties } from 'react';
import { OP_ICON_PATHS } from './paths-ops';
import { ICON_PATHS, type IconPaths } from './paths';

export { ICON_PATHS, OP_ICON_PATHS };

/** Everything drawable, in one namespace. Ops are merged last; no key is defined twice. */
export const ALL_ICONS: Record<string, IconPaths> = { ...ICON_PATHS, ...OP_ICON_PATHS };

/** The tables an id can come from. Each has a fallback, so a new content row is never blank. */
export type IconOf = 'business' | 'racket' | 'op' | 'item' | 'product' | 'production' | 'posture' | 'authority' | 'assignment' | 'ui';

const FALLBACK: Record<IconOf, string> = {
  business: 'corner_store', racket: 'protection', op: 'ops', item: 'hot_goods',
  product: 'hot_goods', production: 'gear', posture: 'precinct', authority: 'precinct',
  assignment: 'crew', ui: 'info',
};

/**
 * Assignment kinds and a couple of content ids do not match a drawing one-for-one. Everything
 * else resolves by its own id, which is the point: a new business type gets an icon by being
 * named the same thing in both places.
 */
const ALIAS: Record<string, string> = {
  // crew assignments, whose ids read as verbs rather than things
  racket: 'collect', op: 'ops', lieutenant: 'lieutenant',
  // the two op families that share a drawing with their racket
  wire: 'relay_box',
  // approaches, which are moods rather than objects
  loud: 'crackdown', quiet: 'watching', inside: 'lock',
};

/** The icon name for one content id, or the table's fallback. */
export function iconName(of: IconOf, id: string | undefined): string {
  if (!id) return FALLBACK[of];
  if (of === 'op') return OP_ICON_PATHS[id] ? id : ALL_ICONS[id] ? id : FALLBACK.op;
  if (of === 'assignment') {
    const a = ALIAS[id];
    if (a && ALL_ICONS[a]) return a;
  }
  if (ALL_ICONS[id]) return id;
  const a = ALIAS[id];
  return a && ALL_ICONS[a] ? a : FALLBACK[of];
}

/** Is there a real drawing for this name? Used by the tests, and by nothing else. */
export function hasIcon(name: string): boolean { return !!ALL_ICONS[name]; }

export interface IconProps {
  /** A name straight out of the registry. Use `of`+`id` instead when drawing content. */
  name?: string;
  of?: IconOf;
  id?: string;
  size?: number;
  className?: string;
  /** Screen-reader text. Without it the glyph is decoration and is hidden, which is usually right. */
  title?: string;
  strokeWidth?: number;
  /** Only ever for baseline nudges on an icon sitting inside a line of text. */
  style?: CSSProperties;
}

/**
 * One glyph. Square, stroked in `currentColor`, and `aria-hidden` unless it is given a title —
 * almost every icon in this app sits next to its own label, and a screen reader reading both is
 * worse than a screen reader reading one.
 */
export function Icon({ name, of, id, size = 20, className, title, strokeWidth = 1.5, style }: IconProps) {
  const key = name ?? iconName(of ?? 'ui', id);
  const paths = ALL_ICONS[key] ?? ALL_ICONS[FALLBACK[of ?? 'ui']];
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size} height={size} viewBox="0 0 24 24" data-icon={key} style={style}
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="square" strokeLinejoin="miter"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/**
 * The bordered tile the reference mood board puts around every icon. It is the difference
 * between "an icon in a row" and "an instrument on a panel": a hard-cornered box, a hairline,
 * and a notched top-left corner so it reads as machined rather than as a rounded app chip.
 */
export function IconTile({ of, id, name, size = 34, tone, title }: IconProps & { tone?: 'gold' | 'muted' | 'danger' | 'live' }) {
  return (
    <span className={`icontile${tone ? ` icontile-${tone}` : ''}`} style={{ width: size, height: size }}>
      <Icon name={name} of={of} id={id} size={Math.round(size * 0.58)} title={title} />
    </span>
  );
}

/**
 * The same glyph as a string, for the map markers — MapLibre builds those from raw HTML rather
 * than from React, and a marker drawn with a different icon set would be the one place the old
 * look survived.
 */
export function iconMarkup(name: string, opts: { size?: number; color?: string; strokeWidth?: number } = {}): string {
  const paths = ALL_ICONS[name] ?? ALL_ICONS.info;
  const size = opts.size ?? 16;
  const d = paths.map(p => `<path d="${p}"/>`).join('');
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" data-icon="${name}" fill="none" stroke="${opts.color ?? 'currentColor'}" stroke-width="${opts.strokeWidth ?? 1.6}" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${d}</svg>`;
}
