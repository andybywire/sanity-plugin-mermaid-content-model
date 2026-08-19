#!/usr/bin/env node
/**
 * Install smoke test. Builds + packs the plugin, then installs the resulting
 * tarball into a throwaway Studio for **every supported Sanity major**, on
 * React 19, with **strict** peer deps. Fails if any install errors or emits
 * peer-dependency warnings — i.e. it verifies a real consumer can
 * `npm install` the published package cleanly on each major we claim to support.
 *
 * It also asserts there is exactly **one copy of `@sanity/ui`** in the installed
 * tree, and that the plugin and the Studio resolve the *same* one. This is the
 * check that a plugin dev Studio structurally cannot make: in a pnpm workspace
 * (and in Vite's dev dep-optimizer) a single bare specifier is shared app-wide,
 * so a duplicate-major bug is invisible locally while breaking real installs.
 * See docs/sanity-ui-v4-migration.md. Declaring `@sanity/ui` as a regular
 * dependency rather than a peer is what reintroduces that second copy, so this
 * guard exists to catch that regression at the only layer where it shows up.
 *
 * Scope: dependency resolution only. It does **not** assert Node `engines`
 * (Sanity 6 requires Node >=22.12) — `npm install` only warns on EBADENGINE
 * unless engine-strict is set, and that floor is the consumer's chosen Sanity
 * major's concern, not the plugin's. It also doesn't run the Studio: this
 * catches the *shape* of the install, not runtime behaviour.
 *
 * Uses npm (not pnpm) for the install so it mirrors the most common consumer
 * setup. Run from the repo root:  node scripts/test-studio-install.mjs
 * (or: pnpm test:studio-install)
 */
import {execSync} from 'node:child_process'
import {existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testDir = path.join(root, 'tmp-studio-install-test')
const PKG = 'sanity-plugin-mermaid-content-model'

// Minimal but realistic Studios — one per supported Sanity major — carrying the
// deps a real `sanity` studio has and nothing padded, so a genuinely missing
// peer surfaces.
//
// Studio 6.10 is the floor: it's where `sanity` moved to `@sanity/ui` v4, which
// this plugin requires from the host. Sanity 5 and Studio 6.0–6.9 ship UI v3 and
// are served by the 1.x line, so they are deliberately not tested here — adding
// them back would assert support we don't claim.
const STUDIOS = [
  {
    name: 'Sanity 6.10 / React 19',
    deps: {
      react: '^19.2.0',
      'react-dom': '^19.2.0',
      sanity: '^6.10.0',
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

// Every @sanity/ui copy in an installed tree, including ones nested under a
// package's own node_modules — which is exactly where a mis-declared dependency
// puts its private second copy.
function findUiCopies(nodeModulesDir, found = []) {
  const direct = path.join(nodeModulesDir, '@sanity', 'ui', 'package.json')
  if (existsSync(direct)) found.push(direct)

  let entries
  try {
    entries = readdirSync(nodeModulesDir, {withFileTypes: true})
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.bin') continue
    // Scoped packages nest one level deeper than unscoped ones.
    const pkgDirs = entry.name.startsWith('@')
      ? readdirSync(path.join(nodeModulesDir, entry.name), {withFileTypes: true})
          .filter((d) => d.isDirectory())
          .map((d) => path.join(nodeModulesDir, entry.name, d.name))
      : [path.join(nodeModulesDir, entry.name)]
    for (const dir of pkgDirs) {
      const nested = path.join(dir, 'node_modules')
      if (existsSync(nested)) findUiCopies(nested, found)
    }
  }
  return found
}

// Two copies of @sanity/ui means two React context instances, so the plugin's
// hooks can't see the Studio's providers — a runtime crash that no amount of
// local dev-Studio testing surfaces. Assert one copy, and that the plugin and
// the Studio actually resolve the same file.
function checkSingleUiCopy(dir) {
  const nm = path.join(dir, 'node_modules')
  const copies = findUiCopies(nm)
  const byVersion = new Map()
  for (const p of copies) {
    const {version} = createRequire(p)(p)
    byVersion.set(version, path.relative(dir, p))
  }

  if (byVersion.size !== 1) {
    return {
      ok: false,
      detail:
        `expected exactly 1 copy of @sanity/ui, found ${byVersion.size}:\n` +
        [...byVersion].map(([v, p]) => `            ${v}  ${p}`).join('\n'),
    }
  }

  // Same version could still be two installed copies; compare resolved paths.
  let pluginUi, studioUi
  try {
    pluginUi = realpathSync(
      createRequire(path.join(nm, PKG, 'package.json')).resolve('@sanity/ui/package.json'),
    )
    studioUi = realpathSync(
      createRequire(path.join(nm, 'sanity', 'package.json')).resolve('@sanity/ui/package.json'),
    )
  } catch (e) {
    return {ok: false, detail: `could not resolve @sanity/ui from both sides: ${e.message}`}
  }
  if (pluginUi !== studioUi) {
    return {
      ok: false,
      detail:
        `plugin and Studio resolve different @sanity/ui installs:\n` +
        `            plugin: ${path.relative(dir, pluginUi)}\n` +
        `            studio: ${path.relative(dir, studioUi)}`,
    }
  }
  return {
    ok: true,
    detail: `single @sanity/ui (${[...byVersion.keys()][0]}), shared by plugin and Studio`,
  }
}

// Install the packed plugin into a throwaway studio and report whether it
// installed cleanly with no peer-dependency problems, and with a single shared
// @sanity/ui. Cleans up its testDir on every path.
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
  // Inspect the tree before tearing it down; only meaningful if install worked.
  const ui = ok ? checkSingleUiCopy(testDir) : null
  rmSync(testDir, {recursive: true, force: true})
  return {ok, hasPeerProblem, ui, out}
}

function reportStudio(studio, result) {
  const {ok, hasPeerProblem, ui, out} = result
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
  if (ui && !ui.ok) {
    console.error(`\n✗ ${studio.name}: duplicate @sanity/ui in the installed tree`)
    console.error(`            ${ui.detail}`)
    console.error(
      `            Two copies mean two React contexts: the plugin's hooks won't see\n` +
        `            the Studio's providers. @sanity/ui must stay a peer dependency.`,
    )
    return false
  }
  console.log(`✓ ${studio.name}: installs cleanly, no peer-dependency problems`)
  if (ui) console.log(`  └─ ${ui.detail}`)
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
