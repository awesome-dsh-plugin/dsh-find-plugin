/**
 * dsh-find-plugin — find DSH plugins inside the agent.
 *
 * Registers the `find_dsh_plugin` tool: a live GitHub search over the
 * public `dsh-plugin` topic, ranked by stars. When a result is also on
 * the awesome-dsh-plugin curated list, its bilingual description is used —
 * ranking and presentation are otherwise untouched.
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-find-plugin";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
