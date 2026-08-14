/**
 * dsh-find-plugin — find DSH plugins inside the agent.
 *
 * Registers the `find_dsh_plugin` tool: a live GitHub search over the
 * public `dsh-plugin` topic, ranked by stars. When a result is also on
 * the awesome-dsh-plugin curated list, its bilingual description is used —
 * ranking and presentation are otherwise untouched.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { loadRegistry } from './registry.ts'
import { searchGitHub } from './github.ts'

export const name = 'dsh-find-plugin'
export const inject = ['tools']

type FindItem = {
  name: string
  url: string
  description: string
  stars: number
  install: string
}

type FindResult = {
  results: FindItem[]
  note: string
}

function renderText(result: FindResult): string {
  if (result.results.length === 0) {
    return 'No matching plugins found. Try broader keywords, or browse https://awesome-dsh-plugin.com'
  }
  const lines = result.results.map((m, i) =>
    `${i + 1}. ${m.name} ★${m.stars} — ${m.description}\n   ${m.url}\n   install: ${m.install}`,
  )
  return lines.join('\n\n') + (result.note ? `\n\n${result.note}` : '')
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'find_dsh_plugin',
    description:
      'Search GitHub for DeepSeek Harness plugins (public `dsh-plugin` topic), ranked by stars. Returns ' +
      'descriptions and ready-to-run `dsh plugin add` install commands. Use when the user wants a capability ' +
      'DSH does not currently have, or asks what plugins exist. Plugins are third-party code — advise reviewing ' +
      'the source and pinning a commit.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Keywords describing the capability, e.g. "wechat notifications", "TUI", "跨会话记忆"',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 8, max 20)',
      },
      lang: {
        type: 'string',
        description: "Preferred description language for curated entries (e.g. 'en', 'zh'). Defaults to 'en'.",
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderText(value as unknown as FindResult) }],
    },
    execute: async args => {
      const limit = Math.max(1, Math.min(args.limit ?? 8, 20))
      const found = await searchGitHub(args.query, limit)

      // Optional enrichment from the curated list: better (bilingual)
      // descriptions and a marker. Never affects ranking; failures ignored.
      const curated = new Map<string, Record<string, string>>()
      try {
        const { registry } = await loadRegistry()
        for (const p of registry.plugins) curated.set(p.url.toLowerCase(), p.description)
      } catch { /* registry unavailable — GitHub descriptions only */ }

      const results: FindItem[] = found
        .sort((a, b) => b.stars - a.stars)
        .map(c => {
          const desc = curated.get(c.url.toLowerCase())
          return {
            name: c.name,
            url: c.url,
            description: desc ? (desc[args.lang ?? 'en'] ?? desc.en ?? c.description) : c.description,
            stars: c.stars,
            install: c.install,
          }
        })

      const note = results.length > 0
        ? 'Live GitHub `dsh-plugin` topic search, ranked by stars. All plugins are third-party code — review the source and pin a commit when installing. Browse the curated list at https://awesome-dsh-plugin.com'
        : ''
      return { results, note } satisfies FindResult
    },
    timeoutMs: 10000,
  }))
}
