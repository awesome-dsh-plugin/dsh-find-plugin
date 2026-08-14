/**
 * dsh-find-plugin — find DSH plugins from the curated awesome-dsh-plugin
 * registry, inside the agent.
 *
 * Registers the `find_dsh_plugin` tool. Results come in two tiers:
 * curated (entries from the hand-maintained list) and community (live
 * GitHub `dsh-plugin` topic search, outside the list).
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { loadRegistry } from './registry.js';
import { searchRegistry } from './search.js';
import { searchGitHub } from './github.js';
export const name = 'dsh-find-plugin';
export const inject = ['tools'];
const CATEGORIES = ['ui', 'session', 'tools', 'workflow', 'notify', 'dev', 'fun'];
function renderText(result) {
    const parts = [];
    if (result.curated.length > 0) {
        parts.push('From the curated list (awesome-dsh-plugin):');
        parts.push(...result.curated.map((m, i) => `${i + 1}. ${m.name} [${m.category}] — ${m.description}\n   ${m.url}\n   install: ${m.install}`));
    }
    if (result.community.length > 0) {
        parts.push('More from GitHub (not in the curated list — review the source before installing):');
        parts.push(...result.community.map((m, i) => `${i + 1}. ${m.name} ★${m.stars} — ${m.description}\n   ${m.url}\n   install: ${m.install}`));
    }
    if (parts.length === 0) {
        return 'No matching plugins found. Try broader keywords, or browse https://awesome-dsh-plugin.com';
    }
    return parts.join('\n\n');
}
export function apply(ctx) {
    ctx.tools.register(defineTool({
        name: 'find_dsh_plugin',
        description: 'Search for DeepSeek Harness plugins. Two tiers: entries from the curated awesome-dsh-plugin list ' +
            '(bilingual descriptions), plus community results from a live GitHub `dsh-plugin` topic search ' +
            '(not in the curated list — advise reviewing the source). Returns descriptions and ' +
            'ready-to-run `dsh plugin add` install commands. Use when the user wants a capability DSH does not ' +
            'currently have, or asks what plugins exist. Categories: ui, session, tools, workflow, notify, dev, fun.',
        parameters: {
            query: {
                type: 'string',
                required: true,
                description: 'Keywords describing the capability, e.g. "wechat notifications", "TUI", "跨会话记忆"',
            },
            category: {
                type: 'string',
                description: `Optional curated-tier category filter, one of: ${CATEGORIES.join(', ')}`,
            },
            limit: {
                type: 'number',
                description: 'Max results per tier (default 5, max 20)',
            },
            lang: {
                type: 'string',
                description: "Preferred description language, matching the conversation (e.g. 'en', 'zh'). Defaults to 'en'.",
            },
            scope: {
                type: 'string',
                description: "'curated' searches only the curated list; 'all' always adds the GitHub community tier. " +
                    "Default: community tier is added only when curated results are sparse.",
            },
        },
        output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args, value) => [{ type: 'text', text: renderText(value) }],
        },
        execute: async (args) => {
            const limit = args.limit ?? 5;
            const { registry, source } = await loadRegistry();
            const category = args.category && CATEGORIES.includes(args.category) ? args.category : undefined;
            const matches = searchRegistry(registry, args.query, category, limit);
            const curated = matches.map(m => ({
                name: m.name,
                url: m.url,
                category: m.category,
                description: m.description[args.lang ?? 'en'] ?? m.description.en ?? Object.values(m.description)[0] ?? '',
                install: m.install,
            }));
            // Community tier always runs; how much of it surfaces depends on
            // curated coverage: sparse curated results → fill up to `limit`;
            // good coverage → only notable (starred) finds, capped, so the
            // curated tier stays the headline without hiding standouts.
            const NOTABLE_MIN_STARS = 10;
            let community = [];
            let note = '';
            if (args.scope !== 'curated') {
                try {
                    const curatedUrls = new Set(registry.plugins.map(p => p.url.toLowerCase()));
                    const fresh = (await searchGitHub(args.query, Math.max(limit, 10))).filter(c => !curatedUrls.has(c.url.toLowerCase()));
                    community = args.scope === 'all' || curated.length < 3
                        ? fresh.slice(0, limit)
                        : fresh.filter(c => c.stars >= NOTABLE_MIN_STARS).slice(0, 3);
                    if (community.length > 0) {
                        note = 'Community results come from a live GitHub topic search and are not part of the curated list. Installing runs third-party build scripts — review the source and pin a commit.';
                    }
                }
                catch {
                    if (curated.length < 3)
                        note = 'GitHub community search unavailable right now; showing curated results only.';
                }
            }
            const result = {
                updated: registry.updated,
                source,
                curated,
                community: community.map(c => ({
                    name: c.name,
                    url: c.url,
                    description: c.description,
                    stars: c.stars,
                    install: c.install,
                })),
                note,
            };
            return result;
        },
        timeoutMs: 10000,
    }));
}
