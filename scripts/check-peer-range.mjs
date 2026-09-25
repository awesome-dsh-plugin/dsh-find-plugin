/**
 * Guard against the failure mode that has broken installs twice (#4, #12): the
 * `@deepseek-ai/dsh-tools` peer range silently stops matching the hosts that
 * actually exist.
 *
 * Every DSH release is a prerelease, and node-semver only lets a prerelease
 * satisfy a range when a comparator in that range carries a prerelease on the
 * *same* major.minor.patch. So a range pinned to one host line — `^0.1.0-rc.6`
 * — matches `0.1.0-rc.x` and nothing else, while hosts ship lockstep versions
 * (`dsh@0.1.5-rc.1` → `dsh-base` → `dsh-tools@^0.1.5-rc.1`).
 *
 * This script resolves each current host line from the registry, finds the
 * `dsh-tools` version that line installs, and fails when the declared peer
 * range does not accept it. Run it in CI so a new host line is caught the day
 * it ships rather than in a user's bug report.
 *
 * Offline (no registry) is not a failure: the check reports skipped and exits 0.
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const semver = require('semver')

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const peerRange = pkg.peerDependencies?.['@deepseek-ai/dsh-tools']
if (typeof peerRange !== 'string') {
  console.error('check-peer-range: package.json declares no @deepseek-ai/dsh-tools peer range')
  process.exit(1)
}

async function npmView(spec, field) {
  const args = ['view', spec, ...(field === undefined ? [] : [field]), '--json']
  const { stdout } = await run('npm', args, { timeout: 60_000 })
  return JSON.parse(stdout)
}

/** One dsh-tools version per current host line, or undefined when offline. */
async function hostLines() {
  try {
    const tags = await npmView('@deepseek-ai/dsh', 'dist-tags')
    const versions = await npmView('@deepseek-ai/dsh-tools', 'versions')
    const lines = []
    for (const tag of ['latest', 'next']) {
      const dshVersion = tags[tag]
      if (typeof dshVersion !== 'string' || lines.some(line => line.dshVersion === dshVersion)) continue
      // The host packages are lockstep with the CLI, so dsh-base names the
      // dsh-tools range this line installs.
      const range = await npmView(`@deepseek-ai/dsh-base@${dshVersion}`, 'dependencies.@deepseek-ai/dsh-tools')
      const resolved = semver.maxSatisfying(versions, range)
      lines.push({ tag, dshVersion, range: String(range), resolved })
    }
    return lines
  } catch (error) {
    console.log(`check-peer-range: skipped — registry unavailable (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`)
    return undefined
  }
}

const lines = await hostLines()
if (lines === undefined) process.exit(0)

const failures = []
console.log(`peer range: ${peerRange}`)
for (const { tag, dshVersion, range, resolved } of lines) {
  if (resolved === null || resolved === undefined) {
    console.log(`  dsh@${tag} (${dshVersion}): dsh-tools ${range} resolves to nothing published — skipped`)
    continue
  }
  const ok = semver.satisfies(resolved, peerRange)
  console.log(`  dsh@${tag} (${dshVersion}): dsh-tools ${resolved}${ok ? ' OK' : ' NOT COVERED'}`)
  if (!ok) failures.push(`${dshVersion} → dsh-tools ${resolved}`)
}

if (failures.length > 0) {
  console.error(
    '\ncheck-peer-range: the declared peer range does not accept a current host line:\n' +
    failures.map(line => `  - ${line}`).join('\n') +
    '\nAdd the missing host line to `peerDependencies["@deepseek-ai/dsh-tools"]` in package.json.',
  )
  process.exit(1)
}
