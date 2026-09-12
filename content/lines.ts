/** What people say when you walk in. Picked by the most telling trait; `default` when nothing fits. */
import type { Trait } from '@sim/types';

export type SceneKind = 'shakedown' | 'threaten' | 'visit' | 'recruit';
type Lines = Partial<Record<Trait | 'default' | 'scared' | 'friend', string[]>>;

export const OPENING: Record<SceneKind, Lines> = {
  shakedown: {
    coward: ['"Please. Whatever you want, just don\'t break anything."', '"I knew somebody would come. How much?"'],
    hothead: ['"You walk into my place like that? Get out before I put you out."', '"I don\'t pay. Ask around, I don\'t pay anybody."'],
    honest: ['"I pay taxes. I don\'t pay you."', '"If you\'re here for money you can talk to the police about it."'],
    greedy: ['"Everybody wants a piece. What do I get?"', '"Money I can talk about. What\'s the arrangement?"'],
    connected: ['"You know who drinks here, right? Careful."', '"I\'ve got friends. Do you?"'],
    quiet: ['They keep wiping the counter and don\'t look up.', 'A long silence. Then: "Say what you came to say."'],
    scared: ['"Not again. I already told you I\'d pay."', 'They flinch when you walk in.'],
    friend: ['"You? Come on. We\'re friends." They laugh, but the laugh dies fast.'],
    default: ['"What is this about?"', '"We\'re closed. Unless this is something else."'],
  },
  threaten: {
    coward: ['"Okay. Okay. I hear you."'],
    hothead: ['"Is that a threat? Say it again."', 'They come around the counter.'],
    honest: ['"I\'ll remember your face. So will the cops."'],
    loyal: ['"You don\'t scare me. You should be worried about who I work for."'],
    connected: ['"Do that again and people will hear about it."'],
    scared: ['They are already backing away.'],
    default: ['"What do you want from me?"'],
  },
  visit: {
    greedy: ['"Buying, or just talking? Talking is free for five minutes."'],
    gambler: ['"You look like a man who bets. Sit down."', '"Tell me you\'ve got a tip on the fourth race."'],
    junkie: ['They are jittery and glad of company.', '"You holding? No? Sit anyway."'],
    quiet: ['A nod. That\'s all you get at first.'],
    connected: ['"I know your face. I know most faces around here."'],
    honest: ['"Nice to see somebody polite for once."'],
    friend: ['"There he is! Sit, sit. What\'s new?"'],
    default: ['"Haven\'t seen you around. New to the block?"', '"What\'ll it be?"'],
  },
  recruit: {
    ambitious: ['"I\'ve been waiting for somebody to ask. What\'s the cut?"'],
    loyal: ['"I don\'t jump ship easy. Convince me."'],
    coward: ['"Me? I\'m not... I don\'t do that kind of thing." They look at the door.'],
    greedy: ['"Numbers. Talk numbers."'],
    junkie: ['"Steady money? Yeah. Yeah, I could use that."'],
    hothead: ['"About time. When do we start hurting people?"'],
    friend: ['"For you? Say the word."'],
    default: ['"Work? What kind of work?"'],
  },
};

export const APPROACHES: Record<SceneKind, { id: string; label: string; icon: string; blurb: string; good: string; bad: string }[]> = {
  shakedown: [
    { id: 'lean', label: 'Lean on them', icon: '👊', blurb: 'Muscle. Make it clear what happens if they don\'t pay.', good: 'Big envelope, +fear', bad: 'They dig in; heat, and word gets around' },
    { id: 'reason', label: 'Talk business', icon: '🤝', blurb: 'Charm. Protection is a service; you are the provider.', good: 'Steady envelope, a little trust', bad: 'Laughed off; −respect' },
    { id: 'wreck', label: 'Break something first', icon: '🔨', blurb: 'Crew. Smash the place up, then ask. Loud.', good: 'Biggest envelope, +fear on the block', bad: 'Cops, and an owner who hates you' },
  ],
  threaten: [
    { id: 'stare', label: 'Quiet word', icon: '😠', blurb: 'Muscle. No witnesses, no mess.', good: '+fear', bad: 'They shrug it off' },
    { id: 'crew', label: 'Bring the crew', icon: '👥', blurb: 'Show up with your people. Needs at least one active crew member.', good: '++fear, block notices', bad: 'Heat, and they still say no' },
    { id: 'family', label: 'Mention what you know', icon: '🗣️', blurb: 'Brains. Their debts, their kid, where they park.', good: '+fear, −trust', bad: 'An honest owner goes to the cops' },
  ],
  visit: [
    { id: 'drinks', label: 'Buy a round', icon: '🍻', blurb: 'Charm, and $50. Everybody\'s friend.', good: '+trust', bad: '+trust, but less' },
    { id: 'business', label: 'Talk business', icon: '💼', blurb: 'Brains. Who runs what, who owes whom.', good: '+respect and a useful tip', bad: '+respect, no tip' },
    { id: 'listen', label: 'Just listen', icon: '👂', blurb: 'Let them talk. Cheap and slow.', good: '+trust, maybe a rumour', bad: '+trust, a little' },
  ],
  recruit: [
    { id: 'cut', label: 'Offer a real cut', icon: '💵', blurb: 'Pay above the going rate. Loyal from day one.', good: 'Joins, high loyalty, +40% wage', bad: 'Joins anyway if they trust you' },
    { id: 'promise', label: 'Sell the dream', icon: '✨', blurb: 'Charm. Respect, money, a name on the block.', good: 'Joins at normal wage', bad: 'Not convinced; try again later' },
    { id: 'lean', label: 'Lean on them', icon: '😤', blurb: 'Fear. Cowards fold. Everyone else remembers.', good: 'Joins cheap, low loyalty', bad: '−trust, they avoid you' },
  ],
};

export const RESULT: Record<string, string[]> = {
  'shakedown:lean:ok': ['They count it out slowly and don\'t meet your eyes.', '"Fine. Fine. Take it."'],
  'shakedown:lean:fail': ['"Do what you want. I\'m not paying." They mean it, for now.', 'They pick up the phone and start dialling. You leave.'],
  'shakedown:reason:ok': ['"Alright. If it means the kids outside leave my customers alone."', '"Every week? Fine. But you keep your word."'],
  'shakedown:reason:fail': ['"Protection from what? You?" Somebody at the bar laughs.', '"I\'ve heard this speech before. Better versions."'],
  'shakedown:wreck:ok': ['Glass everywhere. They pay before you finish the sentence.', 'The jukebox is in pieces. So is their nerve.'],
  'shakedown:wreck:fail': ['The place is wrecked and they still won\'t pay. Sirens.', 'You made your point and gained nothing but heat.'],
  'threaten:stare:ok': ['They get very interested in the floor.'], 'threaten:stare:fail': ['They stare right back.'],
  'threaten:crew:ok': ['Three of you in the doorway. The whole block is watching.'], 'threaten:crew:fail': ['They lock the door and call it in.'],
  'threaten:family:ok': ['You mention the school on Elm. They go white.'], 'threaten:family:fail': ['"Say that again and I\'ll say it to a detective."'],
  'visit:drinks:ok': ['Two rounds later you are old friends.'], 'visit:drinks:fail': ['They drink your drinks and tell you nothing.'],
  'visit:business:ok': ['They know things. They tell you some of them.'], 'visit:business:fail': ['Polite, careful, useless.'],
  'visit:listen:ok': ['They talk. Eventually it gets interesting.'], 'visit:listen:fail': ['Weather, mostly.'],
  'recruit:cut:ok': ['"When do I start?"'], 'recruit:cut:fail': ['"Money\'s good. I still don\'t know you."'],
  'recruit:promise:ok': ['"A name on the block. Yeah. I\'m in."'], 'recruit:promise:fail': ['"Nice speech."'],
  'recruit:lean:ok': ['They nod without a word. They will not forget how this started.'], 'recruit:lean:fail': ['They walk out and do not come back for a while.'],
};
