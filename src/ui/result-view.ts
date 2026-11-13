import type { CheckRecord, Verdict } from '../types';
import { formatDateTime, scoreOf } from '../utils';
import type { PopupElements } from './dom';
import { Messages } from './messages';

/**
 * Renders the result card, the status line and the busy state of the main
 * view. Pure presentation: it never touches storage, tabs or the network.
 */
export class ResultView {
    constructor(private readonly els: PopupElements) {}

    render(record: CheckRecord, fromCache: boolean): void {
        const verdict: Partial<Verdict> = record.verdict || {};
        const score = scoreOf(record);
        const tier = score >= 8 ? 'good' : score >= 5 ? 'mid' : 'low';

        this.els.scoreBadge.className = `score-badge ${tier}`;
        this.els.scoreNum.textContent = String(score);
        this.els.jobTitleLine.textContent = record.title || '';
        this.els.project.textContent =
            verdict.project || Messages.unknownProject;
        this.els.verdict.textContent = verdict.verdict || '';

        this.fillList(this.els.prosList, verdict.pros);
        this.fillList(this.els.consList, verdict.cons);

        this.els.resultMeta.textContent =
            (fromCache ? Messages.cachedPrefix : Messages.checkedPrefix) +
            formatDateTime(record.checkedAt);

        this.els.result.classList.remove('hidden');
    }

    hide(): void {
        this.els.result.classList.add('hidden');
    }

    setStatus(text: string, isError = false): void {
        this.els.status.textContent = text;
        this.els.status.classList.toggle('error', isError);
    }

    clearStatus(): void {
        this.setStatus('', false);
    }

    setBusy(busy: boolean): void {
        this.els.analyzeBtn.disabled = busy;
    }

    private fillList(ul: HTMLUListElement, items: string[] | undefined): void {
        ul.replaceChildren();
        const list = (items ?? []).slice(0, 4);
        if (list.length === 0) {
            const li = document.createElement('li');
            li.textContent = Messages.emptyListItem;
            ul.appendChild(li);
            return;
        }
        for (const text of list) {
            const li = document.createElement('li');
            li.textContent = text;
            ul.appendChild(li);
        }
    }
}
