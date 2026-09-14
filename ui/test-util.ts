/**
 * Helpers for the UI tests, which compare against rendered HTML.
 *
 * Not imported by the app; nothing here ships.
 */

/**
 * A name as it appears in rendered HTML. NPC nicknames carry double quotes — Darlene "Grip"
 * Reed — and the renderer escapes them, so a raw string comparison fails on exactly the
 * people most worth checking. This has bitten two tests; use it for any name assertion.
 */
export const asHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

/**
 * Rendered HTML with React's text-node separators taken out. `renderToString` writes `<!-- -->`
 * between two adjacent interpolations, so `freshness {n}` comes back as `freshness <!-- -->90`
 * and a plain `toContain('freshness 90')` fails for reasons that have nothing to do with the
 * component. Use this whenever an assertion spans a text/expression boundary.
 */
export const plain = (html: string) => html.replace(/<!-- -->/g, '');
