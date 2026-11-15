/**
 * Video bulletins' numbers (docs/bulletin.md), on their own so the settings can read them without the picking code
 * that bulletin.ts imports.
 */

/** Three a day (Dhaka): late morning, afternoon, night. */
export const BULLETIN_TIMES = ["10:00", "16:00", "21:00"];
/** A bulletin's draft is made this long before its time: an hour, half of it for review (see BULLETIN_LOCK_MINUTES). */
export const BULLETIN_LEAD_MINUTES = 60;
/** Edits close this long before its time: the voice, the render and the preview need it. */
export const BULLETIN_LOCK_MINUTES = 30;
/** Stories in a bulletin the picker makes. */
export const BULLETIN_STORIES = 5;
