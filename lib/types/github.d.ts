/**
 * Community tier: live GitHub search over the public `dsh-plugin` topic.
 * These results are NOT curated — callers must label them as unverified.
 * Unauthenticated search allows 10 req/min; a per-query cache keeps a local
 * tool well under that.
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
export declare function searchGitHub(query: string, limit?: number): Promise<CommunityPlugin[]>;
