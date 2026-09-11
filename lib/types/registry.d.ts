/**
 * Registry access: the curated awesome-dsh-plugin list (~3400 entries, all with
 * bilingual descriptions). Cached in memory, on disk, and revalidated with a
 * conditional request.
 *
 * The list is a first-class fallback source, not just a description enricher, so
 * it must survive both restarts and an unreachable server:
 *
 *  1. disk cache at `<DSH_HOME>/cache/dsh-find-plugin/registry.json`, so a
 *     process restart does not re-download ~800KB gzip / 2.7MB JSON;
 *  2. `If-None-Match` / `If-Modified-Since` conditional requests — the server
 *     sends `ETag`/`Last-Modified` and answers 304 with no body, making refresh
 *     nearly free;
 *  3. fallback chain memory → disk cache → bundled snapshot. The bundled
 *     snapshot only has ~176 entries and ages with the release, while the disk
 *     cache holds the full ~3400, so offline quality depends on this order.
 *
 * `DSH_HOME` resolution mirrors `@deepseek-ai/dsh-home-paths` (explicit config →
 * `$DSH_HOME`, blank treated as unset → `~/.dsh`) inlined here to keep the
 * plugin dependency-free.
 */
export interface RegistryPlugin {
    name: string;
    owner: string;
    url: string;
    category: string;
    description: Record<string, string>;
    install: string;
    added: string;
    /** Present in the live registry; used as a ranking tie-breaker. */
    stars?: number;
}
export interface Registry {
    updated: string;
    count: number;
    categories: Record<string, Record<string, string>>;
    plugins: RegistryPlugin[];
}
export type RegistrySource = 'live' | 'cache' | 'memory' | 'disk' | 'snapshot';
export declare function loadRegistry(): Promise<{
    registry: Registry;
    source: RegistrySource;
}>;
