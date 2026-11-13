import { CHECK_KEY_PREFIX } from '../config';
import type { CheckRecord, SiteId } from '../types';
import { CheckCache } from './check-cache';
import type { StorageService } from './storage';

/**
 * In-memory list of all persisted checks, backed by the CheckCache keys
 * (same `check_<site>_<jobId>` storage entries, listed as history).
 *
 * Also owns the one-time migration of legacy records that were saved before
 * multi-site support existed: they had no `site` field and were keyed as
 * `check_<jobId>`.
 */
export class HistoryStore {
    private records: CheckRecord[] = [];

    constructor(private readonly storage: StorageService) {}

    get all(): readonly CheckRecord[] {
        return this.records;
    }

    /** Reloads the records from storage; call whenever the history view opens. */
    async loadAll(): Promise<readonly CheckRecord[]> {
        const entries = await this.storage.getAll();
        const loaded: CheckRecord[] = [];

        for (const [key, value] of Object.entries(entries)) {
            if (!key.startsWith(CHECK_KEY_PREFIX)) continue;
            const record = value as CheckRecord | null;
            if (!record || typeof record !== 'object' || !record.verdict)
                continue;
            loaded.push(await this.migrateLegacyRecord(record, key));
        }

        this.records = loaded;
        return this.records;
    }

    async delete(record: CheckRecord): Promise<void> {
        await this.storage.remove(CheckCache.key(record.site, record.jobId));
        this.records = this.records.filter((r) => r !== record);
    }

    async clearAll(): Promise<void> {
        await this.storage.remove(
            this.records.map((r) => CheckCache.key(r.site, r.jobId))
        );
        this.records = [];
    }

    /**
     * Records saved before hh/layboard support have no `site` and live under
     * `check_<jobId>`. They are LinkedIn checks by definition: mark them as
     * such, move them to the new key format and backfill a canonical URL.
     */
    private async migrateLegacyRecord(
        record: CheckRecord,
        oldKey: string
    ): Promise<CheckRecord> {
        if (record.site) return record;

        const migrated: CheckRecord = {
            ...record,
            site: 'linkedin' as SiteId,
            url:
                record.url ??
                `https://www.linkedin.com/jobs/view/${record.jobId}`,
        };
        const newKey = CheckCache.key(migrated.site, migrated.jobId);
        if (newKey !== oldKey) {
            await this.storage.set({ [newKey]: migrated });
            await this.storage.remove(oldKey);
        }
        return migrated;
    }
}
