/**
 * The peer-range guard that keeps this plugin installable on the host lines it
 * claims to support.
 *
 * Two regressions are covered, both of which silently let a broken range ship:
 *
 *  - **Judging with the wrong semver semantics.** The DSH host decides plugin
 *    compatibility with `includePrerelease: true`. A check that judges with
 *    default semver is *stricter* than the host, so it can reject a range the
 *    host accepts — blocking the very fix it exists to demand (#13).
 *
 *  - **Judging only the promoted dist-tags.** A host line can ship and be
 *    superseded before the next plugin release, so the dist-tags are not the
 *    set of hosts a user can be running (#13 was exactly that).
 *
 * The pure helpers are imported from the script so they can be exercised
 * without a registry; the live check itself runs in CI.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  compatFloor,
  orphanToolVersions,
  uncoveredHostLines,
} from '../scripts/check-peer-range.mjs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const peerRange = pkg.peerDependencies['@deepseek-ai/dsh-tools']

/** The host lines published at the time this test was written. */
const HOST_LINES = [
  '0.1.0-rc.6', '0.1.0-rc.7', '0.1.0-rc.8',
  '0.1.1-rc.1', '0.1.1-rc.2',
  '0.1.2-alpha.2', '0.1.2-alpha.3', '0.1.2-alpha.4', '0.1.2-alpha.5', '0.1.2-rc.1',
  '0.1.3-alpha.2',
  '0.1.5-alpha.1', '0.1.5-alpha.2', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.5-rc.3',
  '0.1.6-alpha.1', '0.1.6-alpha.2',
  '0.1.7-alpha.1', '0.1.7-alpha.2', '0.1.7-rc.1', '0.1.7-rc.2',
  '0.2.0-rc.1', '0.2.0-rc.2',
  '0.2.1-alpha.1', '0.2.1-alpha.2', '0.2.1-alpha.3', '0.2.1-alpha.4', '0.2.1-alpha.5',
  '0.2.1-rc.1', '0.2.1-rc.2',
]

test('the declared peer range accepts every published host line', () => {
  const floor = compatFloor(pkg)
  assert.deepEqual(uncoveredHostLines(peerRange, HOST_LINES, floor), [])
})

test('the peer range covers the 0.2.x host lines that rejected the bundle', () => {
  // The 0.4.0 range stopped at ^0.1.7-alpha.1, so every 0.2.x host rejected
  // the bundle outright (#13, #14, and the market's own installer in #15-#28).
  const floor = compatFloor(pkg)
  const uncovered = uncoveredHostLines(peerRange, HOST_LINES, floor)
  assert.deepEqual(
    uncovered.filter(version => version.startsWith('0.2.')),
    [],
    `uncovered 0.2.x host lines: ${uncovered.join(', ')}`,
  )
})

test('a range pinned to the 0.1.x line reports the 0.2.x lines as uncovered', () => {
  const pinned = '^0.1.0-rc.6 || ^0.1.7-alpha.1'
  const floor = compatFloor(pkg)
  const uncovered = uncoveredHostLines(pinned, HOST_LINES, floor)
  assert.ok(uncovered.includes('0.2.1-rc.2'), 'the current host line must be reported')
  assert.ok(uncovered.includes('0.2.0-rc.1'), 'the first 0.2.x line must be reported')
  assert.ok(!uncovered.includes('0.1.7-rc.2'), 'the 0.1.x lines stay covered')
})

test('host lines older than the compat floor are out of scope', () => {
  const floor = compatFloor(pkg)
  assert.equal(floor, '0.1.0-rc.6')
  const uncovered = uncoveredHostLines(peerRange, ['0.1.0-rc.2', '0.1.0-rc.3'], floor)
  assert.deepEqual(uncovered, [])
})

test('a dsh-tools release with no host line of its own is still checked', () => {
  const floor = compatFloor(pkg)
  // 0.0.1-rc.3 is a dsh-tools release with no matching dsh release.
  assert.deepEqual(orphanToolVersions(['0.0.1-rc.3'], HOST_LINES, floor), [])
  const orphan = orphanToolVersions(['0.0.1-rc.3', '0.9.9-rc.1'], HOST_LINES, floor)
  assert.deepEqual(orphan, ['0.9.9-rc.1'])
})

test('the compat floor is derived from the devDependency', () => {
  assert.equal(compatFloor(pkg), '0.1.0-rc.6')
  assert.equal(compatFloor({}), undefined)
  assert.equal(compatFloor({ devDependencies: { '@deepseek-ai/dsh-tools': 5 } }), undefined)
})
