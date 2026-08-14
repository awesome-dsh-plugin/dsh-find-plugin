/**
 * Zero-dependency scoring over the registry: token matches against name,
 * owner, category, and both description languages. Deliberately simple —
 * ranking candidates for an agent, not building a search engine.
 */

import type { Registry, RegistryPlugin } from './registry.ts'

export interface Match extends RegistryPlugin {
  score: number
}

function tokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,，、/|·]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
}

export function searchRegistry(registry: Registry, query: string, category?: string, limit = 5): Match[] {
  const qs = tokens(query)
  const results: Match[] = []
  for (const p of registry.plugins) {
    if (category && p.category !== category) continue
    const name = p.name.toLowerCase()
    const owner = p.owner.toLowerCase()
    const descs = Object.values(p.description).map(d => d.toLowerCase())
    let score = 0
    for (const t of qs) {
      if (name === t) score += 10
      else if (name.includes(t)) score += 5
      if (owner.includes(t)) score += 1
      if (p.category === t) score += 3
      for (const d of descs) {
        if (d.includes(t)) score += 2
      }
    }
    // whole-query phrase bonus against descriptions
    const phrase = query.toLowerCase().trim()
    if (phrase.length > 1) {
      for (const d of descs) if (d.includes(phrase)) score += 4
    }
    if (score > 0) results.push({ ...p, score })
  }
  results.sort((a, b) => b.score - a.score || (a.added < b.added ? 1 : -1))
  return results.slice(0, Math.max(1, Math.min(limit, 20)))
}
