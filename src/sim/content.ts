/** Text content. Add jokes freely. */

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

/** The big name on the title screen. */
export const GAME_TITLE = 'ISV Simulator';
export const GAME_TAGLINE = 'Ship it before the customer notices.';
/** On the title screen until someone presses a button. */
export const PRESS_ANY_BUTTON_TEXT = 'Press any button';

/** Menu lines, by the flow's menu item. */
export const MENU_LABELS = {
  play: 'Play',
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
  shake: 'Screen shake',
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
/** Under the lobby. */
export const LOBBY_BACK_HINT = 'Esc or gamepad B: back to the title';
/** In the round, bottom center for a moment: how to pause. */
export const PAUSE_HINT = 'Esc or Start: pause';
