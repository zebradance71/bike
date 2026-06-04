/** Keep in sync with `electron/block-chase-tire-tracks.ts`. */

export const TIRE_TRACK_MAX_AGE_MS = 5_500;



/** After the cursor stops, fade eases more gently (same lifetime, no sudden cutoff). */

export const TIRE_TRACK_IDLE_FADE_AFTER_MS = 350;



/** Hue cycles with stamp birth time only (ms). */

export const TIRE_TRACK_HUE_CYCLE_MS = 5_500;

/** Overlay canvas backing-store scale cap (per-display window). */

export const TIRE_TRACK_OVERLAY_MAX_DPR = 1;

