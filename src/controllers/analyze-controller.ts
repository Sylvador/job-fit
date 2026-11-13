import type { CheckRecord } from '../types';
import type { JobScraper } from '../scraping/job-scraper';
import type { CheckCache } from '../services/check-cache';
import type { GeminiClient, GeminiSettings } from '../services/gemini-client';
import type { TabService } from '../services/tab-service';
import type { ResultView } from '../ui/result-view';
import type { SettingsView } from '../ui/settings-view';
import { Messages, describeError } from '../ui/messages';
import { hashString } from '../utils';

export interface AnalyzeControllerDeps {
    settings: SettingsView;
    result: ResultView;
    tabs: TabService;
    scraper: JobScraper;
    cache: CheckCache;
    /** Factory for the AI client, called once per check with live settings. */
    createClient(settings: GeminiSettings): GeminiClient;
}

/**
 * The "check this vacancy" use case:
 * validate inputs → resolve tab & site strategy → serve a fresh cache hit →
 * scrape the page → ask Gemini → persist the record → render it.
 *
 * Every collaborator arrives through `deps`, so the flow can be reasoned
 * about (and tested) without Chrome APIs (Dependency Inversion).
 */
export class AnalyzeController {
    constructor(private readonly deps: AnalyzeControllerDeps) {}

    /** On popup open: instantly render a cached result for the active tab, if any. */
    async showCachedIfAvailable(): Promise<void> {
        const { strategy, jobId } = await this.deps.tabs.resolveActiveJob();
        if (!strategy || !jobId) return;

        const cached = await this.deps.cache.get(strategy.id, jobId);
        if (!cached) return;

        this.deps.result.render(cached, true);
        this.deps.result.clearStatus();
    }

    /**
     * Runs a check.
     * @param force — ignore the cache and re-check (the «Проверить заново» button).
     */
    async run(force = false): Promise<void> {
        const { settings, result } = this.deps;

        result.hide();
        result.clearStatus();

        const apiKey = settings.apiKey;
        const profile = settings.profile.trim();
        const model = settings.effectiveModel;
        const profileHash = hashString(profile);

        if (!apiKey) {
            result.setStatus(Messages.needApiKey, true);
            settings.open();
            return;
        }
        if (!profile) {
            result.setStatus(Messages.needProfile, true);
            settings.focusProfile();
            return;
        }

        result.setBusy(true);
        try {
            result.setStatus(Messages.lookingForJob);
            const { tab, strategy, jobId } =
                await this.deps.tabs.resolveActiveJob();

            if (!tab || !strategy) {
                result.setStatus(Messages.unsupportedSite, true);
                return;
            }
            if (!jobId) {
                result.setStatus(Messages.noJobId, true);
                return;
            }

            // Fast path: the result is cached and profile/model are unchanged.
            if (!force) {
                const cached = await this.deps.cache.get(strategy.id, jobId);
                if (
                    cached &&
                    this.deps.cache.isUpToDate(cached, profileHash, model)
                ) {
                    result.render(cached, true);
                    result.clearStatus();
                    return;
                }
                if (cached) result.setStatus(Messages.staleCache);
            }

            result.setStatus(Messages.readingJob);
            const job = await this.deps.scraper.scrape(tab, strategy, jobId);

            if (!job.description) {
                result.setStatus(Messages.noDescription, true);
                return;
            }

            result.setStatus(Messages.askingModel);
            const verdict = await this.deps
                .createClient({ apiKey, model })
                .analyzeJob(job, profile);

            const record: CheckRecord = {
                jobId,
                site: strategy.id,
                url: strategy.buildJobUrl(tab.url ?? '', jobId),
                title: job.title,
                verdict,
                model,
                profileHash,
                checkedAt: Date.now(),
            };
            await this.deps.cache.put(record);

            result.render(record, false);
            result.clearStatus();
        } catch (err) {
            result.setStatus(describeError(err), true);
        } finally {
            result.setBusy(false);
        }
    }
}
