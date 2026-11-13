/**
 * Shared domain types.
 *
 * `SiteId` is deliberately an open `string` alias instead of a closed union:
 * the Strategy pattern must stay open for extension (the "O" in SOLID), so
 * adding a new website must not force an edit here. Valid ids are guaranteed
 * at runtime by the SiteRegistry.
 */

type Nominal<T, Brand extends string> = T & { __brand: Brand };
/** Identifier of a registered site strategy (e.g. 'linkedin', 'hh'). */
export type SiteId = Nominal<string, 'SiteId'>;

/** A job posting scraped from a page, ready to be analyzed. */
export interface Job {
    title: string;
    description: string;
    jobId: string;
    skills: string[];
}

/** Gemini's structured judgement of a job against the candidate profile. */
export interface Verdict {
    /** Integer from 1 to 10. */
    score: number;
    /** One short sentence (Russian). */
    verdict: string;
    /** Short project description (Russian), when the posting mentions one. */
    project?: string;
    /** Up to 4 short strings (Russian). */
    pros: string[];
    /** Up to 4 short strings (Russian). */
    cons: string[];
}

/** A persisted analysis result, stored under the `check_<site>_<jobId>` key. */
export interface CheckRecord {
    jobId: string;
    site: SiteId;
    /** Canonical vacancy URL (used for links in the history list). */
    url?: string;
    title: string;
    verdict: Verdict;
    model: string;
    /** Hash of the candidate profile at check time (see utils.hashString). */
    profileHash: string;
    /** Check timestamp, epoch milliseconds. */
    checkedAt: number;
}

/** One text part of a Gemini `contents` message. */
export interface TextPart {
    text: string;
}
