import type { CheckRecord } from '../types';
import { formatDateTime, scoreOf } from '../utils';
import type { PopupElements } from './dom';
import { Messages } from './messages';

export interface HistoryViewCallbacks {
    /** Whether the record was made with the current profile and model. */
    isRecordStale(record: CheckRecord): boolean;
    /** The per-record «Удалить» button was clicked. */
    onDeleteRecord(record: CheckRecord): void;
    /** The «clear all» button was clicked (confirmation handled by the view). */
    onClearAll(): void;
}

/**
 * Renders the history view: visibility of main/history panels, the
 * search/sort controls and the list of past checks. Pure presentation —
 * records come in via render(), all actions go out via callbacks.
 */
export class HistoryView {
    private records: CheckRecord[] = [];

    constructor(
        private readonly els: PopupElements,
        private readonly callbacks: HistoryViewCallbacks
    ) {}

    bind(): void {
        this.els.historySearch.addEventListener('input', () => this.rerender());
        this.els.historySort.addEventListener('change', () => this.rerender());
        this.els.clearHistory.addEventListener('click', () => {
            if (this.records.length === 0) return;
            if (!confirm(Messages.clearHistoryConfirm(this.records.length)))
                return;
            this.callbacks.onClearAll();
        });
    }

    /** Shows the history panel (hides the main view). */
    show(): void {
        this.els.mainView.classList.add('hidden');
        this.els.historyView.classList.remove('hidden');
        this.els.historyToggle.classList.add('is-active');
    }

    /** Hides the history panel (shows the main view). */
    hide(): void {
        this.els.mainView.classList.remove('hidden');
        this.els.historyView.classList.add('hidden');
        this.els.historyToggle.classList.remove('is-active');
    }

    /** Replaces the rendered records and redraws the list. */
    render(records: readonly CheckRecord[]): void {
        this.records = [...records];
        this.rerender();
    }

    // --- internals -----------------------------------------------------------

    private rerender(): void {
        const query = this.els.historySearch.value.trim().toLowerCase();
        const sortBy = this.els.historySort.value;

        const items = this.records.filter(
            (record) =>
                !query || (record.title || '').toLowerCase().includes(query)
        );
        items.sort((a, b) =>
            sortBy === 'score'
                ? scoreOf(b) - scoreOf(a) || b.checkedAt - a.checkedAt
                : b.checkedAt - a.checkedAt
        );

        this.els.historyList.replaceChildren();
        for (const record of items) {
            this.els.historyList.appendChild(this.buildItem(record));
        }

        this.els.historyEmpty.classList.toggle('hidden', items.length !== 0);
        if (items.length === 0) {
            this.els.historyEmpty.textContent =
                this.records.length === 0
                    ? Messages.historyEmpty
                    : Messages.historyNoMatch;
        }
        this.els.clearHistory.classList.toggle(
            'hidden',
            this.records.length === 0
        );
    }

    private buildItem(record: CheckRecord): HTMLLIElement {
        const score = scoreOf(record);
        const tier = score >= 8 ? 'hs-good' : score >= 5 ? 'hs-mid' : 'hs-low';

        const li = document.createElement('li');
        li.className = 'history-item';

        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'history-item-head';

        const scoreEl = document.createElement('span');
        scoreEl.className = `history-score ${tier}`;
        scoreEl.textContent = String(score);

        const textWrap = document.createElement('span');
        textWrap.className = 'history-head-text';

        const titleEl = document.createElement('span');
        titleEl.className = 'history-title';
        const title = record.title || Messages.untitled;
        titleEl.textContent = title;
        titleEl.title = title;

        const metaEl = document.createElement('span');
        metaEl.className = 'history-meta';
        const dateEl = document.createElement('span');
        dateEl.textContent = `${formatDateTime(record.checkedAt)} · ${
            record.model || Messages.defaultModelLabel
        }`;
        metaEl.appendChild(dateEl);
        if (this.callbacks.isRecordStale(record)) {
            const staleEl = document.createElement('span');
            staleEl.className = 'history-stale';
            staleEl.textContent = Messages.staleBadge;
            metaEl.appendChild(staleEl);
        }

        const chevron = document.createElement('span');
        chevron.className = 'history-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '▾';

        textWrap.append(titleEl, metaEl);
        head.append(scoreEl, textWrap, chevron);

        const details = document.createElement('div');
        details.className = 'history-details hidden';

        const verdictEl = document.createElement('p');
        verdictEl.className = 'history-verdict';
        verdictEl.textContent = record.verdict.verdict || '';
        details.appendChild(verdictEl);

        const cols = document.createElement('div');
        cols.className = 'history-cols';
        cols.appendChild(
            this.buildMiniCol(Messages.prosLabel, record.verdict.pros)
        );
        cols.appendChild(
            this.buildMiniCol(Messages.consLabel, record.verdict.cons)
        );
        details.appendChild(cols);

        const actions = document.createElement('div');
        actions.className = 'history-actions';

        const link = document.createElement('a');
        link.className = 'history-link';
        if (record.url) {
            link.href = record.url;
            link.target = '_blank';
            link.rel = 'noopener';
        }
        link.textContent = Messages.openVacancy;

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'history-delete';
        del.textContent = Messages.deleteRecord;
        del.addEventListener('click', () =>
            this.callbacks.onDeleteRecord(record)
        );

        actions.append(link, del);
        details.appendChild(actions);

        head.addEventListener('click', () => {
            const willOpen = details.classList.contains('hidden');
            details.classList.toggle('hidden', !willOpen);
            li.classList.toggle('open', willOpen);
            head.setAttribute('aria-expanded', String(willOpen));
        });

        li.append(head, details);
        return li;
    }

    private buildMiniCol(
        label: string,
        items: string[] | undefined
    ): HTMLDivElement {
        const wrap = document.createElement('div');

        const labelEl = document.createElement('p');
        labelEl.className = 'history-col-label';
        labelEl.textContent = label;

        const ul = document.createElement('ul');
        ul.className = 'history-list-mini';
        const list = (items ?? []).slice(0, 4);
        if (list.length === 0) list.push(Messages.emptyListItem);
        for (const text of list) {
            const li = document.createElement('li');
            li.textContent = text;
            ul.appendChild(li);
        }

        wrap.append(labelEl, ul);
        return wrap;
    }
}
