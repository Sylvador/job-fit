import type { CheckRecord } from '../types';
import type { HistoryStore } from '../services/history-store';
import type { HistoryView } from '../ui/history-view';

/**
 * Coordinates the history feature between the store (persistence) and the
 * view (presentation): opening the panel reloads records from storage, and
 * user actions flow back through the store before re-rendering.
 */
export class HistoryController {
    private opened = false;

    constructor(
        private readonly store: HistoryStore,
        private readonly view: HistoryView
    ) {}

    get isOpen(): boolean {
        return this.opened;
    }

    async openHistory(): Promise<void> {
        this.opened = true;
        this.view.show();
        await this.store.loadAll();
        this.view.render(this.store.all);
    }

    closeHistory(): void {
        this.opened = false;
        this.view.hide();
    }

    async deleteRecord(record: CheckRecord): Promise<void> {
        await this.store.delete(record);
        this.view.render(this.store.all);
    }

    async clearAll(): Promise<void> {
        if (this.store.all.length === 0) return;
        await this.store.clearAll();
        this.view.render(this.store.all);
    }
}
