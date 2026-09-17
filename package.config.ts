import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  dist: 'dist',
  tsconfig: 'tsconfig.dist.json',

  dts: 'rolldown',

  strictOptions: {
    // pkg-utils wants `@sanity/ui` in `dependencies`, not `peerDependencies`. We
    // deviate deliberately: the host Studio must be the single source of
    // @sanity/ui, because two copies mean two React context instances and the
    // plugin's hooks then can't see the Studio's providers. Declaring it a
    // dependency does dedupe against a compatible host today, but it fails
    // silently the moment the host moves to a major we don't range over — which
    // is exactly the bug this migration exists to fix. As a peer, that mismatch
    // surfaces as an unmet-peer warning instead.
    //
    // Only this one rule is disabled; the other placement checks stay on. The
    // invariant it would otherwise help with is enforced directly by
    // `pnpm test:studio-install`, which asserts a real consumer install resolves
    // exactly one @sanity/ui. See docs/sanity-ui-v4-migration.md.
    noSanityUiPeerDependency: 'off',
  },

  // Quiet api-extractor's release-tag lint. The plugin's public surface is
  // small and we don't annotate every export with @public/@internal; revisit
  // if/when the API stabilises for the standalone-repo extraction.
  extract: {
    rules: {
      'ae-incompatible-release-tags': 'off',
      'ae-internal-missing-underscore': 'off',
      'ae-missing-release-tag': 'off',
    },
  },
})
