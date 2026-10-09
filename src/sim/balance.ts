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
/** How far in front of the player's center the target tile is picked. */
export const INTERACT_REACH = 0.8;

/** Most sim ticks run in one frame; after a long stall the game slows down instead of spiralling. */
export const MAX_TICKS_PER_FRAME = 5;
