#!/usr/bin/env node
/**
 * Install smoke test. Builds + packs the plugin, then installs the resulting
 * tarball into a throwaway Studio for **every supported Sanity major**, on
 * React 19, with **strict** peer deps. Fails if any install errors or emits
 * peer-dependency warnings — i.e. it verifies a real consumer can
 * `npm install` the published package cleanly on each major we claim to support.
 *
 * It also asserts that the plugin and the Studio resolve the **same** copy of the
 * packages the host owns (`@sanity/ui`, `@sanity/icons`), and that the plugin
 * carries no private copy of its own. This is the check a plugin dev Studio
 * structurally cannot make: in a pnpm workspace (and in Vite's dev dep-optimizer)
 * a single bare specifier is shared app-wide, so a duplicate-major bug is
 * invisible locally while breaking real installs. See
 * docs/sanity-ui-v4-migration.md. Declaring `@sanity/ui` as a regular dependency
 * rather than a peer is what reintroduces that second copy, so this guard exists
 * to catch that regression at the only layer where it shows up.
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

// Minimal but realistic Studios — carrying the deps a real `sanity` studio has
// and nothing padded, so a genuinely missing peer surfaces.
//
// Sanity **6.9.2** is the floor: that exact release is where `sanity` moved its
// `@sanity/ui` dependency from v3 to v4 (6.9.1 pulls ^3.5.1, 6.9.2 pulls ^4.0.1).
// Sanity v5 and Studio 6.0–6.9.1 ship UI v3 and are served by the 1.x line, so
// they're deliberately not tested — that would assert support we don't claim.
//
// Two legs, because they fail in different ways:
//   - pinned 6.9.2 proves the *declared* floor actually works, not just current.
//   - ^6.9.2 resolves the newest 6.x, so the day Sanity ships a Studio on a UI
//     major we don't range over, this leg goes red on its own.
const STUDIOS = [
  {
    name: 'Sanity 6.9.2 (declared floor) / React 19',
    deps: {
      react: '^19.2.0',
      'react-dom': '^19.2.0',
      sanity: '6.9.2',
      'styled-components': '^6.1.0',
    },
  },
  {
    name: 'Sanity ^6.9.2 (newest 6.x) / React 19',
    deps: {
      react: '^19.2.0',
      'react-dom': '^19.2.0',
      sanity: '^6.9.2',
      'styled-components': '^6.1.0',
    },
  },
]

// Packages the host Studio must own, and that the plugin must therefore share
// rather than carry itself. @sanity/ui holds React context (ThemeProvider,
// LayerProvider, ToastProvider), so a private copy splits it and the plugin's
// hooks stop seeing the Studio's providers. @sanity/icons holds no context, so a
// private copy is dead weight rather than a crash — but it still means our range
// drifted out of step with the host's, which is worth catching early.
const HOST_OWNED_PKGS = ['@sanity/ui', '@sanity/icons']

function run(cmd, opts = {}) {
  return execSync(cmd, {encoding: 'utf8', stdio: 'pipe', ...opts})
}

function findTarball() {
  return readdirSync(root)
    .filter((f) => f.startsWith(`${PKG}-`) && f.endsWith('.tgz'))
    .map((f) => path.join(root, f))
}

// Every copy of `name` in an installed tree, including ones nested under a
// package's own node_modules — which is exactly where a mis-declared dependency
// puts its private second copy.
function findCopies(nodeModulesDir, name, found = []) {
  const direct = path.join(nodeModulesDir, ...name.split('/'), 'package.json')
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
      if (existsSync(nested)) findCopies(nested, name, found)
    }
  }
  return found
}

// Assert the plugin and the Studio load the *same* copy of `name`, and that the
// plugin doesn't carry a private one. Two copies of @sanity/ui means two React
// context instances, so the plugin's hooks can't see the Studio's providers — a
// runtime crash that no amount of local dev-Studio testing surfaces.
//
// Deliberately NOT "exactly one copy in the whole tree": Sanity's own dependency
// graph carries nested copies we neither cause nor can fix (`sanity@6.9.2` pulls
// an `@sanity/icons@3.8.0` under `@sanity-labs/ui-poc`, for instance). Failing on
// those would make this guard red for upstream reasons and train everyone to
// ignore it. What we can be held to is our own declaration.
function checkSharedCopy(dir, name) {
  const nm = path.join(dir, 'node_modules')

  let fromPlugin, fromStudio
  try {
    fromPlugin = realpathSync(
      createRequire(path.join(nm, PKG, 'package.json')).resolve(`${name}/package.json`),
    )
    fromStudio = realpathSync(
      createRequire(path.join(nm, 'sanity', 'package.json')).resolve(`${name}/package.json`),
    )
  } catch (e) {
    return {ok: false, detail: `could not resolve ${name} from both sides: ${e.message}`}
  }
  if (fromPlugin !== fromStudio) {
    return {
      ok: false,
      detail:
        `plugin and Studio resolve different ${name} installs:\n` +
        `            plugin: ${path.relative(dir, fromPlugin)}\n` +
        `            studio: ${path.relative(dir, fromStudio)}`,
    }
  }

  // A copy nested under our own package is the signature of declaring something
  // the host owns as a dependency instead of a peer.
  const privateCopy = path.join(nm, PKG, 'node_modules', ...name.split('/'), 'package.json')
  if (existsSync(privateCopy)) {
    const {version} = createRequire(privateCopy)(privateCopy)
    return {
      ok: false,
      detail:
        `${name} ${version} is installed privately under the plugin\n` +
        `            (${path.relative(dir, privateCopy)}) — the host must own it.`,
    }
  }

  const {version} = createRequire(fromPlugin)(fromPlugin)
  // Unrelated copies elsewhere in the host's tree are reported, never failed on.
  const others = findCopies(nm, name).length - 1
  const note =
    others > 0 ? `; ${others} unrelated cop${others === 1 ? 'y' : 'ies'} in host deps` : ''
  return {ok: true, detail: `${name} ${version} shared by plugin and Studio${note}`}
}

// Run the shared-copy assertion for every package the Studio must own, reporting
// all failures rather than stopping at the first.
function checkHostOwnedCopies(dir) {
  const results = HOST_OWNED_PKGS.map((name) => ({name, ...checkSharedCopy(dir, name)}))
  return {ok: results.every((r) => r.ok), results}
}

// Install the packed plugin into a throwaway studio and report whether it
// installed cleanly with no peer-dependency problems, and with a single shared
// copy of each Studio-owned package. Cleans up its testDir on every path.
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
  const copies = ok ? checkHostOwnedCopies(testDir) : null
  rmSync(testDir, {recursive: true, force: true})
  return {ok, hasPeerProblem, copies, out}
}

function reportStudio(studio, result) {
  const {ok, hasPeerProblem, copies, out} = result
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
  if (copies && !copies.ok) {
    console.error(`\n✗ ${studio.name}: duplicate Studio-owned package in the installed tree`)
    for (const r of copies.results.filter((x) => !x.ok)) console.error(`            ${r.detail}`)
    console.error(
      `            The host Studio must be the single source of these. For @sanity/ui,\n` +
        `            two copies mean two React contexts and the plugin's hooks stop seeing\n` +
        `            the Studio's providers — so it must stay a peer dependency.`,
    )
    return false
  }
  console.log(`✓ ${studio.name}: installs cleanly, no peer-dependency problems`)
  if (copies) for (const r of copies.results) console.log(`  └─ ${r.detail}`)
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
