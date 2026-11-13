import { SiteStrategy, type ScrapeConfig } from '../core/site-strategy';
import { SiteId } from '../types';

export class HabrStrategy extends SiteStrategy {
    override readonly id = 'habr' as SiteId;

    matches(url: string): boolean {
        return url.includes('career.habr.com');
    }

    extractJobId(url: string): string | null {
        return url.match(/\/vacancies\/(\d+)/)?.[1] ?? null;
    }

    buildJobUrl(tabUrl: string, _: string): string {
        return tabUrl;
    }

    scrapeConfig(_jobId: string): ScrapeConfig {
        return {
            titleSelectors: ['.page-title__title'],
            descriptionSelectors: ['.vacancy-description__text'],
            skillsSelector: '.chip-without-icon__text',
            descriptionFallback: 'none',
            titleFallback: 'vacancy-suffix',
        };
    }
}
