/**
 * dsh-find-plugin — find DSH plugins from the curated awesome-dsh-plugin
 * registry, inside the agent.
 *
 * Registers the `find_dsh_plugin` tool. Results come in two tiers:
 * curated (human-verified registry entries) and community (live GitHub
 * `dsh-plugin` topic search, unverified).
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { loadRegistry } from './registry.ts'
import { searchRegistry, type Match } from './search.ts'
import { searchGitHub, type CommunityPlugin } from './github.ts'

export const name = 'dsh-find-plugin'
export const inject = ['tools']

const CATEGORIES = ['ui', 'session', 'tools', 'workflow', 'notify', 'dev', 'fun'] as const

type FindResult = {
  updated: string
  source: string
  curated: Array<{
    name: string
    url: string
    category: string
    description: string
    install: string
  }>
  community: Array<{
    name: string
    url: string
    description: string
    stars: number
    install: string
  }>
  note: string
}

function renderText(result: FindResult): string {
  const parts: string[] = []
  if (result.curated.length > 0) {
    parts.push('Curated (verified):')
    parts.push(...result.curated.map(
      (m, i) => `${i + 1}. ${m.name} [${m.category}] — ${m.description}\n   ${m.url}\n   install: ${m.install}`,
    ))
  }
  if (result.community.length > 0) {
    parts.push('Community (unverified — review the source before installing):')
    parts.push(...result.community.map(
      (m, i) => `${i + 1}. ${m.name} ★${m.stars} — ${m.description}\n   ${m.url}\n   install: ${m.install}`,
    ))
  }
  if (parts.length === 0) {
    return 'No matching plugins found. Try broader keywords, or browse https://awesome-dsh-plugin.com'
  }
  return parts.join('\n\n')
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'find_dsh_plugin',
    description:
      'Search for DeepSeek Harness plugins. Two tiers: curated results from the human-verified ' +
      'awesome-dsh-plugin registry (bilingual, safe to recommend), plus community results from a live GitHub ' +
      '`dsh-plugin` topic search (unverified — advise reviewing the source). Returns descriptions and ' +
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
        description:
          "'curated' searches only the verified registry; 'all' always adds the GitHub community tier. " +
          "Default: community tier is added only when curated results are sparse.",
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderText(value as unknown as FindResult) }],
    },
    execute: async args => {
      const limit = args.limit ?? 5
      const { registry, source } = await loadRegistry()
      const category = args.category && (CATEGORIES as readonly string[]).includes(args.category) ? args.category : undefined
      const matches: Match[] = searchRegistry(registry, args.query, category, limit)
      const curated = matches.map(m => ({
        name: m.name,
        url: m.url,
        category: m.category,
        description: m.description[args.lang ?? 'en'] ?? m.description.en ?? Object.values(m.description)[0] ?? '',
        install: m.install,
      }))

      let community: CommunityPlugin[] = []
      let note = ''
      const wantCommunity = args.scope === 'all' || (args.scope !== 'curated' && curated.length < 3)
      if (wantCommunity) {
        try {
          const curatedUrls = new Set(registry.plugins.map(p => p.url.toLowerCase()))
          community = (await searchGitHub(args.query, limit)).filter(c => !curatedUrls.has(c.url.toLowerCase()))
          note = 'Community results are not reviewed by awesome-dsh-plugin — installing runs third-party build scripts; review the source and pin a commit.'
        } catch {
          note = 'GitHub community search unavailable right now; showing curated results only.'
        }
      }

      const result: FindResult = {
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
      }
      return result
    },
    timeoutMs: 10000,
  }))
}
