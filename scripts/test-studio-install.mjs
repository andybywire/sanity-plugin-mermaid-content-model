#!/usr/bin/env node
/**
 * Install smoke test. Builds + packs the plugin, then installs the resulting
 * tarball into a throwaway Studio for **every supported Sanity major** (5 and
 * 6), each on React 19, with **strict** peer deps. Fails if any install errors
 * or emits peer-dependency warnings — i.e. it verifies a real consumer can
 * `npm install` the published package cleanly on each major we claim to support.
 *
 * Scope: peer-dependency resolution only. It does **not** assert Node `engines`
 * (Sanity 6 requires Node >=22.12) — `npm install` only warns on EBADENGINE
 * unless engine-strict is set, and that floor is the consumer's chosen Sanity
 * major's concern, not the plugin's.
 *
 * Uses npm (not pnpm) for the install so it mirrors the most common consumer
 * setup. Run from the repo root:  node scripts/test-studio-install.mjs
 * (or: pnpm test:studio-install)
 */
import {execSync} from 'node:child_process'
import {existsSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testDir = path.join(root, 'tmp-studio-install-test')
const PKG = 'sanity-plugin-mermaid-content-model'

// Minimal but realistic Studios — one per supported Sanity major — carrying the
// deps a real `sanity` studio has and nothing padded, so a genuinely missing
// peer surfaces. Both majors require React 19, so the only axis that varies is
// the `sanity` range.
const STUDIOS = [
  {
    name: 'Sanity 5 / React 19',
    deps: {
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      sanity: '^5.0.0',
      'styled-components': '^6.1.0',
    },
  },
  {
    name: 'Sanity 6 / React 19',
    deps: {
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      sanity: '^6.0.0',
      'styled-components': '^6.1.0',
    },
  },
]

function run(cmd, opts = {}) {
  return execSync(cmd, {encoding: 'utf8', stdio: 'pipe', ...opts})
}

function findTarball() {
  return readdirSync(root)
    .filter((f) => f.startsWith(`${PKG}-`) && f.endsWith('.tgz'))
    .map((f) => path.join(root, f))
}

// Install the packed plugin into a throwaway studio and report whether it
// installed cleanly with no peer-dependency problems. Cleans up its testDir
// on every path.
function installStudio(studio, tarball) {
  if (existsSync(testDir)) rmSync(testDir, {recursive: true})
  mkdirSync(testDir, {recursive: true})

  const pkg = {
    name: 'test-studio',
    private: true,
    dependencies: {...studio.deps, [PKG]: `file:${tarball}`},
  }
  writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(pkg, null, 2))

  console.log(`\nInstalling into a throwaway ${studio.name} Studio (strict peer deps)…`)
  let ok = false
  let out = ''
  try {
    out = run('npm install 2>&1', {cwd: testDir})
    ok = true
  } catch (e) {
    out = e.stdout || e.stderr || e.message || ''
  }

  const hasPeerProblem = /unmet peer|ERESOLVE|could not resolve|peer dep/i.test(out)
  rmSync(testDir, {recursive: true, force: true})
  return {ok, hasPeerProblem, out}
}

function reportStudio(studio, result) {
  const {ok, hasPeerProblem, out} = result
  if (!ok) {
    console.error(`\n✗ ${studio.name}: install FAILED\n`)
    console.error(out.slice(-2500))
    return false
  }
  if (hasPeerProblem) {
    console.error(`\n✗ ${studio.name}: installed, but with peer-dependency problems\n`)
    const m = out.match(/.*(?:unmet peer|ERESOLVE|could not resolve|peer dep).*/i)
    if (m) console.error(m[0].slice(0, 800))
    return false
  }
  console.log(`✓ ${studio.name}: installs cleanly, no peer-dependency problems`)
  return true
}

function main() {
  // Clean any stale tarball, build, and pack a fresh one into the repo root.
  findTarball().forEach((f) => rmSync(f, {force: true}))
  console.log('Building + packing the plugin…')
  run('pnpm build', {cwd: root})
  run('pnpm pack --pack-destination .', {cwd: root})

  const tarballs = findTarball()
  if (tarballs.length !== 1) {
    console.error(`Expected exactly one ${PKG}-*.tgz in repo root, found ${tarballs.length}.`)
    process.exit(1)
  }
  const tarball = tarballs[0]
  console.log(`Tarball: ${path.basename(tarball)}`)

  // Run every studio (don't short-circuit) so one failure still reports the
  // status of the others; tidy up the shared tarball regardless of outcome.
  const failures = []
  try {
    for (const studio of STUDIOS) {
      if (!reportStudio(studio, installStudio(studio, tarball))) failures.push(studio.name)
    }
  } finally {
    rmSync(tarball, {force: true})
  }

  if (failures.length) {
    console.error(
      `\n✗ ${failures.length} of ${STUDIOS.length} studios failed: ${failures.join(', ')}`,
    )
    process.exit(1)
  }
  console.log(`\n✓ All ${STUDIOS.length} studios install cleanly, no peer-dependency problems`)
  process.exit(0)
}

main()
