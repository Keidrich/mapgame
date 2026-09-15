/** What people say when you walk in. Picked by the most telling trait; `default` when nothing fits. */
import type { LedgerKind, Trait } from '@sim/types';

export type SceneKind = 'shakedown' | 'threaten' | 'visit' | 'recruit' | 'parley' | 'broker';
type Lines = Partial<Record<Trait | 'default' | 'scared' | 'friend', string[]>>;

export const OPENING: Record<SceneKind, Lines> = {
  shakedown: {
    coward: [
      '"Please. Whatever you want, just don\'t break anything."',
      '"I knew somebody would come. How much?"',
      'Their hands are flat on the counter and staying there.',
      '"Take it out of the register. Take the register."',
      '"I\'m not going to be a problem. I want you to know that up front."',
    ],
    hothead: [
      '"You walk into my place like that? Get out before I put you out."',
      '"I don\'t pay. Ask around, I don\'t pay anybody."',
      'They put down what they were holding, slowly, so you can watch them do it.',
      '"Say one more word and we find out which of us is having a worse night."',
      '"My father built this. You think you\'re taking a cut of it?"',
    ],
    honest: [
      '"I pay taxes. I don\'t pay you."',
      '"If you\'re here for money you can talk to the police about it."',
      '"There\'s a word for what you\'re about to ask me for."',
      'They keep their eyes on you and reach for nothing.',
      '"I\'ve run this place eleven years without your help. I\'ll manage twelve."',
    ],
    greedy: [
      '"Everybody wants a piece. What do I get?"',
      '"Money I can talk about. What\'s the arrangement?"',
      '"Depends what it buys. Talk."',
      '"Is this a cost or an investment? Because I hear the second one differently."',
      'They are already doing the arithmetic. You can watch it happen.',
    ],
    connected: [
      '"You know who drinks here, right? Careful."',
      '"I\'ve got friends. Do you?"',
      '"Before you finish that sentence, ask yourself who I have lunch with."',
      'They glance at the corner table. Nobody at it looks up.',
      '"Somebody should have told you whose block this is."',
    ],
    quiet: [
      'They keep wiping the counter and don\'t look up.',
      'A long silence. Then: "Say what you came to say."',
      'They turn a page of the paper and wait.',
      'Nothing. Not even a change in what they were already doing.',
      'They pour themselves a coffee. They don\'t pour you one.',
    ],
    scared: [
      '"Not again. I already told you I\'d pay."',
      'They flinch when you walk in.',
      '"It\'s Tuesday. I thought you came Fridays."',
      'They have the envelope out before you reach the counter.',
      '"Whatever it is, the answer is yes. Please just say the number."',
    ],
    friend: [
      '"You? Come on. We\'re friends." They laugh, but the laugh dies fast.',
      '"Tell me you\'re here to drink." They can see you\'re not.',
      '"After everything?" They sit down slowly.',
      '"I always thought if it was anybody it\'d be somebody else."',
      'They smile all the way until they see your face, and then they stop.',
    ],
    default: [
      '"What is this about?"',
      '"We\'re closed. Unless this is something else."',
      '"Do I know you?"',
      'They finish serving somebody, take their time about it, and then look at you.',
      '"You\'re not here for the food."',
    ],
  },
  threaten: {
    coward: [
      '"Okay. Okay. I hear you."',
      '"You don\'t have to do that. Whatever it is, you don\'t have to."',
      'They are nodding before you have said anything.',
      '"Please." That is the whole sentence.',
      'They go very still, the way people do when they think it helps.',
    ],
    hothead: [
      '"Is that a threat? Say it again."',
      'They come around the counter.',
      '"Go on then. Right here, in front of everybody."',
      '"You brought that voice in here? In here?"',
      'They are smiling. It is not a good smile.',
    ],
    honest: [
      '"I\'ll remember your face. So will the cops."',
      '"There are laws about this. I know. I looked."',
      '"Do what you\'re going to do. I\'m not going to help you do it."',
      'They pick up the phone, put it down, and keep their hand on it.',
      '"You\'re not the first. The first one is doing four years."',
    ],
    loyal: [
      '"You don\'t scare me. You should be worried about who I work for."',
      '"I\'ve had this conversation with better."',
      '"Whatever you do to me, somebody does back. That\'s the arrangement."',
      'They shrug. It costs them nothing and they know it.',
      '"I\'d sooner take it than give you a name."',
    ],
    connected: [
      '"Do that again and people will hear about it."',
      '"You want to be very sure nobody is watching this."',
      '"I could make one call and your week gets long."',
      'They look past you, at the door, checking who saw you come in.',
      '"Names travel. Yours will."',
    ],
    scared: [
      'They are already backing away.',
      'They have both hands up and nothing in either.',
      '"I haven\'t said anything. I haven\'t said a word to anybody."',
      'They look at the back door and think better of it.',
      'Their voice comes out wrong on the first try.',
    ],
    default: [
      '"What do you want from me?"',
      '"Whatever this is, you\'ve got the wrong person."',
      'They stop what they were doing and wait for it.',
      '"Is this going to take long?"',
      'They look at you the way people look at weather.',
    ],
  },
  visit: {
    greedy: [
      '"Buying, or just talking? Talking is free for five minutes."',
      '"If there\'s money in this, sit down. If not, sit down anyway and be quick."',
      '"Everybody wants something. What\'s yours?"',
      'They count the till while you talk, and hear every word.',
      '"You have the look of a man with a proposition."',
    ],
    gambler: [
      '"You look like a man who bets. Sit down."',
      '"Tell me you\'ve got a tip on the fourth race."',
      '"Pick a number. Go on, any number."',
      'They are doing the form guide and do not stop doing it.',
      '"I\'m down eighty and I feel very good about it."',
    ],
    junkie: [
      'They are jittery and glad of company.',
      '"You holding? No? Sit anyway."',
      'They talk fast and about three things at once.',
      '"What time is it? Never mind. Sit down."',
      'They keep checking the door, out of habit rather than fear.',
    ],
    quiet: [
      'A nod. That\'s all you get at first.',
      'They move down the bar so there is room, and say nothing about it.',
      'They wait. They are good at it.',
      'A long look, then back to what they were doing.',
      'They push the ashtray toward you. That is the greeting.',
    ],
    connected: [
      '"I know your face. I know most faces around here."',
      '"You came in with somebody last month. I don\'t forget that."',
      '"Ask me who runs what. Go on. I like the question."',
      'They already know why you are here. They let you say it anyway.',
      '"Half this room owes the other half. Sit somewhere neutral."',
    ],
    honest: [
      '"Nice to see somebody polite for once."',
      '"Sit anywhere. It\'s all the same chairs."',
      '"You want coffee? It\'s free and it\'s terrible."',
      'They put down a glass of water you did not order.',
      '"Long as you\'re not selling anything, you\'re welcome."',
    ],
    friend: [
      '"There he is! Sit, sit. What\'s new?"',
      '"I was just talking about you. Nothing bad."',
      '"Same as last time? Don\'t answer, I\'m pouring it."',
      'They come out from behind the bar to shake your hand.',
      '"You\'ve been a stranger. Sit down and stop that."',
    ],
    default: [
      '"Haven\'t seen you around. New to the block?"',
      '"What\'ll it be?"',
      '"Sit where you like. It\'s dead."',
      'They look up, decide you are nobody, and look down again.',
      '"You want something, or are you waiting on somebody?"',
    ],
  },
  broker: {
    default: [
      '"You want to play peacemaker? Fine. Talk. We\'re listening, which is more than they get."',
      'A back room, two chairs, one for each side. Yours is by the door.',
      '"Nobody sits until everybody sits. That\'s how it works."',
      'Two men come in ahead of the man you are here to see, and check the room.',
      '"We came. That\'s the most anybody\'s done in a month."',
    ],
    hothead: [
      '"Peace? With them? Say what you came to say and then get out."',
      '"They buried two of mine. What exactly are we discussing?"',
      '"You\'re at the wrong table. The wrong table is that one."',
      'They do not take their coat off. That is deliberate.',
      '"I\'ll listen. I won\'t agree, but I\'ll listen."',
    ],
    ambitious: [
      '"A sit-down that stops the bleeding would make a lot of people look at you differently. Including me."',
      '"Whoever ends this gets to say they ended it. Bear that in mind."',
      '"There\'s a chair at the top of this and it\'s empty. Talk."',
      'They arrive early, alone, and pick the seat facing the room.',
      '"I don\'t want peace. I want the credit for it. Same thing today."',
    ],
    friend: [
      '"If anyone can make them listen, it\'s you. Go on."',
      '"You asked. That\'s why I\'m in the chair and not at home."',
      '"For you I\'ll sit across from them. Don\'t make me regret it."',
      'They squeeze your shoulder on the way past and say nothing.',
      '"Say your piece. I\'ll back whatever it is, within reason."',
    ],
  },
  parley: {
    hothead: [
      '"This is our corner. You lost?"',
      'Three of them get up off the stoop at once.',
      '"Walk it back the way you came and we\'ll all have a nice night."',
      '"You\'re standing on it. Right now. You know that?"',
      'Somebody behind them says a name. It is not a nice one and it is about you.',
    ],
    ambitious: [
      '"You the one everybody\'s talking about? Good. Let\'s talk."',
      '"I\'ve been waiting to meet whoever\'s been making all that noise."',
      '"Sit on the step. Everybody who matters has sat on that step."',
      'They send the others inside. They want this conversation to themselves.',
      '"Tell me what you\'re building. Then tell me where I am in it."',
    ],
    coward: [
      '"We don\'t want trouble. What do you want?"',
      '"Whatever you heard, it wasn\'t us."',
      'The youngest one looks at the oldest one and neither of them looks at you.',
      '"We\'re just sitting here. That\'s all this is."',
      '"Say it quick. Please."',
    ],
    greedy: [
      '"Everything on this block goes through us. Everything. So what\'s in it for us?"',
      '"You\'re not the first with a speech. The first one came with numbers."',
      '"Talking\'s cheap and the corner isn\'t. Which are you offering?"',
      'They rub their fingers together and wait for you to notice.',
      '"We take a cut of everything that walks past. Why would you be different?"',
    ],
    scared: [
      'They keep their hands where you can see them.',
      'Two of them went inside when you turned the corner and have not come out.',
      '"We heard about the last block. We heard all of it."',
      'Nobody sits back down.',
      '"Whatever you\'re about to say, we\'re already saying yes."',
    ],
    friend: [
      '"Look who it is. Sit down, sit down."',
      '"Told you he\'d come." Somebody moves along the step to make room.',
      '"You want something. Ask. We\'ll probably do it."',
      'Somebody puts a bottle in your hand before you have said anything.',
      '"Business or the other thing? Either\'s fine."',
    ],
    default: [
      '"Say what you came to say."',
      'Nobody moves. Somebody turns the music down.',
      '"We know who you are. Doesn\'t mean anything yet."',
      'They look at each other first, then at you.',
      '"You\'ve got until the song ends."',
    ],
  },
  recruit: {
    ambitious: [
      '"I\'ve been waiting for somebody to ask. What\'s the cut?"',
      '"I\'m too good for this counter and we both know it."',
      '"Where does this go? Not the money. Where does it go."',
      'They are already taking their apron off.',
      '"I don\'t want a job. I want a piece of something."',
    ],
    loyal: [
      '"I don\'t jump ship easy. Convince me."',
      '"The man I work for gave me work when nobody would."',
      '"Ask me again in a year and I\'ll still say the same thing. Probably."',
      'They hear you out, which is more than they were going to do.',
      '"What would you do with somebody who left the last one?"',
    ],
    coward: [
      '"Me? I\'m not... I don\'t do that kind of thing." They look at the door.',
      '"I\'m no good at anything you\'d want."',
      '"Does it involve, you know. Any of that?"',
      'They laugh once, and it is nerves all the way through.',
      '"I have a kid. That\'s not a no, it\'s just a thing you should know."',
    ],
    greedy: [
      '"Numbers. Talk numbers."',
      '"Weekly or daily? It matters."',
      '"What\'s the ceiling? Not the floor. The ceiling."',
      'They put down the glass and give you their whole attention.',
      '"I\'ll do most things. Most. Start with the money."',
    ],
    junkie: [
      '"Steady money? Yeah. Yeah, I could use that."',
      '"How soon is the first one?"',
      '"I\'m good. I\'m fine. I\'m very good right now."',
      'They agree before they have heard what it is.',
      '"Nobody\'s offered me anything in a long time."',
    ],
    hothead: [
      '"About time. When do we start hurting people?"',
      '"I\'ve got a list. You can have the top half of it."',
      '"Point me at something."',
      'They crack their knuckles, which is either a habit or a sales pitch.',
      '"Tell me it\'s not standing around. I can\'t do standing around."',
    ],
    friend: [
      '"For you? Say the word."',
      '"I was wondering when you\'d get round to it."',
      '"You don\'t have to sell it. It\'s you."',
      'They are grinning before you finish the sentence.',
      '"What are we doing? Don\'t answer that in here."',
    ],
    default: [
      '"Work? What kind of work?"',
      '"Depends what it is and who else knows."',
      '"I\'ve got a job. It\'s bad, but it\'s a job."',
      'They wipe their hands and give you about half their attention.',
      '"Say the rest of it."',
    ],
  },
};

export const APPROACHES: Record<SceneKind, { id: string; label: string; icon: string; blurb: string; good: string; bad: string }[]> = {
  shakedown: [
    { id: 'lean', label: 'Lean on them', icon: 'fist', blurb: 'Muscle. Make it clear what happens if they don\'t pay.', good: 'Big envelope, +fear', bad: 'They dig in; heat, and word gets around' },
    { id: 'reason', label: 'Talk business', icon: 'crew', blurb: 'Charm. Protection is a service; you are the provider.', good: 'Steady envelope, a little trust', bad: 'Laughed off; −respect' },
    { id: 'wreck', label: 'Break something first', icon: 'intimidate', blurb: 'Crew. Smash the place up, then ask. Loud.', good: 'Biggest envelope, +fear on the block', bad: 'Cops, and an owner who hates you' },
  ],
  threaten: [
    { id: 'stare', label: 'Quiet word', icon: 'watching', blurb: 'Muscle. No witnesses, no mess.', good: '+fear', bad: 'They shrug it off' },
    { id: 'crew', label: 'Bring the crew', icon: 'crew', blurb: 'Show up with your people. Needs at least one active crew member.', good: '++fear, block notices', bad: 'Heat, and they still say no' },
    { id: 'family', label: 'Mention what you know', icon: 'social', blurb: 'Brains. Their debts, their kid, where they park.', good: '+fear, −trust', bad: 'An honest owner goes to the cops' },
  ],
  visit: [
    { id: 'drinks', label: 'Buy a round', icon: 'bar', blurb: 'Charm, and $50. Everybody\'s friend.', good: '+trust', bad: '+trust, but less' },
    { id: 'business', label: 'Talk business', icon: 'collect', blurb: 'Brains. Who runs what, who owes whom.', good: '+respect and a useful tip', bad: '+respect, no tip' },
    { id: 'listen', label: 'Just listen', icon: 'rat', blurb: 'Let them talk. Cheap and slow.', good: '+trust, maybe a rumour', bad: '+trust, a little' },
  ],
  broker: [
    { id: 'split', label: 'Sweeten it', icon: 'cash', blurb: 'Charm and cash. $2,000 to each side to make sitting down worth their while.', good: 'Truce between them; both owe you', bad: 'They take the money and keep shooting' },
    { id: 'lean', label: 'Bang heads', icon: 'fist', blurb: 'Fear and crew. Tell both sides the shooting stops because you say so.', good: 'Truce; everybody remembers who ended it', bad: 'Both sides decide you are the problem' },
    { id: 'favour', label: 'Call in a favour', icon: 'crew', blurb: 'Standing. Ask the side that likes you to give a little first.', good: 'Truce; costs you nothing', bad: 'They feel used; standing drops' },
  ],
  parley: [
    { id: 'tribute', label: 'Put them on the payroll', icon: 'cash', blurb: 'Charm and respect. They keep the corner, pay you weekly, and the block is yours.', good: 'Block turns yours; weekly cash', bad: 'Laughed off; they dig in' },
    { id: 'join', label: 'Bring them in', icon: 'crew', blurb: 'Trust. Their boss joins your crew; their people become yours to recruit.', good: 'A made crew member and recruits', bad: 'They want to see more first' },
    { id: 'fund', label: 'Stake them', icon: 'collect', blurb: 'Cash. Pay for a shop on their corner. They own it and run it; you take a share and do none of the work.', good: 'A racket you never have to stand in', bad: 'They hear an offer and remember you made it' },
    { id: 'warn', label: 'Run them off', icon: 'fist', blurb: 'Muscle. Make them small. No body, no cops.', good: 'They lie low; +fear on the block', bad: 'They come back at you tonight' },
  ],
  recruit: [
    { id: 'cut', label: 'Offer a real cut', icon: 'cash', blurb: 'Pay above the going rate. Loyal from day one.', good: 'Joins, high loyalty, +40% wage', bad: 'Joins anyway if they trust you' },
    { id: 'promise', label: 'Sell the dream', icon: 'respect', blurb: 'Charm. Respect, money, a name on the block.', good: 'Joins at normal wage', bad: 'Not convinced; try again later' },
    { id: 'lean', label: 'Lean on them', icon: 'fist', blurb: 'Fear. Cowards fold. Everyone else remembers.', good: 'Joins cheap, low loyalty', bad: '−trust, they avoid you' },
  ],
};

export const RESULT: Record<string, string[]> = {
  'shakedown:lean:ok': [
    'They count it out slowly and don\'t meet your eyes.',
    '"Fine. Fine. Take it."',
    'The money comes out of a drawer that was not the till.',
    'They pay, and they say the amount out loud so you both heard it.',
    '"Same time next week, then." It is not really a question.',
  ],
  'shakedown:lean:fail': [
    '"Do what you want. I\'m not paying." They mean it, for now.',
    'They pick up the phone and start dialling. You leave.',
    '"No." They go back to work with their back to you.',
    'They open the register, show you it is empty, and close it again.',
    'Somebody in the back has come out to watch, and you are outnumbered.',
  ],
  'shakedown:reason:ok': [
    '"Alright. If it means the kids outside leave my customers alone."',
    '"Every week? Fine. But you keep your word."',
    '"I\'d rather pay you than pay for the window again."',
    'They shake on it, which nobody asked them to do.',
    '"Put it like that and it\'s just another bill."',
  ],
  'shakedown:reason:fail': [
    '"Protection from what? You?" Somebody at the bar laughs.',
    '"I\'ve heard this speech before. Better versions."',
    '"You should sell insurance. Properly, I mean."',
    'They let you finish the whole thing and then shake their head.',
    '"Nothing has happened to this place in nine years."',
  ],
  'shakedown:wreck:ok': [
    'Glass everywhere. They pay before you finish the sentence.',
    'The jukebox is in pieces. So is their nerve.',
    'One table goes over and the rest of it is just arithmetic.',
    'They are still on the floor when they tell you where the money is.',
    'Nobody else in the room moves the entire time.',
  ],
  'shakedown:wreck:fail': [
    'The place is wrecked and they still won\'t pay. Sirens.',
    'You made your point and gained nothing but heat.',
    'They sit in the middle of it and laugh at you until you leave.',
    'Halfway through, somebody outside starts shouting for the police.',
    'Broken glass, an empty till, and a man who now hates you for free.',
  ],
  'threaten:stare:ok': [
    'They get very interested in the floor.',
    'Whatever they were going to say, they don\'t.',
    'They nod once, quickly, and keep nodding after you have stopped.',
    'Nothing is said. Nothing needs to be.',
    'They find something to do with their hands.',
  ],
  'threaten:stare:fail': [
    'They stare right back.',
    'They hold it until you are the one who looks away.',
    '"Was that it?"',
    'They go back to what they were doing, which is the answer.',
    'Somebody behind them laughs, and they let it happen.',
  ],
  'threaten:crew:ok': [
    'Three of you in the doorway. The whole block is watching.',
    'Nobody has to say anything. That is rather the point.',
    'They look at the four of you and start agreeing immediately.',
    'The room clears out around them. That does most of the work.',
    'Two of yours stay by the door while they talk. They talk quickly.',
  ],
  'threaten:crew:fail': [
    'They lock the door and call it in.',
    'They count your people, out loud, and are not impressed.',
    'Somebody upstairs opens a window and starts writing things down.',
    'They walk straight through the middle of you and out.',
    'Four of you on a pavement, being looked at by everybody.',
  ],
  'threaten:family:ok': [
    'You mention the school on Elm. They go white.',
    'You get about six words in and they ask you to stop.',
    'You say the name of the street. Then their wife\'s name. That is enough.',
    'They sit down without deciding to.',
    '"Don\'t. Whatever you want, don\'t finish that."',
  ],
  'threaten:family:fail': [
    '"Say that again and I\'ll say it to a detective."',
    '"You went and looked all that up. That\'s sad, is what that is."',
    'They write the name of your outfit on a napkin, slowly, and pocket it.',
    '"Everybody knows where my kids go. It\'s a small neighbourhood."',
    'It lands, and it lands as hatred rather than fear.',
  ],
  'visit:drinks:ok': [
    'Two rounds later you are old friends.',
    'They insist on buying the third, which is how you know it worked.',
    'Somebody starts a story they have clearly told before. You laugh anyway.',
    'You leave later than you meant to and it was worth it.',
    'By closing they are telling you things they should not.',
  ],
  'visit:drinks:fail': [
    'They drink your drinks and tell you nothing.',
    'Polite, thirsty, and closed for business.',
    'Two hours of the weather and a very careful goodbye.',
    'They toast you, twice, and give you nothing either time.',
    'You buy, they drink, and the conversation never once leaves the bar.',
  ],
  'visit:business:ok': [
    'They know things. They tell you some of them.',
    'A name you did not have, and where he drinks.',
    'They draw the block on a beer mat and mark two doors.',
    '"You didn\'t hear it here." You did, though.',
    'Ten minutes, and you leave knowing who owes whom.',
  ],
  'visit:business:fail': [
    'Polite, careful, useless.',
    'Everything they tell you, you already knew.',
    '"I keep out of all that." They do not keep out of all that.',
    'They answer three questions with the same answer.',
    'You get the version of the block that gets told to strangers.',
  ],
  'visit:listen:ok': [
    'They talk. Eventually it gets interesting.',
    'Forty minutes of nothing, and then one sentence worth the forty minutes.',
    'They tell you about a cousin. The cousin turns out to matter.',
    'Nobody has listened to them in a while and it shows.',
    'They run out of small talk and keep going anyway.',
  ],
  'visit:listen:fail': [
    'Weather, mostly.',
    'A very long story about a van.',
    'They talk for an hour and say nothing at all.',
    'You learn a great deal about their knee.',
    'Somebody calls them away and they look relieved.',
  ],
  'parley:tribute:ok': [
    '"Fine. Every Friday. Don\'t make us regret it."',
    '"Weekly. And you keep the other outfits off this step."',
    'The oldest one shrugs and the rest of them follow it.',
    '"We were paying somebody anyway."',
    'They name a Friday and go back to sitting down.',
  ],
  'parley:tribute:fail': [
    '"Pay YOU? Get off our corner."',
    '"We don\'t pay. That\'s the whole reason we\'re out here."',
    'Somebody spits on the step between you.',
    '"Come back when you\'ve got more than a voice."',
    'They laugh until you stop talking, and then keep laughing.',
  ],
  'parley:join:ok': [
    '"About time somebody real showed up. We\'re in."',
    '"The corner\'s a corner. You\'re offering somewhere to go."',
    'They look at each other once and that is the whole vote.',
    '"Say where and when." They mean tonight.',
    'The boss stands up and shakes your hand in front of all of them.',
  ],
  'parley:join:fail': [
    '"We\'ll think about it." They won\'t.',
    '"We\'ve got something here. It\'s small, but it\'s ours."',
    '"Ask us again when you\'ve got more than a block."',
    'Nobody stands up. That is the answer.',
    '"You want soldiers. We were soldiers. That\'s why we\'re out here."',
  ],
  'parley:fund:ok': [
    '"Your money, our corner. We\'ll send yours on."',
    '"A shop. An actual shop." They cannot quite believe it.',
    'They argue about the name of the place before the money has landed.',
    '"Nobody\'s ever offered us anything that wasn\'t work."',
    'Handshakes all round, and somebody is already measuring the doorway.',
  ],
  'parley:fund:fail': [
    '"We don\'t need a partner. We need you off the stoop."',
    '"That\'s a leash with money on it."',
    '"And when we miss a week? What happens then?"',
    'They ask who owns the shop, hear the answer, and stop listening.',
    '"We\'ve seen people take that deal. We know where they are now."',
  ],
  'parley:warn:ok': [
    'They fold. The stoop is empty by the time you reach the corner.',
    'Nobody comes back out for the rest of the night.',
    'They go inside one at a time, which is somehow worse for them.',
    'The music goes off and stays off.',
    'Word is round the block before you have finished walking it.',
  ],
  'parley:warn:fail': [
    'Bottles. You leave before the second one lands.',
    'There are more of them inside than there were outside.',
    'They come off the step all at once and you are walking backwards.',
    'Somebody has a bat and somebody else has the door open.',
    'You get to the corner and they are still shouting your name.',
  ],
  'broker:split:ok': [
    'Envelopes change hands. Hands get shaken. Nobody means it, but it holds.',
    'The money does what the talking could not.',
    'Both sides count it before they agree. Both sides agree.',
    'A truce bought at market rate, and everybody knows the price.',
    'They leave through different doors, which was always the plan.',
  ],
  'broker:split:fail': [
    'They pocket the money and shoot each other on the way out.',
    'Both sides take it. Neither side stops.',
    'The envelopes go straight into coats and the shouting starts again.',
    '"You paid us to sit here. We sat here."',
    'Four thousand dollars and the war is a day older.',
  ],
  'broker:lean:ok': [
    'Silence. Then a nod from each side. It stops tonight.',
    'Nobody argues with it, which tells you how it was said.',
    'One of them starts to speak and the other one shakes his head.',
    'They agree to your face and will complain about it for months.',
    'It stops because you said so. Everybody in the room notes that.',
  ],
  'broker:lean:fail': [
    '"Who the hell are you to tell us anything?"',
    'Both sides look at you and find the same thing funny.',
    'Chairs go back. The sit-down is over and nothing was settled.',
    '"We were killing each other before you had a block."',
    'You unite them, briefly, against you.',
  ],
  'broker:favour:ok': [
    '"For you. Once." The other side takes the offer before it can be withdrawn.',
    'One side gives an inch because you asked. The other side runs at it.',
    '"We\'re doing this for him, not for you." Said to the room, about you.',
    'It costs you nothing today and everybody in the room knows it cost something.',
    'A small concession, made publicly, and the war ends on it.',
  ],
  'broker:favour:fail': [
    '"You are spending a lot of goodwill on people who would not do the same for you."',
    '"We owe you. We don\'t owe you this."',
    'The side that likes you says no, and says it kindly, which is worse.',
    '"Ask for money next time. Money\'s easier."',
    'They give the inch and the other side asks for the yard.',
  ],
  'recruit:cut:ok': [
    '"When do I start?"',
    'They ask twice what the number is, hear it twice, and say yes.',
    '"That\'s more than I make in a week." It is.',
    'They hand their apron to somebody else on the way out.',
    '"Don\'t change it later." You agree not to change it later.',
  ],
  'recruit:cut:fail': [
    '"Money\'s good. I still don\'t know you."',
    '"People who pay that much want something I haven\'t heard yet."',
    '"Ask me when we\'ve known each other longer."',
    'They think about it properly, which is the closest you get.',
    '"It\'s a lot. That\'s the part that worries me."',
  ],
  'recruit:promise:ok': [
    '"A name on the block. Yeah. I\'m in."',
    'They have wanted somebody to say that to them for years.',
    '"Nobody\'s ever put it like that." They are already standing.',
    'You describe a life and they take the whole thing.',
    '"Alright. Alright. Where do I go?"',
  ],
  'recruit:promise:fail': [
    '"Nice speech."',
    '"I\'ve heard that one. The man who said it is dead."',
    'They listen to all of it and then ask about the money.',
    '"You believe that. I\'ll give you that much."',
    '"Come back when there\'s something behind it."',
  ],
  'recruit:lean:ok': [
    'They nod without a word. They will not forget how this started.',
    'They agree. Nothing about the way they agree is good.',
    'They ask what happens if they say no. You tell them. They say yes.',
    'You get a man, and you get the version of him that was made just now.',
    'They do not look at you again for the rest of the conversation.',
  ],
  'recruit:lean:fail': [
    'They walk out and do not come back for a while.',
    '"You\'ve just told me exactly what working for you is like."',
    'They call you something on the way out, loudly, so the room hears it.',
    'Whatever chance there was, that was it.',
    'They stand there and take it, and the answer is still no.',
  ],
};

/**
 * What somebody with a record says, instead of what their trait would have said.
 *
 * A nemesis is not an ordinary person who happens to be angry. They are the lieutenant who keeps
 * turning up, and by the time `isNemesis` is true they have a history with the player that the
 * trait tables cannot express — a hothead met once and a hothead who has beaten you three times
 * were reading from the same six lines, which made the whole recurring-antagonist arc sound like
 * furniture. This **replaces** the trait pick rather than adding to it, because when somebody with
 * a record walks in, the record is the thing in the room.
 *
 * `{name}` is their working name, which after the `named` milestone is the one the street gave
 * them. `{wins}` is how many times they have had the better of you; the line is chosen by
 * `sim/scenes.ts` so that a line mentioning it only comes up when there is a number worth saying.
 */
export const NEMESIS_OPENING: Record<SceneKind, string[]> = {
  shakedown: [
    '"You\'re collecting? Here? From me?" {name} does not stand up.',
    '"We keep meeting in rooms like this. One day it\'ll be a different kind of room."',
    '"Ask. I want to hear you ask."',
    '{name} counts something that is not money and waits for you to finish.',
    '"Last time you wanted something you got it. That was last time."',
  ],
  threaten: [
    '"That again?" {name} has heard this voice from you before.',
    '"You\'ve been telling me what happens next for a while now."',
    '"Go on. You know how this usually ends."',
    '{name} looks at you the way you look at a bill you have already paid.',
    '"You and me have done this {wins} times. I remember all of them."',
  ],
  visit: [
    '"Of all the doors." {name} does not look surprised, or pleased.',
    '"Sit down. I\'m not going to do anything in here."',
    '"We should stop meeting where there are witnesses. Or start."',
    '{name} moves a chair out with one foot and leaves it at that.',
    '"You want to talk. Everybody wants to talk after."',
  ],
  parley: [
    '"Everybody out." {name} wants this one without an audience.',
    '"You walked onto this corner knowing I was on it."',
    '"I\'ve got a whole speech for you and I\'ve had it a while."',
    'The corner goes quiet the way a corner does when {name} is on it.',
    '"You\'re either very confident or very lost."',
  ],
  broker: [
    '"They sent me. Of course they sent me." {name} sits without being asked.',
    '"Anybody else at this table and we\'d have finished by now."',
    '"Say your piece. I\'ll even listen to it."',
    '{name} takes the chair facing the door and gives you the other one.',
    '"Peace. From you. Put it in front of me and let\'s see."',
  ],
  recruit: [
    '"You want me to work for you." {name} says it flatly, to hear how it sounds.',
    '"After all that? That\'s the offer?"',
    '"There isn\'t a number. I want you to understand there isn\'t a number."',
    '{name} laughs once, and it is not the laugh of somebody saying no.',
    '"Say it again. Slowly. I want to be sure I heard it."',
  ],
};

/**
 * What a stranger says about a name they have only heard.
 *
 * The exact pattern `lifestyleLine` uses — a suffix clause, chosen from a small table, appended to
 * whatever they were going to say — and deliberately not a second mechanism. The difference is what
 * it reads: the car and the coat are things in front of them, and this is the one thing that
 * arrives before you do. It fires on a **first** meeting only, because that is the whole point: a
 * reputation is what people know about you when they do not know you.
 *
 * `{street}` is the earned name alone, without the given one, because that is what they would have
 * heard in a bar.
 */
export const REPUTATION_OPENING: string[] = [
  ' Then, carefully: "You\'re {street}, aren\'t you. I\'ve heard that name."',
  ' They place you halfway through their own sentence, and the rest of it comes out differently.',
  ' "{street}." They say it like they are checking an answer.',
  ' Somebody at the next table says the name before they do, and they both hear it.',
  ' They have never met you and they already know what to call you.',
  ' "I know the name. I didn\'t know the face went with it."',
];

/**
 * One clause about the last thing that actually passed between you.
 *
 * Keyed by `LedgerKind`, because the kind is the part worth saying out loud: "you did me a favour"
 * and "you put your hands on me" are different conversations, and which one it was is exactly what
 * the opening should carry. The ledger's own `text` is not spliced in — it is written as narration
 * ("You gave them $500.") and does not survive being put inside quotation marks. The receipt, if
 * the player wants it, is the `(Last time: ...)` clause the conversation screen already appends.
 *
 * `{when}` is how long ago, in the words somebody would actually use.
 */
export const LEDGER_CALLBACK: Partial<Record<LedgerKind, string[]>> = {
  favour: [
    ' "You did me a turn {when}. I hadn\'t forgotten."',
    ' They remember what you did {when}, and they say so before you can.',
    ' "We\'re square from {when}, near enough. Near enough."',
    ' Whatever they were going to say, {when} changed it.',
  ],
  owed: [
    ' "I owe you from {when}. I know I do."',
    ' They bring up {when} themselves, which saves you doing it.',
    ' "You\'ll be here about {when}."',
    ' There is a debt between you from {when} and they are the one who mentions it.',
  ],
  threat: [
    ' "Last time you were in here you weren\'t asking." They mean {when}.',
    ' They have not forgotten {when}, and they are careful with their hands.',
    ' "We did this {when}. I didn\'t enjoy it."',
    ' Something from {when} is sitting in the room with you both.',
  ],
  harm: [
    ' "After {when}? You come in here after {when}?"',
    ' They do not sit down. Nobody has to say what {when} was.',
    ' "You\'ve got a nerve, coming in here after {when}."',
    ' What happened {when} is the first thing in their face.',
  ],
  deal: [
    ' "The arrangement from {when} is holding. Just so you know."',
    ' They mention the business you did {when} and wait to see where this goes.',
    ' "Same as {when}, or something new?"',
    ' They treat you like somebody they have already done business with, because {when} they did.',
  ],
  talk: [
    ' "We left something unfinished {when}."',
    ' They pick up roughly where you left it {when}.',
    ' "You were saying something {when}. Go on."',
    ' They remember the conversation from {when} better than you expected.',
  ],
  read: [
    ' They are aware you had a good long look at them {when}.',
    ' "You had your eyes all over me {when}. Did you get what you wanted?"',
    ' Something about the way you looked at them {when} has stayed with them.',
    ' They watch you watching them, the way they did {when}.',
  ],
  intel: [
    ' "Whatever you got out of me {when}, I hope it was worth it."',
    ' They are quieter than they were {when}, and they are choosing words.',
    ' "You asked a lot of questions {when}."',
    ' They have had {when} to think about what you were really after.',
  ],
  door: [
    ' "You were at my door {when}. I remember who wasn\'t asleep."',
    ' They have not forgotten who came {when}.',
    ' "That was you {when}. Don\'t insult me by pretending otherwise."',
    ' {when} is the reason the door was slow to open.',
  ],
};
