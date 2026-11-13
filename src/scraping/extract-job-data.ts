import type { ScrapeConfig } from '../core/site-strategy';

/** Raw shape returned by the page-context extractor (a subset of Job). */
export interface ExtractedJobData {
    title: string;
    description?: string;
    skills?: string[];
}

/**
 * ⚠ Runs INSIDE the target page, not in the extension popup.
 *
 * chrome.scripting.executeScript serializes THIS function and evaluates it in
 * the page context, so it must be completely self-contained: only `import
 * type` is allowed (it is erased at compile time) and no module-scope or
 * closure bindings may be referenced. All website knowledge arrives as plain
 * data through `config` (a ScrapeConfig built by the site strategy) — which
 * is why supporting a new website never requires touching this file.
 *
 * When the selectors miss, the function returns missing fields as
 * undefined/null instead of throwing, so the popup can show its friendly
 * "no description found" status instead of a generic error.
 */
export function extractJobData(config: ScrapeConfig): ExtractedJobData {
    const job: ExtractedJobData = {
        title:
            firstInnerText(config.titleSelectors) ??
            fallbackTitle(config.titleFallback),
        description: findDescription(config),
    };

    if (config.skillsSelector) {
        const skills = Array.from(
            document.querySelectorAll(config.skillsSelector)
        )
            .map((el) => el.textContent?.trim() ?? '')
            .filter(Boolean);
        if (skills.length > 0) job.skills = skills;
    }

    return job;

    // --- helpers (nested on purpose: they are serialized together with the
    // --- function and must not live at module scope) -------------------------

    /** First selector from the list that yields non-empty inner text. */
    function firstInnerText(selectors: string[]): string | undefined {
        const el = firstMatchNode(selectors);
        return el?.innerText?.trim();
    }

    /** First element matching one of the selectors with non-empty text. */
    function firstMatchNode(selectors: string[]): HTMLElement | null {
        for (const selector of selectors) {
            try {
                const el = document.querySelector<HTMLElement>(selector);
                if (el?.innerText?.trim()) return el;
            } catch {
                // Invalid or unsupported selector for this page state — try the next.
            }
        }
        return null;
    }

    /** Derives a title from document.title when the selectors miss. */
    function fallbackTitle(mode: ScrapeConfig['titleFallback']): string {
        if (mode === 'linkedin') {
            return document.title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
        }
        return document.title
            .replace(/\s*[—–|]\s*(Вакансия|Vacancy)\b.*$/i, '')
            .trim();
    }

    /** Finds the description: selectors first, then the configured heuristic. */
    function findDescription(scrape: ScrapeConfig): string | undefined {
        const node = firstMatchNode(scrape.descriptionSelectors);
        if (node) return sanitizeMoreButton(node).innerText?.trim();
        if (scrape.descriptionFallback === 'about-heading') {
            return descriptionFromAboutHeading();
        }
        return undefined;
    }

    /**
     * LinkedIn heuristic: locate the container that has exactly one direct
     * "About the job" child node and take the node right after it.
     */
    function descriptionFromAboutHeading(): string | undefined {
        const containers = Array.from(
            document.querySelectorAll<HTMLDivElement>('div:has(> div > h2)')
        ).filter((div) => countTextChildren(div, 'About the job') === 1);

        if (containers.length !== 1) return undefined;

        const children = Array.from(containers[0]!.childNodes);
        const headingIndex = children.findIndex(
            (node) => node.textContent === 'About the job'
        );
        const descriptionNode =
            headingIndex >= 0 ? children[headingIndex + 1] : undefined;
        if (!descriptionNode) return undefined;

        return sanitizeMoreButton(
            descriptionNode as HTMLElement
        ).innerText?.trim();
    }

    function countTextChildren(node: Node, text: string): number {
        return Array.from(node.childNodes).filter(
            (child) => child.textContent === text
        ).length;
    }

    /**
     * The description node often contains a "… more" toggle button that would
     * pollute the scraped text — clone the node and strip such buttons.
     */
    function sanitizeMoreButton(node: HTMLElement): HTMLElement {
        const clone = node.cloneNode(true) as HTMLElement;
        for (const button of clone.querySelectorAll('button')) {
            if (button.textContent?.trim().toLowerCase() === '… more') {
                button.remove();
            }
        }
        return clone;
    }
}
