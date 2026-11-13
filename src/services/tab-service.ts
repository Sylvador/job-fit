import type { SiteRegistry } from '../core/site-registry';
import type { SiteStrategy } from '../core/site-strategy';

/** The active tab resolved against a site strategy. */
export interface ActiveJobContext {
    tab: chrome.tabs.Tab | null;
    strategy: SiteStrategy | null;
    jobId: string | null;
}

/**
 * Access to the current browser tab, resolved into a site-strategy context.
 *
 * The registry is injected, so this service never needs to know which
 * websites are supported (Open/Closed at the service level too).
 */
export class TabService {
    constructor(private readonly registry: SiteRegistry) {}

    async getActiveTab(): Promise<chrome.tabs.Tab | null> {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });
        return tab ?? null;
    }

    async resolveActiveJob(): Promise<ActiveJobContext> {
        const tab = await this.getActiveTab();
        if (!tab?.url) return { tab, strategy: null, jobId: null };

        const strategy = this.registry.detect(tab.url);
        if (!strategy) return { tab, strategy: null, jobId: null };

        return { tab, strategy, jobId: strategy.extractJobId(tab.url) };
    }
}
