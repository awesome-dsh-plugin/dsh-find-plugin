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
/** Thrown when GitHub reports rate limiting, so callers can fall back. */
export class GitHubSearchRateLimited extends Error {
    info;
    constructor(message, info) {
        super(message);
        this.name = 'GitHubSearchRateLimited';
        this.info = info;
    }
}
/** Proxy variables Node's fetch reads only when the host process opted in. */
const PROXY_ENV_VARS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'];
/** Truthy spelling of `NODE_USE_ENV_PROXY`; anything else (including `0`) is off. */
function envProxyOptedIn() {
    const raw = (process.env.NODE_USE_ENV_PROXY ?? '').trim().toLowerCase();
    return raw !== '' && raw !== '0' && raw !== 'false';
}
/**
 * Name the real reason a request failed. Node reports every transport failure
 * as the same `fetch failed` and hides the actionable part — DNS, refused
 * connection, certificate, TLS — one level down in `cause`, so the chain is
 * what a reader (and a bug report) actually needs.
 * @param error - the thrown value.
 * @returns `message (code) ← cause` as far as the chain goes, never empty.
 */
export function describeFailure(error) {
    const parts = [];
    let current = error;
    for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
        const code = current.code;
        const label = typeof code === 'string' && code.length > 0 && !current.message.includes(code)
            ? `${current.message} (${code})`
            : current.message;
        if (label.length > 0 && !parts.includes(label))
            parts.push(label);
        current = current.cause;
    }
    return parts.length === 0 ? String(error) : parts.join(' ← ');
}
/**
 * One sentence for the trap behind most "fetch failed" reports: a system proxy
 * (VPN accelerators, corporate MITM) is invisible to Node's fetch unless the
 * host process was started with `NODE_USE_ENV_PROXY=1` or `--use-env-proxy` —
 * a browser has no such rule, which is why GitHub opens fine and this still
 * fails.
 * @returns The sentence, or an empty string when no proxy is configured.
 */
function proxyHint() {
    if (envProxyOptedIn())
        return '';
    const configured = PROXY_ENV_VARS.filter(name => (process.env[name] ?? '').trim().length > 0);
    if (configured.length === 0)
        return '';
    return `${configured.join('/')} is set, but Node's fetch ignores proxy environment variables unless DSH itself ` +
        'was started with NODE_USE_ENV_PROXY=1 (or --use-env-proxy); without that, requests from DSH bypass the proxy.';
}
const OK_TTL_MS = 5 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;
const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 1500;
const MAX_RETRY_DELAY_MS = 3000;
const cache = new Map();
function rateLimitInfo(res) {
    const num = (key) => {
        const raw = res.headers.get(key);
        if (raw === null)
            return undefined;
        const value = Number(raw);
        return Number.isFinite(value) ? value : undefined;
    };
    const reset = num('x-ratelimit-reset');
    return {
        status: res.status,
        limit: num('x-ratelimit-limit'),
        remaining: num('x-ratelimit-remaining'),
        resetAt: reset === undefined ? undefined : new Date(reset * 1000).toISOString(),
        retryAfter: num('retry-after'),
    };
}
function describe(info, authenticated) {
    return [
        `limit=${info.limit ?? '?'}`,
        `remaining=${info.remaining ?? '?'}`,
        info.resetAt === undefined ? undefined : `resetAt=${info.resetAt}`,
        authenticated ? 'token=set' : 'token=none',
    ].filter((part) => part !== undefined).join(' ');
}
export async function searchGitHub(query, limit = 5, options = {}) {
    const key = query.toLowerCase().trim();
    const hit = cache.get(key);
    if (hit !== undefined && Date.now() - hit.at < (hit.error === undefined ? OK_TTL_MS : FAIL_TTL_MS)) {
        if (hit.error !== undefined)
            throw hit.error;
        return (hit.data ?? []).slice(0, limit);
    }
    const token = typeof options.token === 'string' && options.token.length > 0 ? options.token : undefined;
    const callerSignal = options.signal;
    const q = encodeURIComponent(`${query} topic:dsh-plugin`);
    const url = `https://api.github.com/search/repositories?q=${q}&per_page=${Math.min(limit * 2, 20)}`;
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'dsh-find-plugin' };
    if (token !== undefined)
        headers.authorization = `Bearer ${token}`;
    const signalFor = () => callerSignal === undefined ? AbortSignal.timeout(TIMEOUT_MS) : AbortSignal.any([callerSignal, AbortSignal.timeout(TIMEOUT_MS)]);
    let attempt = 0;
    for (;;) {
        let res;
        try {
            res = await fetch(url, { headers, signal: signalFor() });
        }
        catch (error) {
            if (attempt === 0 && callerSignal?.aborted !== true) {
                attempt += 1;
                await new Promise(resolvePromise => setTimeout(resolvePromise, RETRY_DELAY_MS));
                continue;
            }
            const hint = proxyHint();
            const wrapped = new Error(`GitHub search failed: ${describeFailure(error)}${hint === '' ? '' : `. ${hint}`}`);
            cache.set(key, { at: Date.now(), error: wrapped });
            throw wrapped;
        }
        if (res.ok) {
            const body = (await res.json());
            const data = (body.items ?? []).map(it => ({
                name: String(it.name ?? ''),
                owner: String(it.owner?.login ?? ''),
                url: String(it.html_url ?? ''),
                description: String(it.description ?? ''),
                stars: Number(it.stargazers_count ?? 0),
                pushed: String(it.pushed_at ?? ''),
                install: `dsh plugin --profile web add github:${String(it.full_name ?? '')}`,
            }));
            cache.set(key, { at: Date.now(), data });
            return data.slice(0, limit);
        }
        const info = rateLimitInfo(res);
        const limited = res.status === 403 || res.status === 429;
        if (limited && attempt === 0) {
            attempt += 1;
            const delay = info.retryAfter === undefined
                ? RETRY_DELAY_MS
                : Math.min(info.retryAfter * 1000, MAX_RETRY_DELAY_MS);
            await new Promise(resolvePromise => setTimeout(resolvePromise, delay));
            continue;
        }
        const detail = describe(info, token !== undefined);
        const error = limited
            ? new GitHubSearchRateLimited(`GitHub search rate limited (HTTP ${res.status}; ${detail}). ` +
                'Anonymous search allows 10 req/min per public IP and that quota is shared by every host ' +
                'behind the same egress IP; an authenticated GITHUB_TOKEN raises it to 30 req/min and is ' +
                'account-scoped.', info)
            : new Error(`GitHub search HTTP ${res.status}${detail === '' ? '' : ` (${detail})`}`);
        cache.set(key, { at: Date.now(), error });
        throw error;
    }
}
