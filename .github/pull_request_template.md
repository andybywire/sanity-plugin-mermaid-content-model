<!-- Merge-commit flow: every commit on this branch lands on `main`, so each must be a clean Conventional Commit — together they build the changelog and decide the release. -->

## What & why

<!-- One or two sentences. Close the issue with a keyword: Closes #N — this is what auto-closes it on merge (the branch name doesn't). -->

## Release impact

<!-- The highest-impact Conventional-Commit type among this branch's commits:
     fix: → patch · feat: → minor · feat!: / BREAKING CHANGE: → major ·
     chore/docs/test/ci/refactor: → no release -->

- Type:

## Checklist

- [ ] `pnpm test && pnpm typecheck && pnpm build && pnpm lint` all green
- [ ] Every commit is a valid Conventional Commit; merge with a **merge commit** (not squash/rebase)
- [ ] Eyeballed in the dev Studio (`pnpm dev`) if UI/behavior changed
- [ ] Updated `docs/architecture.md` / `docs/ui-design.md` if a contract or guardrail changed
