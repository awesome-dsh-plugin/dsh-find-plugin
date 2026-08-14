/**
 * Zero-dependency scoring over the registry: token matches against name,
 * owner, category, and both description languages. Deliberately simple —
 * ranking candidates for an agent, not building a search engine.
 */
import type { Registry, RegistryPlugin } from './registry.ts';
export interface Match extends RegistryPlugin {
    score: number;
}
export declare function searchRegistry(registry: Registry, query: string, category?: string, limit?: number): Match[];
