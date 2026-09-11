/**
 * dsh-find-plugin — find DSH plugins inside the agent.
 *
 * Registers the `find_dsh_plugin` tool: a live GitHub search over the
 * public `dsh-plugin` topic, ranked by stars. When a result is also on
 * the awesome-dsh-plugin curated list, its bilingual description is used —
 * ranking and presentation are otherwise untouched.
 *
 * Rate limits are handled instead of surfacing them raw. GitHub's anonymous
 * search quota (10 req/min per public IP) is shared with every host behind the
 * same egress IP, so a search can fail for reasons the user cannot control:
 *
 *  - an optional `GITHUB_TOKEN` credential is resolved per call through
 *    `ctx.credentials` (30 req/min, account-scoped). The credentials service is
 *    an **optional** dependency and is therefore read with `ctx.get()` rather
 *    than declared in `inject` — a missing required service would stop this
 *    plugin from loading at all;
 *  - when GitHub is rate limited or unreachable, the tool degrades to keyword
 *    matches from the curated list (which already ships in `data/` and is
 *    cached on disk) instead of returning an error.
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-find-plugin";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
