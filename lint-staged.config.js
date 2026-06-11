export default {
  // --no-warn-ignored keeps pre-commit quiet when staged files (e.g. the config
  // files themselves) match eslint's ignore patterns.
  '**/*.{js,jsx}': ['eslint --no-warn-ignored'],
  // tsc can't typecheck individual files, so run a full --noEmit pass (our
  // typecheck gate) whenever any TS file is staged. Returning a plain string
  // tells lint-staged not to append filenames.
  '**/*.{ts,tsx}': ['eslint --no-warn-ignored', () => 'tsc --noEmit'],
}
