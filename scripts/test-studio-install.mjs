#!/usr/bin/env node
/**
 * Install smoke test. Builds + packs the plugin, then installs the resulting
 * tarball into a throwaway Sanity 5 / React 19 Studio (the only major we
 * support) with **strict** peer deps. Fails if the install errors or emits
 * peer-dependency warnings — i.e. it verifies a real consumer can `npm install`
 * the published package cleanly.
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

// A minimal but realistic Sanity 5 Studio: the deps a real `sanity` studio has,
// nothing padded — so a genuinely missing peer would surface.
const STUDIO = {
  name: 'Sanity 5 / React 19',
  deps: {
    react: '^19.0.0',
    'react-dom': '^19.0.0',
    sanity: '^5.0.0',
    'styled-components': '^6.1.0',
  },
}

function run(cmd, opts = {}) {
  return execSync(cmd, {encoding: 'utf8', stdio: 'pipe', ...opts})
}

function findTarball() {
  return readdirSync(root)
    .filter((f) => f.startsWith(`${PKG}-`) && f.endsWith('.tgz'))
    .map((f) => path.join(root, f))
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

  if (existsSync(testDir)) rmSync(testDir, {recursive: true})
  mkdirSync(testDir, {recursive: true})

  const pkg = {
    name: 'test-studio',
    private: true,
    dependencies: {...STUDIO.deps, [PKG]: `file:${tarball}`},
  }
  writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(pkg, null, 2))

  console.log(`Installing into a throwaway ${STUDIO.name} Studio (strict peer deps)…`)
  let ok = false
  let out = ''
  try {
    out = run('npm install 2>&1', {cwd: testDir})
    ok = true
  } catch (e) {
    out = e.stdout || e.stderr || e.message || ''
  }

  const hasPeerProblem = /unmet peer|ERESOLVE|could not resolve|peer dep/i.test(out)

  // Tidy up regardless of outcome.
  rmSync(testDir, {recursive: true, force: true})
  rmSync(tarball, {force: true})

  if (!ok) {
    console.error(`\n✗ ${STUDIO.name}: install FAILED\n`)
    console.error(out.slice(-2500))
    process.exit(1)
  }
  if (hasPeerProblem) {
    console.error(`\n✗ ${STUDIO.name}: installed, but with peer-dependency problems\n`)
    const m = out.match(/.*(?:unmet peer|ERESOLVE|could not resolve|peer dep).*/i)
    if (m) console.error(m[0].slice(0, 800))
    process.exit(1)
  }
  console.log(`\n✓ ${STUDIO.name}: installs cleanly, no peer-dependency problems`)
  process.exit(0)
}

main()
