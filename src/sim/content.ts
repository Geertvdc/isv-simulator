/** Text content. Add jokes freely. */

import type { TicketKind } from './tickets';

/** Flavour titles for tickets; they don't change how a ticket plays. */
export const TICKET_TITLES: readonly string[] = [
  'Fix login button',
  'Upgrade to YAML 2',
  'Make the logo bigger',
  'Add dark mode',
  'Center a div',
  'Remove console.log',
  'Fix flaky test',
  'Rename variable x',
  'Support Internet Explorer',
  'Add AI to it',
  'Update copyright year',
  'Make it pop',
  'Fix typo in README',
  'Bump dependencies',
  'Undo the last fix',
  'Migrate to the cloud',
];

/** Titles for production incidents; one is picked per incident. */
export const INCIDENT_TITLES: readonly string[] = [
  'Prod is down',
  'Database on fire',
  'Certificate expired',
  "It's DNS",
  'Disk full',
  'Login loop',
  'Memory leak',
  'Pager going off',
  'Checkout broken',
  'Leaked API key',
];

/** Over the order bar while an incident is open. */
export const INCIDENT_BANNER_TEXT = 'INCIDENT! New features on hold until the hotfix ships';

/** Shown next to the points when a ticket ships with tests skipped. */
export const UNTESTED_SHIP_TEXT = 'YOLO!';

/** Shown when a finished build was left too long and the pipeline broke. */
export const PIPELINE_BROKE_TEXT = 'Build server down!';

/** Pops up over the pipeline once it's repaired. */
export const PIPELINE_FIXED_TEXT = 'Fixed!';
/** Over a ticket that fell into a gap or off the edge: all its work is gone. */
export const TICKET_LOST_TEXT = 'git reset --hard';
/** Over the queue a lost ticket went back to. */
export const BACKLOG_TEXT = 'Back in the backlog';
/** Over a ticket two players are coding together. */
/** Over a keyboard two players code at; `speedup` is the pair's rate over one coder's. */
export function pairingText(speedup: number): string {
  return `Pairing ×${Math.round(speedup * 10) / 10}`;
}

/** What each kind of order (and ticket) is called on its card. */
export const ORDER_KIND_LABELS: Readonly<Record<TicketKind, string>> = {
  feature: 'Feature',
  bug: 'Bug',
  incident: 'Incident!',
  frontend: 'Front end',
  backend: 'Back end',
  fullstack: 'Full-stack',
};

/** Over a merge station when a front end and a back end come together. */
export const MERGED_TEXT = 'Merged!';

/** Pops up over a player who got shoved by a dash; one is picked per shove. */
export const SHOVE_TEXTS: readonly string[] = ['Oof!', 'Hey!', 'Rude!', 'Watch it!', 'Not cool'];

/** Pops up over a player the manager walks into; one is picked per bump. */
export const MANAGER_BUMP_TEXTS: readonly string[] = [
  'Got a minute?',
  'Quick sync?',
  "Let's circle back!",
  'Per my last email...',
  'Is it done yet?',
  'Small favour...',
  'Synergy!',
];

/** Calendar invite subjects; one is picked per invite. */
export const MEETING_TITLES: readonly string[] = [
  'Sync about the sync',
  'Quarterly alignment',
  'Mandatory fun',
  'Retro of the retro',
  'All hands',
  'Quick 1:1',
  'Roadmap brainstorm',
  'Process improvement',
  'Synergy workshop',
  'Kick-off kick-off',
];

/** Over a meeting room. */
export const MEETING_ROOM_TEXT = 'Meeting room';
/** On a player's invite card in the HUD. */
export function inviteText(playerNumber: number): string {
  return `P${playerNumber}: to the meeting room!`;
}
/** Pops up when a meeting was sat out in time. */
export const MEETING_DONE_TEXT = 'Meeting over!';
/** Pops up when an invite ran out. */
export const MEETING_MISSED_TEXT = 'Missed the meeting';

/** Level names, by level id. */
export const LEVEL_NAMES: Readonly<Record<string, string>> = {
  garage: 'The Garage',
  // Lab levels: outside the campaign, for scenes and tests.
  'lab-shapes': 'Lab: shapes',
  'lab-dev': 'Lab: dev mechanics',
  'open-plan': 'Open Plan Office',
  // Id from before the Scale-Up chapter; kept so saves still count.
  'scale-up': 'Down the Hall',
  'seed-round': 'Seed Round',
  'demo-day': 'Demo Day',
  'on-call': 'On Call',
  'middle-management': 'Middle Management',
  hypergrowth: 'Hypergrowth',
  'hot-desking': 'Hot Desking',
  'back-to-back': 'Back to Back',
  synergy: 'Synergy',
  'the-reorg': 'The Reorg',
};

/** One line under each level's name on the level select, by level id. */
export const LEVEL_BLURBS: Readonly<Record<string, string>> = {
  garage: 'Where every unicorn starts.',
  'open-plan': 'A counter wall splits the office. Throw it over!',
  'scale-up': 'Code reviews are mandatory. The review room is down the hall.',
  'seed-round': 'Real customers! Production breaks. Hotfixes jump the bug queue.',
  'demo-day': 'A counter wall, a demo to give, and prod on fire.',
  'on-call': 'The long way round, with the pager on.',
  'middle-management': 'Meet your new manager. Mind the walking status update.',
  hypergrowth: 'Two rooms, two doors, one manager standing in them.',
  'hot-desking': 'Rows of desks and two managers in the aisles.',
  'back-to-back': 'Calendar invites! Go sit in the meeting room or lose points.',
  synergy: 'Meetings, a manager and incidents. Lots of synergy.',
  'the-reorg': 'Everything, everywhere, all at once.',
};

/** Chapter names, by chapter id. */
export const CHAPTER_NAMES: Readonly<Record<string, string>> = {
  garage: 'Garage',
  startup: 'Startup',
  'scale-up': 'Scale-Up',
  enterprise: 'Enterprise',
};

/** One line under each chapter's name: its new mechanic. */
export const CHAPTER_BLURBS: Readonly<Record<string, string>> = {
  garage: 'Two founders and a dream.',
  startup: 'New: production incidents',
  'scale-up': 'New: the wandering manager',
  enterprise: 'New: meetings',
};

/** Shown on the results when the score beats the best so far. */
export const NEW_BEST_TEXT = 'New best!';

/** Shown on the results when the round opened the next level. */
export const LEVEL_UNLOCKED_TEXT = 'Level unlocked!';

/** The speaker button in the corner: what clicking it (or pressing M) does. */
export const SOUND_TOGGLE_TITLE = { mute: 'Sound off (M)', unmute: 'Sound on (M)' } as const;

/** The big name on the title screen. */
export const GAME_TITLE = 'ISV Simulator';
export const GAME_TAGLINE = 'Ship it before the customer notices.';
/** On the title screen until someone presses a button. */
export const PRESS_ANY_BUTTON_TEXT = 'Press any button';
/** Demo mode: the tag in the corner while bots play. */
export const DEMO_TAG = 'Demo';
export const DEMO_PRESS_TEXT = 'Press any button to play';
/** Demo mode: when the bots' round is over. */
export function demoScoreText(score: number): string {
  return `The bots scored ${score}. Think you can beat them?`;
}

/** Menu lines, by the flow's menu item. */
export const MENU_LABELS = {
  play: 'Play',
  hostOnline: 'Host online',
  joinOnline: 'Join online',
  settings: 'Settings',
  credits: 'Credits',
  resume: 'Resume',
  restart: 'Restart',
  levelSelect: 'Level select',
  changePlayers: 'Change players',
  quit: 'Quit to title',
  next: 'Next level',
  retry: 'Retry',
  volume: 'Sound volume',
  music: 'Music volume',
  shake: 'Screen shake',
  profile: 'Online profile',
  copyId: 'Copy ID',
  changeName: 'Change name',
  changeId: 'Use another ID',
  back: 'Back',
} as const;

export const PAUSED_TITLE = 'Paused';
export const SETTINGS_TITLE = 'Settings';
export const CREDITS_TITLE = 'Credits';
export const LEVEL_SELECT_TITLE = 'Pick a level';

/** On a level's card: its chapter and place in it, e.g. "Level 2-1". */
export function levelLabel(chapter: number, level: number): string {
  return `Level ${chapter}-${level}`;
}

/** On a locked chapter: how many stars it takes, and how many you have. */
export function chapterGateHint(needed: number, have: number): string {
  return `Needs ${needed} ★ in total (you have ${have})`;
}

/** Shown on the results when the round opened a new chapter. */
export const CHAPTER_UNLOCKED_TEXT = 'Chapter unlocked!';

/** On a locked level's card: what it takes to open it. */
export function unlockHint(stars: number, previousLevel: string): string {
  return `Get ${stars} ★ on ${previousLevel}`;
}

/** Title of the bug that comes back after shipping a ticket called `title`. */
export function bugTitle(title: string): string {
  return `Bug: ${title.replace(/^Bug: /, '')}`;
}

/** Under every menu: which buttons do what. */
export const MENU_HINT = 'Enter, E or gamepad A: choose · Esc or gamepad B: back';
/** Under the level select. */
export const LEVEL_SELECT_HINT =
  'Left/right: chapter · Up/down: level · Enter, E or gamepad A: play · Esc or gamepad B: change players';
/** Under the level select for an online guest: the host picks. */
export const LEVEL_SELECT_GUEST_HINT =
  'The host picks the level · Enter or gamepad A: join the next round if you have no player yet';
/** Under the lobby. */
export const LOBBY_BACK_HINT = 'Esc or gamepad B: back to the title';
/** In the round, bottom center for a moment: how to pause. */
export const PAUSE_HINT = 'Esc or Start: pause';

/** The picture on a level's intro card that shows its new mechanic. */
export type IntroPicture = 'basics' | 'throw' | 'review' | 'incident' | 'manager' | 'meeting';

/** On the intro card of a level that teaches something new: one line and a picture. */
export const LEVEL_INTRO_TIPS: Readonly<Record<string, { text: string; picture: IntroPicture }>> = {
  garage: {
    picture: 'basics',
    text: 'Grab a ticket from the inbox, work it at each station in order, then ship it before the customer gives up.',
  },
  'open-plan': {
    picture: 'throw',
    text: 'Nowhere to put it down? Hold pick-up to throw the ticket. A teammate facing it catches it.',
  },
  'scale-up': {
    picture: 'review',
    text: 'With two or more of you, some features need a code review: two players work the R station together.',
  },
  'seed-round': {
    picture: 'incident',
    text: 'Production incident! The red hotfix jumps the bug queue: code it, build it, ship it. No new features until it ships.',
  },
  'middle-management': {
    picture: 'manager',
    text: 'The manager wanders the office and walks right into you. Go around.',
  },
  'back-to-back': {
    picture: 'meeting',
    text: 'Calendar invites: the invited player sits in the meeting room for a few seconds, or you lose points.',
  },
};

/** On the first level's intro card: every button. */
export const INTRO_CONTROLS: readonly { action: string; keys: string }[] = [
  { action: 'Move', keys: 'WASD · arrows · stick' },
  { action: 'Pick up / put down', keys: 'E · right Shift · A' },
  { action: 'Work (hold)', keys: 'Q · / · X' },
  { action: 'Dash', keys: 'left Shift · right Alt · B' },
];

/** Over the recipes on the intro card. */
export const INTRO_ORDERS_TITLE = 'Orders';
/** Names of the recipes on the intro card, by ticket kind. */
export const INTRO_RECIPE_NAMES = {
  feature: 'Feature',
  reviewed: 'Feature with review',
  bug: 'Bug fix',
  incident: 'Hotfix',
} as const;
/** Under the intro card. */
export const INTRO_HINT = 'Enter, E or gamepad A: start · Esc or gamepad B: back';
/** The last word of the countdown, as the round starts. */
export const COUNTDOWN_GO_TEXT = 'Ship it!';

/** First-level hints over the map, by hint id. */
export const HINT_TEXTS = {
  inbox: 'Grab a ticket here',
  keyboard: 'Hold work here to code',
  ship: 'Ship it here!',
} as const;

/** A new player's display name is this plus four digits from their user id, e.g. "Dev 1234". */
export const DEFAULT_DISPLAY_NAME_PREFIX = 'Dev';

/** The online profile screen, under Settings. */
export const PROFILE_TEXT = {
  title: 'Online profile',
  idLabel: 'Your ID',
  nameLabel: 'Name',
  about: 'Copy your ID to another browser (Use another ID) to take your progress along.',
  copied: 'ID copied!',
  copyFailed: "Couldn't copy: select the ID above and copy it by hand.",
  idChanged: 'Now playing as this ID.',
  nameChanged: 'Name changed.',
  serverOnline: 'Progress synced with the server.',
  serverOffline: 'Server not reachable: progress stays on this device for now.',
  serverSyncing: 'Syncing with the server…',
  nameDialog: 'Your name, as others see it online',
  idDialog: 'Paste the ID from your other browser',
  idConfirm:
    "Switch to this ID? This browser's progress is added to it; the old ID is forgotten here unless you copied it.",
  dialogHint: 'Enter: OK · Esc: cancel',
  confirmHint: 'Enter: switch · Esc: cancel',
  ok: 'OK',
  cancel: 'Cancel',
  badId: 'That is not a user ID (it looks like 8-4-4-4-12 hex digits).',
  badName: 'A name needs 1 to 24 characters.',
} as const;

/** Hosting, joining and the online lobby. */
export const ONLINE_TEXT = {
  joinTitle: 'Join online',
  joinPrompt: "Type the room's code",
  joinCodeHint:
    'Type the code · Enter: join · Esc: back · Gamepad: up/down letter, left/right move, A join, B back',
  joining: 'Joining…',
  lobbyTitle: 'Online lobby',
  codeLabel: 'Room code',
  copy: 'Copy',
  copied: 'Copied!',
  copyFailed: 'Copy failed: tell them the code',
  leave: 'Leave room',
  back: 'Back to the title',
  host: 'Host',
  you: '(you)',
  nameLabel: 'Your name',
  changeName: 'Change name',
  saveName: 'Save',
  cancelName: 'Cancel',
  noPlayers: 'No players joined yet',
  joinPlayerHint: 'Press Enter or gamepad A to join',
  hostStartHint: 'Host: press E, right Shift or gamepad A on a joined device to start',
  hostJoinFirst: 'Host: join a player first, then start',
  guestWaitHint: 'Waiting for the host to start',
  leaveHint: 'Esc or gamepad B: leave the room',
  closedHint: 'Esc or gamepad B: back to the title',
  roomLabel: 'Room',
  /** The ping corner (dev, `N` toggles it). */
  ping: 'Ping',
  waitingForSnapshots: 'waiting for the server',
  lagSimulated: 'simulated lag',
  noPrediction: 'no prediction',
  status: {
    connecting: 'Connecting to the server…',
    rejoining: 'Getting back into the room…',
    connected: 'Connected',
    reconnecting: 'Reconnecting…',
    closed: 'Disconnected',
  },
  /** Over the screen while this browser reconnects. */
  reconnectingBanner: 'Connection lost. Reconnecting…',
  /** On the bar and in the lobby for others whose connection dropped. */
  memberReconnecting: 'reconnecting…',
  /** On the bar for someone who joined while a round ran (or has no player). */
  spectating: "Round in progress: you're watching, you'll join after it",
  /** On the level select and results for someone without a player. */
  joinNextRound: 'Press Enter or gamepad A to join the next round',
  /** Under the online lobby after one Esc. */
  leaveConfirmHint: 'Press Esc or gamepad B again to leave the room',
  /** What a guest sees on the screens only the host drives. */
  waiting: {
    levelSelect: 'Host is choosing a level',
    intro: 'Host starts the round',
    paused: 'Paused by the host',
    results: 'Host is choosing what is next',
  },
  errors: {
    badCode: 'A code is 4 letters, like ABCD.',
    wrongCode: 'No room with that code. Check it with the host.',
    roomFull: 'That room is full (4 players at most).',
    protocolMismatch: 'That room runs another version of the game. Reload the page and try again.',
    unreachable: 'The server is not reachable. Is it running?',
    disconnected: 'The connection to the room was lost.',
    reconnectFailed: "Couldn't get back into the room in time. It may have closed.",
    serverShutdown: 'The server is restarting. Host a new room in a minute.',
    roomClosed: 'The room closed after a long time without anyone playing.',
  },
} as const;
