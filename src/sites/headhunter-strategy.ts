import { SiteStrategy, type ScrapeConfig } from '../core/site-strategy';
import { SiteId } from '../types';

export class HeadHunterStrategy extends SiteStrategy {
    override readonly id = 'hh' as SiteId;

    matches(url: string): boolean {
        return url.includes('hh.ru') || url.includes('headhunter.ge');
    }

    extractJobId(url: string): string | null {
        return url.match(/\/vacancy\/(\d+)/)?.[1] ?? null;
    }

    buildJobUrl(tabUrl: string, jobId: string): string {
        try {
            return `${new URL(tabUrl).origin}/vacancy/${jobId}`;
        } catch {
            return `https://hh.ru/vacancy/${jobId}`;
        }
    }

    scrapeConfig(_jobId: string): ScrapeConfig {
        return {
            titleSelectors: ['[data-qa="vacancy-title"]'],
            descriptionSelectors: ['[data-qa="vacancy-description"]'],
            skillsSelector: '[data-qa="skills-element"]',
            descriptionFallback: 'none',
            titleFallback: 'vacancy-suffix',
        };
    }
}
