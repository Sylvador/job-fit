import type { SiteStrategy } from '../core/site-strategy';
import type { Job } from '../types';
import { extractJobData, type ExtractedJobData } from './extract-job-data';

/**
 * Reads a vacancy from a tab on demand. The page-context extractor runs
 * exactly once per click (nothing is injected ahead of time), and receives
 * its site-specific instructions from the strategy — so this class stays
 * generic for every current and future website.
 */
export class JobScraper {
    async scrape(
        tab: chrome.tabs.Tab,
        strategy: SiteStrategy,
        jobId: string
    ): Promise<Job> {
        if (tab.id === undefined) {
            throw new Error('target tab has no id');
        }

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractJobData,
            args: [strategy.scrapeConfig(jobId)],
        });

        const data: ExtractedJobData | undefined = results[0]?.result;
        const rawSkills = data?.skills;

        return {
            jobId,
            title: data?.title || '',
            description: data?.description || '',
            skills: Array.isArray(rawSkills) ? rawSkills : [],
        };
    }
}
