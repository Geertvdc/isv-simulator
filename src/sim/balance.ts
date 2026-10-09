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
/** How far in front of the player's center the target tile is picked. */
export const INTERACT_REACH = 0.8;

/** Most sim ticks run in one frame; after a long stall the game slows down instead of spiralling. */
export const MAX_TICKS_PER_FRAME = 5;

/** Stick deflection below this counts as centered; above it the stick is rescaled to 0 to 1. */
export const GAMEPAD_DEAD_ZONE = 0.2;

/** Step progress gained per tick of holding work at a station: a step takes ~2.5 s. */
export const WORK_RATE = 1 / (2.5 * TICKS_PER_SECOND);
/** Ticks a ticket builds in the pipeline before its pipeline step is done. */
export const PIPELINE_BUILD_TICKS = 4 * TICKS_PER_SECOND;

/** Points for shipping an order, before the speed bonus. */
export const ORDER_POINTS = 20;
/** Extra points for shipping with the whole timer left; scales down linearly to 0. */
export const ORDER_SPEED_BONUS_MAX = 10;
/** Points lost when an order runs out. */
export const EXPIRED_PENALTY = 10;
/**
 * Base points for shipping a bug fix (the speed bonus comes on top). Low, so
 * skipping tests and fixing the fallout never beats testing in the first place.
 */
export const BUG_ORDER_POINTS = 0;
/** Points lost when a bug order runs out: customers hate bugs more than late features. */
export const BUG_EXPIRED_PENALTY = 20;

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
