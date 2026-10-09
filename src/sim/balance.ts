/** Every tunable number in the game lives here. */

/** Fixed simulation timestep: how many times `tick` runs per real second at 1x speed. */
export const TICKS_PER_SECOND = 20;

/** Camera zoom limits (1 = one world pixel per screen pixel). */
export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 2;
/** Zoom change per wheel delta unit: zoom *= exp(-deltaY * this). */
export const CAMERA_ZOOM_SENSITIVITY = 0.0015;
/** Keyboard pan speed in screen pixels per second (independent of zoom). */
export const CAMERA_PAN_SPEED = 600;
