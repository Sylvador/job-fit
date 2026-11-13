/**
 * Thin async wrapper around chrome.storage.local — the ONLY module that talks
 * to the storage API. Every consumer (cache, history, settings wiring)
 * depends on this abstraction rather than on the Chrome API directly, which
 * keeps them unit-testable with an in-memory fake (Dependency Inversion).
 */
export class StorageService {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    const bag = await chrome.storage.local.get(key);
    return bag[key] as T | undefined;
  }

  /** Returns every stored entry (settings and check records alike). */
  async getAll(): Promise<Record<string, unknown>> {
    return chrome.storage.local.get(null);
  }

  async set(entries: Record<string, unknown>): Promise<void> {
    await chrome.storage.local.set(entries);
  }

  async remove(keys: string | string[]): Promise<void> {
    await chrome.storage.local.remove(keys);
  }
}
