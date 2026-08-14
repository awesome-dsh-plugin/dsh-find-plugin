/**
 * dsh-find-plugin — find DSH plugins from the curated awesome-dsh-plugin
 * registry, inside the agent.
 *
 * Registers the `find_dsh_plugin` tool: keyword/category search over
 * human-verified plugins, returning descriptions and install commands.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { loadRegistry } from './registry.js';
import { searchRegistry } from './search.js';
export const name = 'dsh-find-plugin';
export const inject = ['tools'];
const CATEGORIES = ['ui', 'session', 'tools', 'workflow', 'notify', 'dev', 'fun'];
function renderText(result) {
    if (result.matches.length === 0) {
        return 'No matching plugins in the curated registry. Try broader keywords, or browse https://awesome-dsh-plugin.com';
    }
    const lines = result.matches.map((m, i) => `${i + 1}. ${m.name} [${m.category}] — ${m.description}\n   ${m.url}\n   install: ${m.install}`);
    return lines.join('\n\n');
}
export function apply(ctx) {
    ctx.tools.register(defineTool({
        name: 'find_dsh_plugin',
        description: 'Search the curated awesome-dsh-plugin registry (human-verified DeepSeek Harness plugins, bilingual) ' +
            'by keyword, capability, or category. Returns matching plugins with descriptions and ready-to-run ' +
            '`dsh plugin add` install commands. Use this when the user wants a capability DSH does not currently have, ' +
            'or asks what plugins exist for a task. Categories: ui, session, tools, workflow, notify, dev, fun.',
        parameters: {
            query: {
                type: 'string',
                required: true,
                description: 'Keywords describing the capability, e.g. "wechat notifications", "TUI", "跨会话记忆"',
            },
            category: {
                type: 'string',
                description: `Optional category filter, one of: ${CATEGORIES.join(', ')}`,
            },
            limit: {
                type: 'number',
                description: 'Max results to return (default 5, max 20)',
            },
            lang: {
                type: 'string',
                description: "Preferred description language, matching the conversation (e.g. 'en', 'zh'). Defaults to 'en'.",
            },
        },
        output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args, value) => [{ type: 'text', text: renderText(value) }],
        },
        execute: async (args) => {
            const { registry, source } = await loadRegistry();
            const category = args.category && CATEGORIES.includes(args.category) ? args.category : undefined;
            const matches = searchRegistry(registry, args.query, category, args.limit ?? 5);
            const result = {
                updated: registry.updated,
                source,
                total: matches.length,
                matches: matches.map(m => ({
                    name: m.name,
                    url: m.url,
                    category: m.category,
                    description: m.description[args.lang ?? 'en'] ?? m.description.en ?? Object.values(m.description)[0] ?? '',
                    install: m.install,
                })),
            };
            return result;
        },
        timeoutMs: 8000,
    }));
}
