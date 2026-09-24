/**
 * The clock: what can be done by day, what only after dark. Data, read by `sim/clock.ts`.
 *
 * Every day has two halves. By day the city is at work: owners are behind their counters, the
 * officials are at their desks, the banks and the landlords are open. By night the regulars are out
 * in the bars and clubs, the corner crews are working, the shutters are down, and the kind of work
 * that wants the dark is on. The day keeps its whole allowance of hours; the night adds a few of
 * its own, and what you meet in each is different.
 *
 * A rule here is either an action that only happens in one half (`ACTION_HOURS`), a scene that only
 * happens in one half (`SCENE_HOURS`), or a job that goes better in its own hours (`jobHour`, in
 * the sim). Anything not listed happens in either.
 */
export type Half = 'day' | 'night';

/**
 * The hours of each half: the day's whole allowance (8 at the start, 11 at Kingpin), then three
 * after dark. The night is extra, not carved out of the day: carving it out (5/3 at the start)
 * halved the daylight territory game — the steady bot held 15% at day 60 instead of 23% — because
 * protection, buying and washing all happen by day. Full day plus three: 24%, and a night of work.
 */
export const splitHours = (apMax: number) => ({ day: apMax, night: 3 });

/** What the button says when something is in the wrong half, in the voice of the street. */
export const CLOSED: Record<Half, string> = {
  day: 'Not by daylight. Come back after dark.',
  night: 'Shut for the night. Come back in the morning.',
};

/** Scenes with a person that belong to one half. Talking and leaning happen any time. */
export const SCENE_HOURS: Partial<Record<string, { half: Half; why: string }>> = {
  protect: { half: 'day', why: 'The shutters are down. Pitch protection while the owner is behind the counter.' },
  squeeze: { half: 'day', why: 'The till is emptied at closing. Squeeze them while it is full.' },
  buy: { half: 'day', why: 'A sale needs a lawyer and a bank, and both keep office hours.' },
  recruit: { half: 'night', why: 'Nobody signs on sober. The regulars are out at their bars after dark.' },
  crew_pay: { half: 'night', why: 'The corner crews work nights. Find them after dark.' },
  crew_take: { half: 'night', why: 'The corner crews work nights. Find them after dark.' },
  crew_run: { half: 'night', why: 'The corner crews work nights. Find them after dark.' },
};

/** Actions that belong to one half, with why. */
export const ACTION_HOURS: Partial<Record<string, { half: Half; why: string }>> = {
  fixer_wash: { half: 'day', why: 'The fixer washes through a bank, and the bank keeps banking hours.' },
  rent_safehouse: { half: 'day', why: 'Landlords show rooms by day.' },
  upgrade_safehouse: { half: 'day', why: 'Landlords show rooms by day.' },
  travel_city: { half: 'day', why: 'The last train has gone. The first leaves in the morning.' },
  sell_street: { half: 'night', why: 'The corners do their business after dark.' },
  sit_down: { half: 'night', why: 'A sit-down is a dinner in a back room, and dinner is at night.' },
  attack: { half: 'night', why: 'Nobody starts a war at noon. Take it to them after dark.' },
  make_member: { half: 'night', why: 'Nobody is made in daylight. The ceremony is after dark, in a back room.' },
};

/** Shops sell by day; the fixer sells any time. Checked in `buy_item`. */
export const SHOP_WHY = 'The shop is shut for the night. The fixer sells at any hour.';

/**
 * How much a job's hour moves its odds. Break-ins, stick-ups and hits want the dark; cons, frauds
 * and anything done through an office want business hours, when the mark is at the desk.
 */
export const JOB_HOUR = { own: 8, wrong: -12, /** and how likely somebody saw it: fewer eyes in its own hours */ seenOwn: 0.7, seenWrong: 1.35 };
