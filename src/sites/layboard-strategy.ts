import { SiteStrategy, type ScrapeConfig } from '../core/site-strategy';
import { SiteId } from '../types';

/** Everything the extension knows about Layboard vacancy pages. */
export class LayboardStrategy extends SiteStrategy {
    readonly id = 'layboard' as SiteId;

    matches(url: string): boolean {
        return url.includes('layboard.com');
    }

    extractJobId(url: string): string | null {
        return url.match(/\/vakansiya\/(\d+)/)?.[1] ?? null;
    }

    buildJobUrl(tabUrl: string, _jobId: string): string {
        // Vacancy URLs are already canonical on Layboard.
        return tabUrl;
    }

    scrapeConfig(_jobId: string): ScrapeConfig {
        return {
            titleSelectors: ['.lb-vacancy-page__title'],
            descriptionSelectors: ['.lb-vacancy-page__text'],
            descriptionFallback: 'none',
            titleFallback: 'vacancy-suffix',
        };
    }
}
