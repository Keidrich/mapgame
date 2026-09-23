/**
 * The words around a job: titles, pitches and complications. Kept apart from the numbers so a
 * writer can add a line without touching a formula. `{T}` is the target, `{B}` the block, `{S}`
 * whoever brought it to you.
 */
import type { JobKind, Skill } from '@r/sim/types';

export const PITCH: Record<JobKind, string[]> = {
  burglary: ['{S} says {T} keeps the week\'s takings in a back-office safe, and the alarm has been broken since spring.', 'The back door at {T} sticks. Everybody on {B} knows it except the owner.', '{S} swept the floors at {T} for a month. The safe is behind the calendar.'],
  robbery: ['{T} does its banking on Fridays. Until then the cash sits in the till.', '{S} says {T} has one clerk after ten and no camera that works.', 'Masks, a bag, ninety seconds. {T} will not even call it in until morning.'],
  heist: ['{T}. The vault, not the counter. {S} has a floor plan and a guard who drinks.', 'Everybody says you cannot do {T}. {S} says everybody has not looked properly.', 'Once a month {T} holds more cash than it should. {S} knows which night.'],
  hijack: ['A truck bound for {T} comes through {B} every Tuesday with one driver and no escort.', '{S} knows the dispatcher at {T}. The load is worth more than the truck.', 'A shipment for {T} sits in a lay-by for an hour while the driver eats.'],
  hit: ['{S} wants {T} gone and will pay to make it happen.', '{T} has been talking to people who write things down. That has to stop.', 'Nobody will miss {T}, and somebody will be very grateful.'],
  kidnap: ['{T} has family money and walks home alone.', '{S} says {T}\'s people would pay anything to get them back, and they have plenty.', '{T} keeps a routine you could set a watch by.'],
  arson: ['{S} wants {T} to burn. The insurance is theirs; the fee is yours.', '{T} is in the way. A fire would fix that.', 'Old wiring at {T}. Nobody would be surprised.'],
  sabotage: ['{T} is making somebody else rich. That can stop for a while.', '{S} says the operation at {T} runs on one machine and one tired man.', 'Break what {T} runs on and the whole street notices whose it was.'],
  con: ['{T} has more money than sense and a weakness for a good story.', '{S} knows exactly what {T} wants to hear.', '{T} thinks they are the smartest person in any room. That is the whole con.'],
  fraud: ['{S} has blank forms from {T} and a signature that passes.', 'The books at {T} are a mess. A mess hides a transfer.', '{T} pays invoices nobody reads. Send them one.'],
  hack: ['{S} says the network at {T} still runs on the default password.', 'The card terminals at {T} phone home over an open line.', '{T} backs up to a server in the basement nobody patched.'],
  smuggle: ['A load is waiting at the docks. {S} needs it walked through {B} without anybody looking.', '{S} has product coming in and no way past the checkpoint on {B}.', 'Somebody has to drive a van from the water to {B}. Somebody careful.'],
  raid: ['{T} keeps a stash house on {B}. {S} counted the guards: not enough.', 'The {T} are sitting on a pile of cash and product. They will not be for long.', '{S} knows where the {T} count their money.'],
  frame: ['{T} is a problem the police could solve for you, with a little help.', 'Plant it, tip it, watch {T} explain it to a detective.', '{S} has something of {T}\'s that would look very bad in the wrong drawer.'],
};

export const TITLE: Record<JobKind, string[]> = {
  burglary: ['Night work at {T}', 'The safe at {T}', 'In through the back of {T}'],
  robbery: ['Take the till at {T}', 'Stick-up at {T}', 'Ninety seconds at {T}'],
  heist: ['The {T} job', 'Empty the vault at {T}', 'The big one: {T}'],
  hijack: ['The {T} truck', 'Take the {T} load', 'A delivery that never arrives'],
  hit: ['{T} has to go', 'A problem named {T}', 'Close the book on {T}'],
  kidnap: ['Snatch {T}', 'A week away for {T}', '{T}\'s people will pay'],
  arson: ['Torch {T}', 'An accident at {T}', '{T} burns'],
  sabotage: ['Wreck {T}', 'Shut down {T}', 'Sand in the works at {T}'],
  con: ['Take {T} for everything', 'A story for {T}', 'The mark: {T}'],
  fraud: ['Paper job at {T}', 'The {T} invoices', 'A transfer from {T}'],
  hack: ['Inside {T}', 'The back door at {T}', 'Wire job: {T}'],
  smuggle: ['Walk a load through {B}', 'The van to {B}', 'A run past the checkpoint'],
  raid: ['Hit the {T} stash', 'Take the {T} count', 'Raid on {B}'],
  frame: ['Hang it on {T}', 'A gift for the police: {T}', '{T} takes the fall'],
};

export interface ComplicationTemplate {
  id: string;
  title: string;
  text: string;
  kinds?: JobKind[];
  options: { id: string; label: string; skill: Skill; difficulty: number; pass: string; fail: string; payout: number; heat: number; safe?: boolean }[];
}

/** Each option is a real choice: a check against one skill, with its own price in heat and take. */
export const COMPLICATIONS: ComplicationTemplate[] = [
  { id: 'alarm', title: 'Silent alarm', text: 'A light on the panel you did not expect. Somebody, somewhere, knows.', kinds: ['burglary', 'heist', 'robbery', 'raid'],
    options: [
      { id: 'grab', label: 'Grab what is in reach and go', skill: 'wheels', difficulty: 30, pass: 'You are two streets away when the first car arrives.', fail: 'The getaway stalls at the lights. You get clear, barely, and light.', payout: 0.5, heat: 2, safe: true },
      { id: 'cut', label: 'Kill the line before it calls out', skill: 'tech', difficulty: 60, pass: 'The panel goes dark. Nobody is coming.', fail: 'The line was already open. You leave with sirens behind you.', payout: 1, heat: 3 },
      { id: 'push', label: 'Keep going — you have four minutes', skill: 'brains', difficulty: 55, pass: 'Three minutes fifty. Everything.', fail: 'Four minutes was a guess. It was wrong.', payout: 1.1, heat: 8 },
    ] },
  { id: 'witness', title: 'A witness', text: 'Somebody saw faces. They are standing very still.', kinds: ['robbery', 'hijack', 'hit', 'kidnap', 'arson', 'raid', 'burglary'],
    options: [
      { id: 'scare', label: 'Make sure they understand', skill: 'muscle', difficulty: 40, pass: 'They will not remember anything. Ever.', fail: 'They run. They will remember everything.', payout: 1, heat: 4 },
      { id: 'pay', label: 'Pay them to forget', skill: 'charm', difficulty: 35, pass: 'Money well spent.', fail: 'They take the money and talk anyway.', payout: 0.85, heat: 1 },
      { id: 'ignore', label: 'Ignore them and finish', skill: 'wheels', difficulty: 45, pass: 'Gone before they find a phone.', fail: 'They got a plate number.', payout: 1, heat: 7 },
    ] },
  { id: 'rival_crew', title: 'Somebody else had the same idea', text: 'Another crew, same target, same night. Everybody is armed.', kinds: ['heist', 'burglary', 'hijack', 'raid'],
    options: [
      { id: 'fight', label: 'Run them off', skill: 'muscle', difficulty: 60, pass: 'They leave faster than they came.', fail: 'It gets ugly. Everybody leaves bleeding.', payout: 1.1, heat: 9 },
      { id: 'split', label: 'Offer to split it', skill: 'charm', difficulty: 45, pass: 'Half of plenty is still plenty.', fail: 'They take the offer, and then they take the rest.', payout: 0.55, heat: 2, safe: true },
      { id: 'back', label: 'Back off and let them have it', skill: 'brains', difficulty: 10, pass: 'You walk. Nobody gets hurt.', fail: 'You walk, and they remember your faces.', payout: 0, heat: 0, safe: true },
    ] },
  { id: 'locked', title: 'It is not the lock they said', text: 'The plan said a dial. This is a time lock, and it is not opening tonight.', kinds: ['heist', 'burglary'],
    options: [
      { id: 'drill', label: 'Drill it anyway', skill: 'tech', difficulty: 65, pass: 'It gives, eventually.', fail: 'The bit snaps. Dawn comes.', payout: 1, heat: 5 },
      { id: 'smalls', label: 'Take the deposit boxes instead', skill: 'brains', difficulty: 35, pass: 'Jewellery, bonds, somebody\'s love letters.', fail: 'Mostly paperwork.', payout: 0.6, heat: 1, safe: true },
    ] },
  { id: 'cops_early', title: 'A patrol car, early', text: 'Headlights sweep the street. They are slowing down.', kinds: ['robbery', 'burglary', 'hijack', 'smuggle', 'arson', 'raid', 'kidnap'],
    options: [
      { id: 'drive', label: 'Floor it', skill: 'wheels', difficulty: 55, pass: 'They never get close.', fail: 'A chase through three districts, and not everybody makes it home.', payout: 1, heat: 9 },
      { id: 'talk', label: 'Stand there and talk your way out', skill: 'charm', difficulty: 60, pass: 'A wave, a smile, gone.', fail: 'They want to see inside the van.', payout: 1, heat: 5 },
      { id: 'dump', label: 'Dump it and walk', skill: 'brains', difficulty: 20, pass: 'Clean hands, empty ones.', fail: 'Clean hands, and your prints on the bag.', payout: 0.2, heat: 1, safe: true },
    ] },
  { id: 'mark_suspicious', title: 'The mark is getting suspicious', text: 'Questions. Too many, too specific.', kinds: ['con', 'fraud', 'frame'],
    options: [
      { id: 'double', label: 'Double down on the story', skill: 'charm', difficulty: 55, pass: 'By the end they are apologising to you.', fail: 'They call their lawyer.', payout: 1.2, heat: 3 },
      { id: 'cash_out', label: 'Take what is already moved and vanish', skill: 'brains', difficulty: 25, pass: 'Gone before they finish the sentence.', fail: 'Gone, but they got a good look.', payout: 0.5, heat: 1, safe: true },
    ] },
  { id: 'firewall', title: 'Somebody is watching the wire', text: 'A second session opens on their side. You are not alone in here.', kinds: ['hack', 'fraud'],
    options: [
      { id: 'race', label: 'Pull everything before they lock it', skill: 'tech', difficulty: 60, pass: 'Done before they finish typing.', fail: 'They trace you halfway home.', payout: 1.15, heat: 5 },
      { id: 'cover', label: 'Burn the trail and get out', skill: 'brains', difficulty: 35, pass: 'Nothing leads back.', fail: 'Something leads back.', payout: 0.6, heat: 1, safe: true },
    ] },
  { id: 'target_armed', title: 'They were ready', text: 'The target has people, and the people have guns.', kinds: ['hit', 'kidnap', 'raid', 'robbery'],
    options: [
      { id: 'through', label: 'Go through them', skill: 'muscle', difficulty: 65, pass: 'Over in seconds.', fail: 'Over in seconds, and not the way you wanted.', payout: 1, heat: 10 },
      { id: 'wait', label: 'Wait for a better moment', skill: 'brains', difficulty: 45, pass: 'The moment comes an hour later.', fail: 'The moment never comes. You go home.', payout: 0.9, heat: 2 },
    ] },
  { id: 'insider_cold_feet', title: 'The inside man wants out', text: 'Your contact is sweating, and wants more money or wants to leave.', kinds: ['heist', 'fraud', 'hijack', 'burglary'],
    options: [
      { id: 'pay', label: 'Pay what they want', skill: 'charm', difficulty: 25, pass: 'Bought, again.', fail: 'Bought, but they are shaking.', payout: 0.8, heat: 1 },
      { id: 'lean', label: 'Remind them what happens to quitters', skill: 'muscle', difficulty: 45, pass: 'They find their nerve.', fail: 'They find a phone booth.', payout: 1, heat: 6 },
    ] },
  { id: 'bonus', title: 'More than you were told', text: 'There is a second room nobody mentioned. It is full.', kinds: ['heist', 'burglary', 'raid', 'hijack'],
    options: [
      { id: 'take', label: 'Take it all — it means another trip', skill: 'wheels', difficulty: 50, pass: 'Two trips, a full van, nobody the wiser.', fail: 'The second trip is one too many.', payout: 1.6, heat: 7 },
      { id: 'leave', label: 'Stick to the plan', skill: 'brains', difficulty: 10, pass: 'Discipline pays what it pays.', fail: 'Discipline pays what it pays.', payout: 1, heat: 0, safe: true },
    ] },
];
