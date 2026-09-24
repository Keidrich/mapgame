/**
 * The family: ranks, the making ceremony, the two posts at the top, and the rules for betrayal.
 * Data, read by `sim/family.ts`.
 *
 * Everybody you hire starts as an **associate**: they work for you, they are not of you. A making
 * ceremony (at night, in a back room, with money on the table) makes one a **soldier** — made men
 * do not walk out, are harder for a rival to lean on, and cost more. A made man over a district is
 * a **capo**. Two made men can hold the posts at the top: the **consigliere**, who is your counsel
 * at every table, and the **underboss**, who keeps things running and takes over if you fall.
 */
export type FamilyRank = 'associate' | 'soldier' | 'capo' | 'consigliere' | 'underboss';
export type Post = 'consigliere' | 'underboss';

export const RANK_LABEL: Record<FamilyRank, string> = {
  associate: 'Associate', soldier: 'Soldier', capo: 'Capo', consigliere: 'Consigliere', underboss: 'Underboss',
};
export const RANK_BLURB: Record<FamilyRank, string> = {
  associate: 'Works for you. Not one of you — yet.',
  soldier: 'Made. Will not walk out on you, and a rival thinks twice before touching them.',
  capo: 'A made man over a district: its rackets run themselves.',
  consigliere: 'Your counsel: better sit-downs, cheaper envelopes at the Commission, and an ear for a rat.',
  underboss: 'Your second: rackets nobody is minding still earn, and the family is theirs if you fall.',
};

/**
 * The making ceremony. Level 2 and loyalty 50 — somebody who has done the work and stayed —
 * 2 hours after dark and money on the table; they come out of it more loyal and wanting more.
 */
export const MAKING = { level: 2, loyalty: 50, cost: 2500, ap: 2, loyaltyGain: 15, cutRise: 1.2, respect: 2 };
/** Made men are never let go by low loyalty: this is the floor under them. */
export const MADE_FLOOR = 30;

export const POSTS: Record<Post, { label: string; blurb: string }> = {
  consigliere: { label: 'Consigliere', blurb: RANK_BLURB.consigliere },
  underboss: { label: 'Underboss', blurb: RANK_BLURB.underboss },
};
/** What the consigliere is worth at the table. */
export const CONSIGLIERE = { sitDown: 8, tribute: 1.25, lobby: 0.75, auditPerBrains: 3, ratSpot: 0.25 };
/** What the underboss is worth: a racket nobody minds earns this much of its take, not 60%. */
export const UNDERBOSS = { unminded: 0.72 };

/**
 * Rats. An associate (made men far less often) whose loyalty has gone under 30, with a file open
 * against you, can start talking to the police. A rat adds evidence to your worst file every night
 * until found — by the consigliere most nights, by luck otherwise.
 */
export const RAT = { loyaltyUnder: 30, base: 0.03, perPoint: 0.001, madeMult: 0.25, evidence: 3, luck: 0.05, fedCut: 15 };

/**
 * Coups. A capo who is ambitious or greedy and whose loyalty has fallen under 25 makes a move.
 */
export const COUP = { loyaltyUnder: 25, chance: 0.04 };
