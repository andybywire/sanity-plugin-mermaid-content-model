import {defineCliConfig} from 'sanity/cli'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineCliConfig({
  api: {
    projectId: 'e0a474c4',
    dataset: 'production',
  },
  // Serve the plugin from its TypeScript source (src/index.tsx) instead of the
  // built dist/, so edits hot-reload live with no rebuild. vite-tsconfig-paths
  // reads the `paths` mapping in studio/tsconfig.json and aliases the bare
  // package specifier to ../src. (Vite doesn't honor the package `source`
  // export condition on its own, and a global `source` condition would also
  // pull @sanity/ui from source.)
  vite: {
    plugins: [tsconfigPaths()],
  },
})
