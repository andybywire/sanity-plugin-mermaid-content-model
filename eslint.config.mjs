import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {fixupConfigRules} from '@eslint/compat'
import {FlatCompat} from '@eslint/eslintrc'
import js from '@eslint/js'
import globals from 'globals'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  {
    ignores: [
      '**/*.js',
      '**/commitlint.config.js',
      '**/dist/**',
      '**/lint-staged.config.js',
      '**/package.config.ts',
      '**/scripts/**',
      '**/studio/**',
    ],
  },
  js.configs.recommended,
  ...fixupConfigRules(
    compat.extends(
      'sanity/typescript',
      'sanity/react',
      'plugin:react-hooks/recommended',
      'plugin:prettier/recommended',
      'plugin:react/jsx-runtime',
    ),
  ),
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    // TypeScript (and our `tsc --noEmit` gate) checks undefined symbols far more
    // accurately than eslint's no-undef, which can't see type-only globals like
    // `React` from @types/react. Disabling no-undef for TS is typescript-eslint's
    // own recommendation.
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    // Test files: `any` builds deliberately-malformed fixtures, and describe/it
    // suites naturally nest callbacks deeper than the source-code limit.
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-nested-callbacks': 'off',
    },
  },
]
