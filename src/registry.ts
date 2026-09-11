/**
 * Registry access: the curated awesome-dsh-plugin list (~3400 entries, all with
 * bilingual descriptions). Cached in memory, on disk, and revalidated with a
 * conditional request.
 *
 * The list is a first-class fallback source, not just a description enricher, so
 * it must survive both restarts and an unreachable server:
 *
 *  1. disk cache at `<DSH_HOME>/cache/dsh-find-plugin/registry.json`, so a
 *     process restart does not re-download ~800KB gzip / 2.7MB JSON;
 *  2. `If-None-Match` / `If-Modified-Since` conditional requests — the server
 *     sends `ETag`/`Last-Modified` and answers 304 with no body, making refresh
 *     nearly free;
 *  3. fallback chain memory → disk cache → bundled snapshot. The bundled
 *     snapshot only has ~176 entries and ages with the release, while the disk
 *     cache holds the full ~3400, so offline quality depends on this order.
 *
 * `DSH_HOME` resolution mirrors `@deepseek-ai/dsh-home-paths` (explicit config →
 * `$DSH_HOME`, blank treated as unset → `~/.dsh`) inlined here to keep the
 * plugin dependency-free.
 */

import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface RegistryPlugin {
  name: string
  owner: string
  url: string
  category: string
  description: Record<string, string>
  install: string
  added: string
  /** Present in the live registry; used as a ranking tie-breaker. */
  stars?: number
}

export interface Registry {
  updated: string
  count: number
  categories: Record<string, Record<string, string>>
  plugins: RegistryPlugin[]
}

export type RegistrySource = 'live' | 'cache' | 'memory' | 'disk' | 'snapshot'

const REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json'
/** Refresh interval; after this the cached copy is revalidated (304 is free). */
const TTL_MS = 30 * 60 * 1000
const TIMEOUT_MS = 10000
const CACHE_VERSION = 1

interface CacheEntry {
  at: number
  data: Registry
  etag?: string
  lastModified?: string
}

let cache: CacheEntry | null = null

function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return resolve(fromEnv.trim())
  return join(homedir(), '.dsh')
}

function cacheDir(): string {
  return join(dshHome(), 'cache', 'dsh-find-plugin')
}

function cachePath(): string {
  return join(cacheDir(), 'registry.json')
}

function snapshotPath(): string {
  return fileURLToPath(new URL('../data/registry-snapshot.json', import.meta.url))
}

function isRegistry(value: unknown): value is Registry {
  if (value === null || typeof value !== 'object') return false
  const plugins = (value as Registry).plugins
  return Array.isArray(plugins) && plugins.length > 0
}

function readSnapshot(): Registry {
  return JSON.parse(readFileSync(snapshotPath(), 'utf8')) as Registry
}

async function readDiskCache(): Promise<{ registry: Registry; at: number; etag?: string; lastModified?: string } | undefined> {
  try {
    const parsed = JSON.parse(await readFile(cachePath(), 'utf8')) as {
      version?: number
      fetchedAt?: string
      etag?: string
      lastModified?: string
      registry?: unknown
    }
    if (parsed?.version !== CACHE_VERSION || !isRegistry(parsed.registry)) return undefined
    return {
      registry: parsed.registry,
      at: Date.parse(parsed.fetchedAt ?? '') || 0,
      etag: typeof parsed.etag === 'string' ? parsed.etag : undefined,
      lastModified: typeof parsed.lastModified === 'string' ? parsed.lastModified : undefined,
    }
  } catch {
    return undefined
  }
}

async function writeDiskCache(registry: Registry, etag?: string, lastModified?: string): Promise<void> {
  try {
    await mkdir(cacheDir(), { recursive: true })
    const path = cachePath()
    const temp = `${path}.tmp-${process.pid}`
    await writeFile(temp, JSON.stringify({
      version: CACHE_VERSION,
      fetchedAt: new Date().toISOString(),
      etag,
      lastModified,
      registry,
    }), 'utf8')
    await rename(temp, path)
  } catch {
    // A cache write failure must not break the lookup; the next call refetches.
  }
}

export async function loadRegistry(): Promise<{ registry: Registry; source: RegistrySource }> {
  if (cache !== null && Date.now() - cache.at < TTL_MS) return { registry: cache.data, source: 'memory' }

  const disk = await readDiskCache()
  const etag = cache?.etag ?? disk?.etag
  const lastModified = cache?.lastModified ?? disk?.lastModified
  const headers: Record<string, string> = { accept: 'application/json', 'user-agent': 'dsh-find-plugin' }
  if (etag !== undefined) headers['if-none-match'] = etag
  if (lastModified !== undefined) headers['if-modified-since'] = lastModified

  try {
    const res = await fetch(REGISTRY_URL, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 304) {
      const data = cache?.data ?? disk?.registry
      if (isRegistry(data)) {
        cache = { at: Date.now(), data, etag, lastModified }
        return { registry: data, source: 'cache' }
      }
    } else if (res.ok) {
      const data = (await res.json()) as Registry
      if (!isRegistry(data)) throw new Error('empty registry')
      const nextEtag = res.headers.get('etag') ?? undefined
      const nextLastModified = res.headers.get('last-modified') ?? undefined
      cache = { at: Date.now(), data, etag: nextEtag, lastModified: nextLastModified }
      await writeDiskCache(data, nextEtag, nextLastModified)
      return { registry: data, source: 'live' }
    } else {
      throw new Error(`HTTP ${res.status}`)
    }
  } catch {
    // Network/parse failure — fall through to the fallback chain.
  }

  if (disk !== undefined) return { registry: disk.registry, source: 'disk' }
  if (cache !== null) return { registry: cache.data, source: 'memory' }
  return { registry: readSnapshot(), source: 'snapshot' }
}
