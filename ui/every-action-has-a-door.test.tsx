/**
 * Every action the sim accepts has a way in from the app.
 *
 * Three bugs in one week had the same shape: the sim could do a thing, `can()` said yes, its tests
 * passed, the soak bot drove it — and no player could reach it, because the only control that
 * would have offered it was narrower than the rule, or was not there at all.
 *
 *  - the Recruit button's role list was narrower than the reducer's;
 *  - the ops planner's target list had no room for anybody who used to work for you;
 *  - **`buy_favour` had no button anywhere.** It shipped as one of five money sinks, the coverage
 *    table read ✓ next to it for two passes, and it was unreachable the whole time.
 *
 * A coverage table answers "was this system reached", never "does the route a player takes work".
 * This test asks the second question the only way a test can: every player-facing action id has to
 * appear in a component. Crude, and it would have caught all three.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const uiSource = (() => {
  const walk = (d: string): string[] => readdirSync(new URL(`../${d}/`, import.meta.url), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
  return walk('ui').filter(f => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'))
    .map(f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
})();

const actionIds = (() => {
  const src = readFileSync(new URL('../sim/actions.ts', import.meta.url), 'utf8');
  return [...src.matchAll(/\{\s*type:\s*'([a-z_]+)'/g)].map(m => m[1]);
})();

/**
 * Actions with no button by design, each for a stated reason. Nothing goes on this list because it
 * is inconvenient — the point of the test is that an unreachable feature is a bug until somebody
 * writes down why it is not.
 */
const NO_BUTTON: Record<string, string> = {
  cheat: 'the admin panel drives these; they are not player-facing',
  resolve_confrontation: 'answered from the confrontation modal and the scene sheet, by option id',
  talk: 'dispatched by SceneAct rather than written out as a literal',
};

/**
 * A scene is opened by `<SceneAct scene={{ kind: 'recruit' }}>` rather than by writing the action
 * out, so the door is the scene kind. Anything reachable this way counts as reachable.
 */
const reachable = (id: string) => uiSource.includes(`type: '${id}'`) || uiSource.includes(`kind: '${id}'`);

describe('the sim and the app offer the same game', () => {
  it('every action a player could take appears somewhere in a component', () => {
    const missing = actionIds.filter(id => !NO_BUTTON[id] && !reachable(id));
    expect(missing, `no way in from the app:\n${missing.join('\n')}`).toEqual([]);
  });

  it('and the excuses are written down rather than assumed', () => {
    for (const [id, why] of Object.entries(NO_BUTTON)) {
      expect(actionIds, `${id} is excused but is not an action any more`).toContain(id);
      expect(why.length, id).toBeGreaterThan(20);
    }
  });
});
