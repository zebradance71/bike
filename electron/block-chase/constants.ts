export const MOVE_TICK_MS = 4;
export const MOVE_TICK_MS_NO_TRACKS = 12;
export const TRIM_INTERVAL_MS = 500;
export const TIRE_TRACKS_UI_EVERY_N_APPEND = 32;
/** Keep companion above tire-track overlays (Win32 re-stacks on showInactive). */
export const RAISE_COMPANION_MIN_MS = 36;
export const FACING_VEL_THRESHOLD_PX = 12;
export const FACING_VEL_LOCK_PX = 5;
export const FACING_WHEEL_HYSTERESIS_PX = 40;
export const VEL_SMOOTH = 0.45;
/** Distance-adaptive lerp — restores smooth fast chase on heavy FG apps. */
export const CHASE_BASE_LERP = 0.72;
/** Beyond this px gap per tick, snap (fast flick). */
export const CHASE_SNAP_DIST_PX = 140;
/** When anchor is this close to a work-area edge, use virtual union clamp (cross prep). */
export const CHASE_EDGE_UNION_MARGIN_PX = 56;
/** Idle snap when anchor and window live on different monitors. */
export const SNAP_MIN_DIST_PX = 120;
