import type { SiteId } from '../types';
import type { SiteStrategy } from './site-strategy';

/**
 * Registry of site strategies — the context side of the Strategy pattern.
 *
 * Consumers (controllers, services) depend on this registry and on the
 * SiteStrategy abstraction, never on a concrete website class (Dependency
 * Inversion). `register` is the single extension point for new websites.
 */
export class SiteRegistry {
    private readonly strategies = new Map<SiteId, SiteStrategy>();

    register(strategy: SiteStrategy): this {
        this.strategies.set(strategy.id, strategy);
        return this;
    }

    get(id: SiteId): SiteStrategy | null {
        return this.strategies.get(id) ?? null;
    }

    /** Finds the strategy whose site the URL belongs to, or null. */
    detect(url: string | undefined): SiteStrategy | null {
        if (!url) return null;
        for (const strategy of this.strategies.values()) {
            if (strategy.matches(url)) return strategy;
        }
        return null;
    }
}
