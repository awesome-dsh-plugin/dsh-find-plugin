/**
 * Guard against the failure mode that has broken installs three times (#4, #12,
 * #13): the `@deepseek-ai/dsh-tools` peer range silently stops matching the
 * hosts that actually exist.
 *
 * Every DSH release is a prerelease, and node-semver only lets a prerelease
 * satisfy a range when a comparator in that range carries a prerelease on the
 * *same* major.minor.patch. So a range pinned to one host line — `^0.1.0-rc.6`
 * — matches `0.1.0-rc.x` and nothing else, while hosts ship lockstep versions
 * (`dsh@0.1.5-rc.1` → `dsh-base` → `dsh-tools@^0.1.5-rc.1`).
 *
 * Two things make this check able to catch a host line on the day it ships:
 *
 *  - **It judges with the host's own semver semantics.** The DSH host decides
 *    plugin compatibility with `semver.satisfies(version, range, {
 *    includePrerelease: true })`. Judging with default semver instead is
 *    *stricter* than the host, so a range that works on the host can still be
 *    reported here as uncovered — and, worse, a range the host accepts can be
 *    rejected by this script, which would block the very fix the check exists
 *    to demand. The two must agree.
 *
 *  - **It reads every published host line, not only the `latest`/`next`
 *    dist-tags.** A host line can ship and be superseded before the next
 *    release of this plugin (#13 was exactly that: `dsh-tools@0.2.0-rc.1`
 *    published three days *after* `0.4.0`). Dist-tags describe what is
 *    *currently* promoted, not what a user can be running.
 *
 * Offline (no registry) is not a failure: the check reports skipped and exits 0.
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const semver = require('semver')

/** The DSH host resolves plugin peers with prereleases included. */
export const HOST_SEMVER_OPTIONS = { includePrerelease: true }

/**
 * The oldest host line this plugin claims to support.
 *
 * The compat floor is the devDependency (see the `newest-host` CI job): the
 * plugin is developed and tested against that line, so host lines older than
 * it are out of scope and are not required to satisfy the peer range.
 *
 * @param pkg - the plugin's package manifest.
 * @returns The floor version, or undefined when it cannot be derived.
 */
export function compatFloor(pkg) {
  const devRange = pkg.devDependencies?.['@deepseek-ai/dsh-tools']
  if (typeof devRange !== 'string') return undefined
  return semver.minVersion(devRange)?.version
}

/** `npm` is a shell script on POSIX but a `.cmd` shim on Windows. */
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/**
 * The published host lines a peer range must accept.
 *
 * `@deepseek-ai/dsh` and `@deepseek-ai/dsh-tools` publish lockstep versions,
 * so a published `dsh` version names both the host line and the `dsh-tools`
 * version that line installs — and the host compares its own runtime version
 * against the plugin's `@deepseek-ai/dsh-tools` peer range. Checking the `dsh`
 * version against that range is therefore the host's own rule.
 *
 * Host lines older than the compat floor are out of scope.
 *
 * @param peerRange - the declared `@deepseek-ai/dsh-tools` peer range.
 * @param hostVersions - every published `@deepseek-ai/dsh` version.
 * @param floor - the oldest host line in scope.
 * @returns The host lines the range does not accept, oldest first.
 */
export function uncoveredHostLines(peerRange, hostVersions, floor) {
  return hostVersions
    .filter(version => semver.gte(version, floor))
    .filter(version => !semver.satisfies(version, peerRange, HOST_SEMVER_OPTIONS))
    .sort(semver.compare)
}

/**
 * The `dsh-tools` versions with no host line of their own.
 *
 * A `dsh-tools` release that no `dsh` release shipped alongside is still a
 * version a user could resolve, so it is checked too. Versions older than the
 * compat floor are out of scope.
 *
 * @param toolVersions - every published `@deepseek-ai/dsh-tools` version.
 * @param hostVersions - every published `@deepseek-ai/dsh` version.
 * @param floor - the oldest host line in scope.
 * @returns The orphaned `dsh-tools` versions, oldest first.
 */
export function orphanToolVersions(toolVersions, hostVersions, floor) {
  const hosts = new Set(hostVersions)
  return toolVersions
    .filter(version => !hosts.has(version) && semver.gte(version, floor))
    .sort(semver.compare)
}

async function npmView(spec, field) {
  const args = ['view', spec, ...(field === undefined ? [] : [field]), '--json']
  // `shell` is required on Windows: `npm.cmd` is not directly executable by
  // `execFile` without it.
  const { stdout } = await run(NPM_COMMAND, args, {
    timeout: 60_000,
    ...(process.platform === 'win32' ? { shell: true } : {}),
  })
  return JSON.parse(stdout)
}

/** Every published host line, or undefined when offline. */
async function publishedHostLines() {
  try {
    const tags = await npmView('@deepseek-ai/dsh', 'dist-tags')
    const versions = await npmView('@deepseek-ai/dsh', 'versions')
    const toolVersions = await npmView('@deepseek-ai/dsh-tools', 'versions')
    return { tags, versions, toolVersions }
  } catch (error) {
    console.log(`check-peer-range: skipped — registry unavailable (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`)
    return undefined
  }
}

async function main() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const peerRange = pkg.peerDependencies?.['@deepseek-ai/dsh-tools']
  if (typeof peerRange !== 'string') {
    console.error('check-peer-range: package.json declares no @deepseek-ai/dsh-tools peer range')
    process.exit(1)
  }

  const published = await publishedHostLines()
  if (published === undefined) process.exit(0)

  const { tags, versions, toolVersions } = published
  const floor = compatFloor(pkg)
  if (floor === undefined) {
    console.error('check-peer-range: package.json declares no @deepseek-ai/dsh-tools devDependency to derive the compat floor from')
    process.exit(1)
  }

  console.log(`peer range: ${peerRange}`)
  console.log(`compat floor: ${floor}`)

  const failures = []

  const uncovered = uncoveredHostLines(peerRange, versions, floor)
  for (const version of versions.filter(v => semver.gte(v, floor))) {
    const promoted = Object.entries(tags).filter(([, tagVersion]) => tagVersion === version).map(([tag]) => tag)
    const label = promoted.length > 0 ? ` (${promoted.join(', ')})` : ''
    console.log(`  dsh@${version}${label}: ${uncovered.includes(version) ? 'NOT COVERED' : 'OK'}`)
  }
  for (const version of uncovered) failures.push(`dsh@${version}`)

  const orphans = orphanToolVersions(toolVersions, versions, floor)
  for (const version of orphans) {
    const ok = semver.satisfies(version, peerRange, HOST_SEMVER_OPTIONS)
    console.log(`  dsh-tools ${version} (no host line): ${ok ? 'OK' : 'NOT COVERED'}`)
    if (!ok) failures.push(`dsh-tools ${version}`)
  }

  if (failures.length > 0) {
    console.error(
      '\ncheck-peer-range: the declared peer range does not accept a current host line:\n' +
      failures.map(line => `  - ${line}`).join('\n') +
      '\nAdd the missing host line to `peerDependencies["@deepseek-ai/dsh-tools"]` in package.json.',
    )
    process.exit(1)
  }
}

// Only run the check when invoked directly; the pure helpers above are
// imported by the test suite. `pathToFileURL` is the only reliable way to
// compare against `import.meta.url` — building `file://` by hand mishandles
// Windows drive letters and backslashes, and a guard that silently fails to
// match would turn this gate into a silent pass.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
