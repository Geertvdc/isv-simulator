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

/** Shown next to the points when a ticket ships with tests skipped. */
export const UNTESTED_SHIP_TEXT = 'YOLO!';

/** Shown when a finished build was left too long and the pipeline broke. */
export const PIPELINE_BROKE_TEXT = 'Build server down!';

/** Level names, by level id. */
export const LEVEL_NAMES: Readonly<Record<string, string>> = {
  garage: 'The Garage',
  'open-plan': 'Open Plan Office',
  'scale-up': 'The Scale-Up',
};

/** One line under each level's name on the level select, by level id. */
export const LEVEL_BLURBS: Readonly<Record<string, string>> = {
  garage: 'Where every unicorn starts.',
  'open-plan': 'A counter wall splits the office. Throw it over!',
  'scale-up': 'Code reviews are mandatory. The review room is down the hall.',
};

/** Shown on the end screen when the stars beat the best so far. */
export const NEW_BEST_TEXT = 'New best!';

/** Title of the bug that comes back after shipping a ticket called `title`. */
export function bugTitle(title: string): string {
  return `Bug: ${title.replace(/^Bug: /, '')}`;
}
