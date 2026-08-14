/**
 * Community tier: live GitHub search over the public `dsh-plugin` topic.
 * These results are outside the curated list — callers must label them so.
 * Unauthenticated search allows 10 req/min; a per-query cache keeps a local
 * tool well under that.
 */

export interface CommunityPlugin {
  name: string
  owner: string
  url: string
  description: string
  stars: number
  pushed: string
  install: string
}

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; data: CommunityPlugin[] }>()

export async function searchGitHub(query: string, limit = 5): Promise<CommunityPlugin[]> {
  const key = query.toLowerCase().trim()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data.slice(0, limit)

  const q = encodeURIComponent(`${query} topic:dsh-plugin`)
  const url = `https://api.github.com/search/repositories?q=${q}&per_page=${Math.min(limit * 2, 20)}`
  const res = await fetch(url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-find-plugin' },
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) throw new Error(`GitHub search HTTP ${res.status}`)
  const body = (await res.json()) as { items?: Array<Record<string, unknown>> }
  const data: CommunityPlugin[] = (body.items ?? []).map(it => ({
    name: String(it.name ?? ''),
    owner: String((it.owner as Record<string, unknown> | undefined)?.login ?? ''),
    url: String(it.html_url ?? ''),
    description: String(it.description ?? ''),
    stars: Number(it.stargazers_count ?? 0),
    pushed: String(it.pushed_at ?? ''),
    install: `dsh plugin --profile web add github:${String(it.full_name ?? '')}`,
  }))
  cache.set(key, { at: Date.now(), data })
  return data.slice(0, limit)
}
