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

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { loadRegistry, type Registry, type RegistryPlugin } from './registry.ts'
import { GitHubSearchRateLimited, searchGitHub } from './github.ts'

export const name = 'dsh-find-plugin'
export const inject = ['tools']

/** DSH credential name; `credentialRef()` is a runtime identity, so no import. */
const GITHUB_TOKEN_REF = 'GITHUB_TOKEN'

const DESCRIPTION_MAX_CHARS = 240

const LIVE_NOTE =
  'Live GitHub `dsh-plugin` topic search, ranked by stars. All plugins are third-party code — review the source and pin a commit when installing. Browse the curated list at https://awesome-dsh-plugin.com'

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

/** Resolve the token; a missing service or an unset credential yields undefined. */
async function resolveGitHubToken(ctx: Context): Promise<string | undefined> {
  try {
    const credentials = typeof ctx.get === 'function'
      ? (ctx.get('credentials') as { resolve?: (ref: string) => Promise<{ value?: string } | undefined> } | undefined)
      : undefined
    if (credentials === undefined || typeof credentials.resolve !== 'function') return undefined
    const resolved = await credentials.resolve(GITHUB_TOKEN_REF)
    const value = resolved?.value
    return typeof value === 'string' && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

function tokenize(query: string): string[] {
  return query.toLowerCase().split(/[\s,，、]+/u).map(part => part.trim()).filter(part => part.length > 0)
}

function truncate(text: string, max: number): string {
  const value = String(text ?? '').replace(/\s+/gu, ' ').trim()
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

/**
 * Keyword match against the curated list — the degraded source used when the
 * live search is unavailable. Ranking prefers the number of matched query terms
 * (AND-ish semantics for multi-word queries), then weighted score, then stars.
 */
function searchCurated(registry: Registry, query: string, limit: number, lang: string): FindItem[] {
  const tokens = tokenize(query)
  const whole = query.toLowerCase().trim()
  const labels = registry.categories ?? {}
  const scored: Array<{ plugin: RegistryPlugin; score: number; matched: number }> = []

  for (const plugin of registry.plugins ?? []) {
    const label = labels[plugin.category] ?? {}
    const strong = `${plugin.name ?? ''} ${plugin.owner ?? ''} ${plugin.category ?? ''} ${label.en ?? ''} ${label.zh ?? ''} ${plugin.url ?? ''}`.toLowerCase()
    const weak = `${plugin.description?.en ?? ''} ${plugin.description?.zh ?? ''}`.toLowerCase()
    let score = 0
    let matched = 0
    if (whole.length > 0 && (strong.includes(whole) || weak.includes(whole))) {
      score += 4
      matched += 1
    }
    for (const token of tokens) {
      if (strong.includes(token)) {
        score += 3
        matched += 1
      } else if (weak.includes(token)) {
        score += 1
        matched += 1
      }
    }
    if (score > 0) scored.push({ plugin, score, matched })
  }

  scored.sort((a, b) =>
    b.matched - a.matched || b.score - a.score || Number(b.plugin.stars ?? 0) - Number(a.plugin.stars ?? 0))

  const pick = (description: Record<string, string> | undefined): string =>
    description?.[lang] ?? description?.en ?? description?.zh ?? ''
  return scored.slice(0, limit).map(({ plugin }) => ({
    name: String(plugin.name ?? ''),
    url: String(plugin.url ?? ''),
    description: truncate(pick(plugin.description), DESCRIPTION_MAX_CHARS),
    stars: Number(plugin.stars ?? 0),
    install: String(plugin.install ?? `dsh plugin --profile web add github:${plugin.owner}/${plugin.name}`),
  }))
}

function renderText(result: FindResult): string {
  if (result.results.length === 0) {
    return 'No matching plugins found. Try broader keywords, or browse https://awesome-dsh-plugin.com' +
      (result.note ? `\n\n${result.note}` : '')
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
      'the source and pinning a commit. Falls back to keyword matches from the curated awesome-dsh-plugin list ' +
      'when GitHub search is rate limited or unreachable; the note states which source was used.',
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
    execute: async (args, exec) => {
      const limit = Math.max(1, Math.min(args.limit ?? 8, 20))
      const lang = args.lang ?? 'en'
      const token = await resolveGitHubToken(ctx)

      let githubError: unknown = null
      let found: Awaited<ReturnType<typeof searchGitHub>> = []
      try {
        found = await searchGitHub(args.query, limit, { token, signal: exec?.signal })
      } catch (error) {
        githubError = error
      }

      // Happy path — unchanged: GitHub results, enriched with curated
      // descriptions when the same URL is on the curated list.
      if (githubError === null) {
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
              description: desc ? (desc[lang] ?? desc.en ?? c.description) : c.description,
              stars: c.stars,
              install: c.install,
            }
          })
        return { results, note: results.length > 0 ? LIVE_NOTE : '' } satisfies FindResult
      }

      // Degraded path: GitHub unavailable → curated keyword matches.
      let registry: Registry
      let source: string
      try {
        ({ registry, source } = await loadRegistry())
      } catch {
        // Nothing left to fall back to — surface the original failure.
        throw githubError
      }
      const results = searchCurated(registry, args.query, limit, lang)
      const message = githubError instanceof Error ? githubError.message : String(githubError)
      const reason = githubError instanceof GitHubSearchRateLimited
        ? `GitHub search is rate limited: ${message}`
        : `GitHub search is unavailable: ${message}`
      const note = `${reason}\nFalling back to keyword matches from the curated awesome-dsh-plugin list ` +
        `(source=${source}, ${registry.plugins?.length ?? 0} entries) — not a live star-ranked GitHub result. ` +
        'Configure the DSH `GITHUB_TOKEN` credential to restore live search (30 req/min authenticated).'
      return { results, note } satisfies FindResult
    },
    timeoutMs: 25000,
  }))
}
