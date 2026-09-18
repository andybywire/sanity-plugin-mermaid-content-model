<!-- markdownlint-disable --><!-- textlint-disable -->

# 📓 Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.0](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v1.0.1...v2.0.0) (2026-09-18)

### ⚠ BREAKING CHANGES

* requires Sanity 6.9.2 or later, React 19.2 or later, and
Node 22.12 or later. Studios on Sanity v5 or 6.0 through 6.9.1 ship
@sanity/ui v3 and should stay on the 1.x line.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* @sanity/ui v4 is now required and must be provided by the
host Studio, which means Studio 6.10 or later. Studios on Sanity v5 or
Studio 6.0 through 6.9 ship UI v3 and should stay on the 1.x line.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

### Features

* raise floors to Sanity 6.9.2 and move to the UI v4 ecosystem ([483e527](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/483e527cb9839d6237896bae8c279d2ee1f5ed07))
* require Sanity UI v4, provided by the host Studio ([f9da364](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/f9da36468b9496f1f6e6fbe26d6337ff900ab2b2))

## [1.0.1](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v1.0.0...v1.0.1) (2026-08-19)

### Bug Fixes

* render self-referential relations with mermaid's unified class renderer ([e563226](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/e5632267204efd8af5d41d0e96c29e3eed574e21)), closes [#46](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/46)

## [1.0.0](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.5.0...v1.0.0) (2026-07-21)

### ⚠ BREAKING CHANGES

* 1.0 stabilizes the public API. Future breaking changes
to the plugin export or Mermaid export contract will bump the major version.

### Miscellaneous Chores

* release 1.0 ([4af42a4](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/4af42a4d18aab4a6d19c530e14c8e768baa48e7d))

## [0.5.0](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.4.0...v0.5.0) (2026-06-26)

### Features

* adaptive max zoom and auto-refit on element changes ([d5d764b](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/d5d764bcc8de895f05d0e93f476bf3288d701452)), closes [#24](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/24) [#33](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/33) [#33](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/33)

## [0.4.0](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.3.4...v0.4.0) (2026-06-25)

### Features

* warn on named object types that nothing references ([5c4b426](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/5c4b426e99b293a80a09aea654300bbca654a280))
* warn when inline-object shapes are duplicated ([05cb3d2](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/05cb3d2bc19076476f73725f04db4d1350e10f19))

## [0.3.4](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.3.3...v0.3.4) (2026-06-25)

### Bug Fixes

* disambiguate named types that collide under pascalCase ([33ca59a](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/33ca59aca3c2a412cb9cb7515fa308807a3cf1f2))

## [0.3.3](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.3.2...v0.3.3) (2026-06-25)

### Bug Fixes

* render every target of a multi-target reference ([a240b25](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/a240b25e444be192cb80c1cb58da6832d50e0aab))

## [0.3.2](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.3.1...v0.3.2) (2026-06-25)

### Bug Fixes

* follow named-type aliases so plugin-contributed types connect ([a62f8ad](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/a62f8ad308ca7f6fbd52ac4478da260b43b3ce9b)), closes [#32](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/32)

## [0.3.1](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.3.0...v0.3.1) (2026-06-23)

### Bug Fixes

* render Portable Text embeds faithfully (issue [#23](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/23)) ([85706a0](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/85706a0e4a946e350d237dc1536cbf2696d0065b))

## [0.3.0](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.2.0...v0.3.0) (2026-06-16)

### Features

* widen sanity peer range to ^5 || ^6 ([a82a62d](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/a82a62d56b8bf7ec38475e4213d570c2c0cb9e63))

## [0.2.0](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.1.2...v0.2.0) (2026-06-16)

### Features

* move content-model warnings into a popover button ([061217c](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/061217c903215f69b44f4e246a73795685e361ae))

## [0.1.2](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.1.1...v0.1.2) (2026-06-16)

### Bug Fixes

- render inline image and file fields ([26e3cf3](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/26e3cf3ebd5bbaa4dfe7e7395f4eb09c555c8a7c))

## [0.1.1](https://github.com/andybywire/sanity-plugin-mermaid-content-model/compare/v0.1.0...v0.1.1) (2026-06-13)

### Bug Fixes

- connect Portable Text inline objects and annotations to their parent ([880699f](https://github.com/andybywire/sanity-plugin-mermaid-content-model/commit/880699f127bd4a420c1e9aa935942e0bb3f10ce7)), closes [#2](https://github.com/andybywire/sanity-plugin-mermaid-content-model/issues/2)
