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
    name: string;
    owner: string;
    url: string;
    description: string;
    stars: number;
    pushed: string;
    install: string;
}
export interface GitHubRateLimitInfo {
    status: number;
    limit?: number;
    remaining?: number;
    resetAt?: string;
    retryAfter?: number;
}
export interface SearchGitHubOptions {
    /** GitHub PAT. Without it the anonymous 10 req/min/IP quota applies. */
    token?: string;
    /** Caller cancellation (merged with the per-attempt timeout). */
    signal?: AbortSignal;
}
/** Thrown when GitHub reports rate limiting, so callers can fall back. */
export declare class GitHubSearchRateLimited extends Error {
    readonly info: GitHubRateLimitInfo;
    constructor(message: string, info: GitHubRateLimitInfo);
}
export declare function searchGitHub(query: string, limit?: number, options?: SearchGitHubOptions): Promise<CommunityPlugin[]>;
