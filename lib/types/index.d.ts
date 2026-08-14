/**
 * dsh-find-plugin — find DSH plugins from the curated awesome-dsh-plugin
 * registry, inside the agent.
 *
 * Registers the `find_dsh_plugin` tool. Results come in two tiers:
 * curated (entries from the hand-maintained list) and community (live
 * GitHub `dsh-plugin` topic search, outside the list).
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-find-plugin";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
