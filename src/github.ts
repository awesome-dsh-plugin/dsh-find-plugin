/**
 * Community tier: live GitHub search over the public `dsh-plugin` topic.
 * These results are outside the curated list — callers must label them so.
 *
 * GitHub's **search** endpoint allows only 10 requests/minute per public IP when
 * unauthenticated, and that quota is shared by every host behind the same egress
 * IP (carrier CGNAT in practice), so this call fails intermittently with a bare
 * `HTTP 403` for reasons the user cannot control. This module therefore:
 *
 *  1. sends an optional bearer token — authenticated search allows 30 req/min
 *     and is account-scoped, so it is immune to shared-IP exhaustion;
 *  2. treats 403/429 as rate limiting: retries once (honouring `retry-after`),
 *     then throws {@link GitHubSearchRateLimited} carrying `limit` /
 *     `remaining` / `resetAt` so the caller can degrade instead of failing;
 *  3. retries once on network errors too (one retry budget per call, shared
 *     with the rate-limit path; a caller-cancelled request is never retried);
 *  4. caches failures for a minute so a retry loop cannot keep burning quota.
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

export interface GitHubRateLimitInfo {
  status: number
  limit?: number
  remaining?: number
  resetAt?: string
  retryAfter?: number
}

export interface SearchGitHubOptions {
  /** GitHub PAT. Without it the anonymous 10 req/min/IP quota applies. */
  token?: string
  /** Caller cancellation (merged with the per-attempt timeout). */
  signal?: AbortSignal
}

/** Thrown when GitHub reports rate limiting, so callers can fall back. */
export class GitHubSearchRateLimited extends Error {
  readonly info: GitHubRateLimitInfo

  constructor(message: string, info: GitHubRateLimitInfo) {
    super(message)
    this.name = 'GitHubSearchRateLimited'
    this.info = info
  }
}

const OK_TTL_MS = 5 * 60 * 1000
const FAIL_TTL_MS = 60 * 1000
const TIMEOUT_MS = 8000
const RETRY_DELAY_MS = 1500
const MAX_RETRY_DELAY_MS = 3000

type CacheEntry = { at: number; data?: CommunityPlugin[]; error?: Error }

const cache = new Map<string, CacheEntry>()

function rateLimitInfo(res: Response): GitHubRateLimitInfo {
  const num = (key: string): number | undefined => {
    const raw = res.headers.get(key)
    if (raw === null) return undefined
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }
  const reset = num('x-ratelimit-reset')
  return {
    status: res.status,
    limit: num('x-ratelimit-limit'),
    remaining: num('x-ratelimit-remaining'),
    resetAt: reset === undefined ? undefined : new Date(reset * 1000).toISOString(),
    retryAfter: num('retry-after'),
  }
}

function describe(info: GitHubRateLimitInfo, authenticated: boolean): string {
  return [
    `limit=${info.limit ?? '?'}`,
    `remaining=${info.remaining ?? '?'}`,
    info.resetAt === undefined ? undefined : `resetAt=${info.resetAt}`,
    authenticated ? 'token=set' : 'token=none',
  ].filter((part): part is string => part !== undefined).join(' ')
}

export async function searchGitHub(
  query: string,
  limit = 5,
  options: SearchGitHubOptions = {},
): Promise<CommunityPlugin[]> {
  const key = query.toLowerCase().trim()
  const hit = cache.get(key)
  if (hit !== undefined && Date.now() - hit.at < (hit.error === undefined ? OK_TTL_MS : FAIL_TTL_MS)) {
    if (hit.error !== undefined) throw hit.error
    return (hit.data ?? []).slice(0, limit)
  }

  const token = typeof options.token === 'string' && options.token.length > 0 ? options.token : undefined
  const callerSignal = options.signal
  const q = encodeURIComponent(`${query} topic:dsh-plugin`)
  const url = `https://api.github.com/search/repositories?q=${q}&per_page=${Math.min(limit * 2, 20)}`
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'dsh-find-plugin' }
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  const signalFor = (): AbortSignal =>
    callerSignal === undefined ? AbortSignal.timeout(TIMEOUT_MS) : AbortSignal.any([callerSignal, AbortSignal.timeout(TIMEOUT_MS)])

  let attempt = 0
  for (;;) {
    let res: Response
    try {
      res = await fetch(url, { headers, signal: signalFor() })
    } catch (error) {
      if (attempt === 0 && callerSignal?.aborted !== true) {
        attempt += 1
        await new Promise(resolvePromise => setTimeout(resolvePromise, RETRY_DELAY_MS))
        continue
      }
      const wrapped = new Error(`GitHub search failed: ${error instanceof Error ? error.message : String(error)}`)
      cache.set(key, { at: Date.now(), error: wrapped })
      throw wrapped
    }

    if (res.ok) {
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

    const info = rateLimitInfo(res)
    const limited = res.status === 403 || res.status === 429
    if (limited && attempt === 0) {
      attempt += 1
      const delay = info.retryAfter === undefined
        ? RETRY_DELAY_MS
        : Math.min(info.retryAfter * 1000, MAX_RETRY_DELAY_MS)
      await new Promise(resolvePromise => setTimeout(resolvePromise, delay))
      continue
    }

    const detail = describe(info, token !== undefined)
    const error = limited
      ? new GitHubSearchRateLimited(
          `GitHub search rate limited (HTTP ${res.status}; ${detail}). ` +
            'Anonymous search allows 10 req/min per public IP and that quota is shared by every host ' +
            'behind the same egress IP; an authenticated GITHUB_TOKEN raises it to 30 req/min and is ' +
            'account-scoped.',
          info,
        )
      : new Error(`GitHub search HTTP ${res.status}${detail === '' ? '' : ` (${detail})`}`)
    cache.set(key, { at: Date.now(), error })
    throw error
  }
}
