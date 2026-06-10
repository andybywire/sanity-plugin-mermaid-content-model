// Vitest setup: register @testing-library/jest-dom matchers (toBeInTheDocument,
// etc.) on vitest's expect. Loaded for every test file via vitest.config.ts;
// harmless for the pure (non-DOM) suites.
import '@testing-library/jest-dom/vitest'
import {configure} from '@testing-library/react'

// CI runners (ubuntu in particular) can be several times slower than local, and
// @sanity/ui toasts render asynchronously after a click. The 1000ms default for
// findBy*/waitFor is too tight there — a slow runner can miss an error toast
// that renders just past the deadline. Give async assertions real headroom; a
// genuinely-missing element still fails, just after a longer wait.
configure({asyncUtilTimeout: 5000})

// jsdom doesn't implement window.matchMedia, but @sanity/ui's responsive hooks
// (useMediaIndex) call it. Provide a minimal stub so @sanity/ui components
// render under jsdom. No-op listeners: tests don't change viewport.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
