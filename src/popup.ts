/**
 * Composition root of the popup script.
 *
 * Everything here runs only inside the extension popup, and only while the
 * popup is open. Nothing executes automatically on the job sites — the page
 * is read exactly once, at the moment the user clicks the button, via
 * chrome.scripting.executeScript scoped to the active tab (activeTab
 * permission). There is no background polling and no persistent content
 * script, and no request is ever sent to the job sites themselves — only to
 * generativelanguage.googleapis.com, with the user's own key.
 *
 * Check cache: under `check_<site>_<jobId>` the Gemini verdict is stored
 * together with metadata (profile hash, model, timestamp). When neither the
 * profile nor the model changed since the last check, the result is shown
 * instantly from the cache; otherwise «Проверить эту вакансию» starts a new
 * check automatically. «Проверить заново» always bypasses the cache.
 *
 * This is the only file that knows how the objects are wired together; every
 * other module sees only its injected collaborators. Adding a new website is
 * a two-line change here: import a strategy and register it.
 */

import { AnalyzeController } from './controllers/analyze-controller';
import { HistoryController } from './controllers/history-controller';
import { SiteRegistry } from './core/site-registry';
import { JobScraper } from './scraping/job-scraper';
import { CheckCache } from './services/check-cache';
import { GeminiClient } from './services/gemini-client';
import { HistoryStore } from './services/history-store';
import { StorageService } from './services/storage';
import { TabService } from './services/tab-service';
import { HabrStrategy } from './sites/habr-strategy';
import { HeadHunterStrategy } from './sites/headhunter-strategy';
import { LayboardStrategy } from './sites/layboard-strategy';
import { LinkedInStrategy } from './sites/linkedin-strategy';
import { getPopupElements } from './ui/dom';
import { HistoryView } from './ui/history-view';
import { Messages } from './ui/messages';
import { ResultView } from './ui/result-view';
import { SettingsView } from './ui/settings-view';
import { hashString } from './utils';

// --- object graph -----------------------------------------------------------

const els = getPopupElements();

const storage = new StorageService();

// Supported websites. To add one: create a SiteStrategy subclass in
// src/sites/ and register it here — nothing else needs to change.
const registry = new SiteRegistry()
    .register(new LinkedInStrategy())
    .register(new HeadHunterStrategy())
    .register(new LayboardStrategy())
    .register(new HabrStrategy());

const checkCache = new CheckCache(storage);
const historyStore = new HistoryStore(storage);
const tabService = new TabService(registry);
const scraper = new JobScraper();

const settingsView = new SettingsView(els, {
    onSave: async (apiKey, model) => {
        await storage.set({ apiKey, model });
        resultView.setStatus(Messages.settingsSaved, false);
        settingsView.close();
    },
    onProfileInput: (profile) => void storage.set({ profile }),
});

const resultView = new ResultView(els);

const historyView = new HistoryView(els, {
    isRecordStale: (record) =>
        record.profileHash !== hashString(settingsView.profile.trim()) ||
        record.model !== settingsView.effectiveModel,
    onDeleteRecord: (record) => void historyController.deleteRecord(record),
    onClearAll: () => void historyController.clearAll(),
});

const historyController = new HistoryController(historyStore, historyView);

const analyzeController = new AnalyzeController({
    settings: settingsView,
    result: resultView,
    tabs: tabService,
    scraper,
    cache: checkCache,
    createClient: (settings) => new GeminiClient(settings),
});

// --- bootstrap ---------------------------------------------------------------

async function bootstrap(): Promise<void> {
    settingsView.bind();
    historyView.bind();

    const stored = await storage.getAll();
    settingsView.applyStored({
        apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : undefined,
        model: typeof stored.model === 'string' ? stored.model : undefined,
        profile:
            typeof stored.profile === 'string' ? stored.profile : undefined,
    });

    // First run: open the settings panel so the user adds their API key.
    if (!stored.apiKey) settingsView.open();

    // Opening settings from the history view also returns to the main view.
    els.settingsToggle.addEventListener('click', () =>
        historyController.closeHistory()
    );

    els.analyzeBtn.addEventListener(
        'click',
        () => void analyzeController.run(false)
    );
    els.recheckBtn.addEventListener(
        'click',
        () => void analyzeController.run(true)
    );
    els.historyToggle.addEventListener('click', () => {
        if (historyController.isOpen) {
            historyController.closeHistory();
        } else {
            void historyController.openHistory();
        }
    });

    await analyzeController.showCachedIfAvailable();
}

void bootstrap();
