<!-- Keep this short. The squash-merge title is what ships in the changelog and decides the release. -->

## What & why

<!-- One or two sentences. Link the issue: Closes #N -->

## Release impact

<!-- The Conventional-Commit type of the squash-merge title:
     fix: → patch · feat: → minor · feat!: / BREAKING CHANGE: → major ·
     chore/docs/test/ci/refactor: → no release -->

- Type:

## Checklist

- [ ] `pnpm test && pnpm typecheck && pnpm build && pnpm lint` all green
- [ ] Squash-merge title is a valid Conventional Commit
- [ ] Eyeballed in the dev Studio (`pnpm dev`) if UI/behavior changed
- [ ] Updated `docs/architecture.md` / `docs/ui-design.md` if a contract or guardrail changed
