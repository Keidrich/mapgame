/**
 * Filled, chunky glyphs for the game frame: the currencies, energy, heat, stars. The shared icon
 * set (`@ui/icons`) is stroked line art, right for rows and sheets; resource pills and badges read
 * as a game only when their icons are solid shapes with a highlight, the way mobile games draw
 * coins and gems. Each takes a size and draws in its own colours.
 */
import type { CSSProperties } from 'react';

type P = { size?: number; style?: CSSProperties; className?: string };
const svg = (size: number, children: React.ReactNode, p: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={p.style} className={p.className}>{children}</svg>
);

/** Clean money: a green note with a bright edge. */
export const GCash = ({ size = 22, ...p }: P) => svg(size, <>
  <rect x="2" y="6" width="20" height="13" rx="3" fill="#1c9c4a" />
  <rect x="2" y="5" width="20" height="13" rx="3" fill="#3ee07a" />
  <rect x="4.5" y="7.5" width="15" height="8" rx="2" fill="none" stroke="#1c9c4a" strokeWidth="1.4" />
  <circle cx="12" cy="11.5" r="2.6" fill="#1c9c4a" />
  <path d="M3.5 7h8" stroke="#b6ffd0" strokeWidth="1.2" strokeLinecap="round" opacity=".8" />
</>, p);

/** Dirty money: an orange sack, tied. */
export const GBag = ({ size = 22, ...p }: P) => svg(size, <>
  <path d="M8 4.5h8l-2 3.2h-4z" fill="#c4620f" />
  <path d="M9.5 7.7C5 9.8 3.5 13.5 3.8 16.4 4.2 20 7.4 21.5 12 21.5s7.8-1.5 8.2-5.1c.3-2.9-1.2-6.6-5.7-8.7z" fill="#c4620f" />
  <path d="M9.5 7C5 9.1 3.5 12.8 3.8 15.7 4.2 19.3 7.4 20.8 12 20.8s7.8-1.5 8.2-5.1c.3-2.9-1.2-6.6-5.7-8.7z" fill="#ff9a3c" />
  <path d="M12 10.5v6.5M14.2 11.8c-.5-.8-3.9-1.2-4 .6-.1 2 4.3 1 4.1 3.1-.1 1.8-3.6 1.4-4.2.4" stroke="#8a3f00" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  <path d="M7 11.5c.6-1.2 1.4-2 2.4-2.6" stroke="#ffd2a3" strokeWidth="1.3" strokeLinecap="round" />
</>, p);

/** Energy: the day's action points. */
export const GBolt = ({ size = 22, ...p }: P) => svg(size, <>
  <path d="M13.5 2.5 4.5 14h6l-1.5 8.5L19.5 10h-6.2z" fill="#1583b8" transform="translate(0 1)" />
  <path d="M13.5 2.5 4.5 14h6l-1.5 8.5L19.5 10h-6.2z" fill="#3ec8ff" />
  <path d="M12.6 4.5 7.3 12" stroke="#c9f1ff" strokeWidth="1.3" strokeLinecap="round" />
</>, p);

/** Heat: a flame that goes red as it climbs. */
export const GFlame = ({ size = 22, hot = false, ...p }: P & { hot?: boolean }) => svg(size, <>
  <path d="M12 2.5c1 3.2 5.8 5.6 5.8 11a5.8 5.8 0 0 1-11.6 0c0-2.6 1.3-4.3 2.6-5.4.2 1.8.9 2.9 1.9 3.3C10.3 8.5 10.6 5 12 2.5z" fill={hot ? '#b8233f' : '#c4620f'} transform="translate(0 1)" />
  <path d="M12 2.5c1 3.2 5.8 5.6 5.8 11a5.8 5.8 0 0 1-11.6 0c0-2.6 1.3-4.3 2.6-5.4.2 1.8.9 2.9 1.9 3.3C10.3 8.5 10.6 5 12 2.5z" fill={hot ? '#ff4d6d' : '#ff9a3c'} />
  <path d="M12 12.5c.7 1.6 2.6 2.4 2.6 4.3a2.6 2.6 0 0 1-5.2 0c0-1.5 1.2-2.4 2.6-4.3z" fill="#ffe08a" />
</>, p);

/** A star: ranks, rewards, the done mark on a quest. */
export const GStar = ({ size = 22, dim = false, ...p }: P & { dim?: boolean }) => svg(size, <>
  <path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill={dim ? '#3a3666' : '#c98a00'} transform="translate(0 1)" />
  <path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill={dim ? '#4d4885' : '#ffcc33'} />
  {!dim && <path d="M10.4 7.8 12 4.6" stroke="#fff3c4" strokeWidth="1.3" strokeLinecap="round" />}
</>, p);

/** A trophy, for the city you win. */
export const GTrophy = ({ size = 22, ...p }: P) => svg(size, <>
  <path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#ffcc33" />
  <path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5a3.5 3.5 0 0 1-3.5 3.5" stroke="#c98a00" strokeWidth="1.8" fill="none" />
  <path d="M10.5 13h3v3.5h-3z" fill="#c98a00" /><rect x="7" y="16.5" width="10" height="4" rx="1.2" fill="#ffcc33" />
  <path d="M9 4.5v3.2" stroke="#fff3c4" strokeWidth="1.4" strokeLinecap="round" />
</>, p);

export const GLayers = ({ size = 22, ...p }: P) => svg(size, <>
  <path d="m12 4 9 4.5-9 4.5-9-4.5z" fill="#fff" />
  <path d="m3 12.5 9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinejoin="round" opacity=".75" />
</>, p);

export const GChevron = ({ size = 18, ...p }: P) => svg(size, <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />, p);
export const GClose = ({ size = 18, ...p }: P) => svg(size, <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />, p);
export const GTarget = ({ size = 22, ...p }: P) => svg(size, <>
  <circle cx="12" cy="12" r="9" fill="#ff4d6d" /><circle cx="12" cy="12" r="6" fill="#fff" /><circle cx="12" cy="12" r="3" fill="#ff4d6d" />
</>, p);
