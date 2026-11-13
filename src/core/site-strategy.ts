import type { SiteId } from '../types';

/**
 * Serializable DOM-extraction instructions for the page-context scraper
 * (scraping/extract-job-data.ts).
 *
 * Everything in here must survive structured cloning, because it crosses the
 * extension/page boundary as an `executeScript` argument: plain data only —
 * no functions, no class instances, no DOM references.
 */
export interface ScrapeConfig {
    /** Tried in order; the first selector yielding non-empty text wins. */
    titleSelectors: string[];
    /** Tried in order; the first selector yielding non-empty text wins. */
    descriptionSelectors: string[];
    /** Optional selector collecting listed skills (hh.ru today). */
    skillsSelector?: string;
    /** Heuristic used when every descriptionSelector misses. */
    descriptionFallback: 'about-heading' | 'none';
    /** Heuristic used to derive a title from document.title. */
    titleFallback: 'linkedin' | 'vacancy-suffix';
}

/**
 * Strategy — everything the extension knows about ONE supported website.
 *
 * The contract covers the four places where the original popup.js hardcoded
 * per-site knowledge (site detection, job-id parsing, canonical URL building
 * and DOM selectors). Implementations:
 *   - sites/linkedin-strategy.ts
 *   - sites/headhunter-strategy.ts
 *   - sites/layboard-strategy.ts
 *
 * Adding a new website = adding one subclass + one `register(...)` call in
 * popup.ts. No existing file changes (Open/Closed), and every implementation
 * is interchangeable behind this contract (Liskov Substitution).
 */
export abstract class SiteStrategy {
    /** Storage/cache identifier; becomes part of the `check_<site>_<jobId>` key. */
    abstract readonly id: SiteId;

    /** Whether a tab URL belongs to this site. */
    abstract matches(url: string): boolean;

    /** Extracts the vacancy id from a URL, or null when it is absent. */
    abstract extractJobId(url: string): string | null;

    /** Builds the canonical (shareable) vacancy URL for the history list. */
    abstract buildJobUrl(tabUrl: string, jobId: string): string;

    /**
     * DOM instructions for this site. Receives the jobId because LinkedIn's
     * primary description selector embeds the job id.
     */
    abstract scrapeConfig(jobId: string): ScrapeConfig;
}
