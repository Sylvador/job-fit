/**
 * Application-wide constants. Centralized so that policies (cache key format,
 * prompt size limits, default model) can be found and tuned in one place.
 */

/** Storage key prefix for persisted check records. */
export const CHECK_KEY_PREFIX = 'check_';

/** Model used when the settings field is left empty. */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/** Debounce for persisting the profile textarea while the user types. */
export const PROFILE_AUTOSAVE_DELAY_MS = 400;

/** Base URL of the Gemini generateContent REST endpoint. */
export const GEMINI_API_BASE =
    'https://generativelanguage.googleapis.com/v1beta/models';
