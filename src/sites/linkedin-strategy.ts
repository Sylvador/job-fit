import { SiteStrategy, type ScrapeConfig } from '../core/site-strategy';
import { SiteId } from '../types';

/** Everything the extension knows about LinkedIn job pages. */
export class LinkedInStrategy extends SiteStrategy {
    readonly id = 'linkedin' as SiteId;

    matches(url: string): boolean {
        return url.includes('linkedin.com');
    }

    extractJobId(url: string): string | null {
        // The id lives in a query param on search/collection pages and in the
        // path on direct job-view pages.
        const fromQuery = url.match(/[?&]currentJobId=(\d+)/);
        if (fromQuery) return fromQuery[1] ?? null;
        const fromPath = url.match(/\/jobs\/view\/(\d+)/);
        return fromPath?.[1] ?? null;
    }

    buildJobUrl(_tabUrl: string, jobId: string): string {
        return `https://www.linkedin.com/jobs/view/${jobId}`;
    }

    scrapeConfig(jobId: string): ScrapeConfig {
        return {
            titleSelectors: [
                'div[data-display-contents=true] > p > a',
                '.job-details-jobs-unified-top-card__job-title h1',
                '.jobs-unified-top-card__job-title h1',
                'h1.t-24',
                'h1',
            ],
            descriptionSelectors: [
                `#JobDetails_AboutTheJob_${jobId} p > span`,
                '#job-details > div',
                '#job-details',
                '.jobs-box__html-content',
                'article',
            ],
            // LinkedIn sometimes renders the description with no stable selector;
            // the scraper then falls back to the "About the job" heading heuristic.
            descriptionFallback: 'about-heading',
            titleFallback: 'linkedin',
        };
    }
}
