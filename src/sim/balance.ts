/** Every tunable number in the game lives here. */

/** Fixed simulation timestep: how many times `tick` runs per real second. High so movement feels responsive. */
export const TICKS_PER_SECOND = 60;

/** Screen pixels kept free around the level when the camera auto-fits it. */
export const CAMERA_FIT_PADDING = 32;
/** Share of the screen height kept free above the level for the order bar. */
export const CAMERA_HUD_TOP = 0.14;
/** Share of the screen height kept free below the level for score and timer. */
export const CAMERA_HUD_BOTTOM = 0.06;

/** Debug-mode zoom limits (1 = one world pixel per screen pixel). */
export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 2;
/** Zoom change per wheel delta unit: zoom *= exp(-deltaY * this). */
export const CAMERA_ZOOM_SENSITIVITY = 0.0015;

/** Player movement, in tiles and seconds. */
export const PLAYER_MAX_SPEED = 5;
/** Speed gained per second while there is input. Reaches max speed in ~0.12 s. */
export const PLAYER_ACCEL = 40;
/** Speed lost per second without input: higher than accel so stopping feels snappy. */
export const PLAYER_DECEL = 70;
/** Players collide with solid tiles as a circle of this radius. */
export const PLAYER_RADIUS = 0.35;
/**
 * A player blocked head-on but overlapping the blocking corner by at most this
 * much (in tiles) gets nudged sideways around it instead of stopping dead.
 */
export const CORNER_NUDGE = 0.25;
/** Corner nudging only kicks in while sideways input is below this, so it never fights the player. */
export const CORNER_NUDGE_MAX_SIDE_INPUT = 0.3;
/**
 * Share of the overlap between two players removed per tick. Below 1 so
 * bumping into someone is a soft, squishy shove instead of a hard wall.
 */
export const PLAYER_PUSH_STRENGTH = 0.5;
/** Dash: a short burst at this speed (tiles per second) along the facing direction. */
export const DASH_SPEED = 14;
/** How long a dash lasts: ~2 tiles at `DASH_SPEED`. */
export const DASH_TICKS = Math.round(0.15 * TICKS_PER_SECOND);
/** Ticks from the start of one dash until the next may start. */
export const DASH_COOLDOWN_TICKS = Math.round(0.8 * TICKS_PER_SECOND);
/** Speed a dashing player knocks someone else away with. */
export const DASH_SHOVE_SPEED = 15;
/** Ticks interact must stay held after a press that did nothing before a carried ticket is thrown. */
export const THROW_HOLD_TICKS = Math.round(0.25 * TICKS_PER_SECOND);
/** How fast a thrown ticket flies, in tiles per second. */
export const THROW_SPEED = 12;
/** A thrown ticket that found nothing to land on drops on the floor after this many tiles. */
export const THROW_RANGE = 5;
/** An empty-handed player catches a ticket flying within this many tiles in front of them. */
export const CATCH_RADIUS = 0.7;
/** How far in front of the player's center the target tile is picked. */
export const INTERACT_REACH = 0.8;

/** Wandering manager: walking speed in tiles per second, slower than a player. */
export const MANAGER_SPEED = 2.2;
/** Managers collide with players as a circle of this radius. Players can't push them. */
export const MANAGER_RADIUS = 0.4;
/** After reaching a spot a manager stands there for between these many ticks. */
export const MANAGER_PAUSE_MIN_TICKS = 1 * TICKS_PER_SECOND;
export const MANAGER_PAUSE_MAX_TICKS = 3 * TICKS_PER_SECOND;
/** Speed a walking manager knocks a player away with. */
export const MANAGER_SHOVE_SPEED = 9;
/** A manager shoves someone at most once per this many ticks. */
export const MANAGER_BUMP_COOLDOWN_TICKS = 1 * TICKS_PER_SECOND;
/** A manager blocked (a player pinned against a wall) this long gives up and walks somewhere else. */
export const MANAGER_STUCK_TICKS = Math.round(1.5 * TICKS_PER_SECOND);

/** Points lost when a calendar invite runs out before its player sat the meeting. */
export const MEETING_MISSED_PENALTY = 15;

/** Most sim ticks run in one frame; after a long stall the game slows down instead of spiralling. */
export const MAX_TICKS_PER_FRAME = 5;

/** In menus, a stick pushed this far along an axis counts as one step that way. */
export const MENU_STICK_THRESHOLD = 0.5;

/** Stick deflection below this counts as centered; above it the stick is rescaled to 0 to 1. */
export const GAMEPAD_DEAD_ZONE = 0.2;

/** Step progress gained per tick of holding work at a station: a step takes ~2.5 s. */
export const WORK_RATE = 1 / (2.5 * TICKS_PER_SECOND);
/** Players who must hold work at one review station at once for the review to move. */
export const REVIEWERS_NEEDED = 2;
/** Review progress per tick while enough players work it: a review takes ~3 s. */
export const REVIEW_RATE = 1 / (3 * TICKS_PER_SECOND);
/** Ticks a ticket builds in the pipeline before its pipeline step is done. */
export const PIPELINE_BUILD_TICKS = 4 * TICKS_PER_SECOND;

/** Points for shipping an order, before the speed bonus. */
export const ORDER_POINTS = 20;
/** Extra points for shipping with the whole timer left; scales down linearly to 0. */
export const ORDER_SPEED_BONUS_MAX = 10;
/** Points lost when an order runs out. */
export const EXPIRED_PENALTY = 10;
/**
 * Points for shipping a bug fix, speed bonus included: none, so skipping tests
 * and fixing the fallout never beats testing in the first place. Bugs only
 * cost points when they expire.
 */
export const BUG_ORDER_POINTS = 0;
/** Points lost when a bug order runs out: customers hate bugs more than late features. */
export const BUG_EXPIRED_PENALTY = 20;

/** Points for shipping an incident hotfix, before the usual speed bonus. */
export const INCIDENT_POINTS = 20;
/** Points lost when an incident runs out: production was down the whole time. */
export const INCIDENT_EXPIRED_PENALTY = 30;

/**
 * How many times more often feature orders arrive, by number of players
 * (index 0 = solo). The level's schedule and star thresholds are for one
 * player; open-order cap and stars scale by the same factor.
 */
export const ORDER_RATE_BY_PLAYERS: readonly number[] = [1, 1.7, 2.3, 2.8];

/** Chance that a fully tested ticket comes back as a bug after shipping. */
export const BUG_CHANCE = 0.25;
/** Chance for a ticket shipped with every test skipped; partly tested tickets sit in between. */
export const BUG_CHANCE_UNTESTED = 0.75;
/** Ticks between shipping a buggy ticket and its bug arriving in the bug queue. */
export const BUG_DELAY_TICKS = 6 * TICKS_PER_SECOND;

/** Order cards flash once this few ticks are left. */
export const ORDER_URGENT_TICKS = 10 * TICKS_PER_SECOND;
/** The end screen ignores presses this long, so mashing at the buzzer doesn't restart. */
export const END_SCREEN_INPUT_DELAY_MS = 1500;

/** Ticks a finished build may sit in the pipeline before the pipeline breaks. */
export const PIPELINE_FAIL_TICKS = 10 * TICKS_PER_SECOND;
/** The pipeline flashes a warning for this many ticks before it breaks. */
export const PIPELINE_WARN_TICKS = 4 * TICKS_PER_SECOND;
/** Ticks of holding work at an empty broken pipeline to repair it. */
export const REPAIR_TICKS = 3 * TICKS_PER_SECOND;

/** Stars needed on a level to unlock the next one. The first level is always open. */
export const STARS_TO_UNLOCK = 1;
/**
 * Best stars over all levels needed to open each chapter (Garage, Startup,
 * Scale-Up, Enterprise), on top of the previous level's star. Reachable
 * with 1 to 2 stars per level.
 */
export const CHAPTER_STAR_GATES: readonly number[] = [0, 4, 9, 13];
/** Sound volume setting runs from 0 (off) to this, in whole steps. */
export const SFX_VOLUME_MAX = 10;
/** Sound volume on a fresh save. */
export const DEFAULT_SFX_VOLUME = 10;
/** Music volume for a new save, on the same scale as sound; a bit under the effects. */
export const DEFAULT_MUSIC_VOLUME = 6;
/** The countdown before a round: "3, 2, 1", each number this long. */
export const COUNTDOWN_STEPS = 3;
export const COUNTDOWN_STEP_MS = 700;
/** How long "Ship it!" stays up once the round starts. */
export const SHIP_IT_BANNER_MS = 900;
/** In the last this many ticks of a round the level music speeds up. */
export const MUSIC_HURRY_TICKS = 30 * TICKS_PER_SECOND;
/** Playback rate of the level music in the last seconds. */
export const MUSIC_HURRY_RATE = 1.15;
/** Music volume share while the game is paused. */
export const MUSIC_PAUSE_DUCK = 0.3;
/** How long one track fades into the next, and volume changes glide. */
export const MUSIC_FADE_MS = 600;
/** Most stars a round can give. */
export const MAX_STARS = 3;
