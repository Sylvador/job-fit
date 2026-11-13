import { CHECK_KEY_PREFIX } from '../config';
import type { CheckRecord, SiteId } from '../types';
import type { StorageService } from './storage';

/**
 * Check-result cache.
 *
 * Under the `check_<site>_<jobId>` key the Gemini verdict is stored together
 * with metadata (profile hash, model, timestamp). A record is served from the
 * cache only while the candidate profile and the model are unchanged; the
 * «Проверить заново» button bypasses the cache entirely.
 */
export class CheckCache {
    constructor(private readonly storage: StorageService) {}

    static key(site: SiteId, jobId: string): string {
        return `${CHECK_KEY_PREFIX}${site}_${jobId}`;
    }

    async get(site: SiteId, jobId: string): Promise<CheckRecord | null> {
        const record = await this.storage.get<CheckRecord>(
            CheckCache.key(site, jobId)
        );
        return record ?? null;
    }

    async put(record: CheckRecord): Promise<void> {
        await this.storage.set({
            [CheckCache.key(record.site, record.jobId)]: record,
        });
    }

    /** True when the record can be shown without querying the model again. */
    isUpToDate(
        record: CheckRecord | null,
        profileHash: string,
        model: string
    ): boolean {
        return Boolean(
            record &&
                record.verdict &&
                record.profileHash === profileHash &&
                record.model === model
        );
    }
}
