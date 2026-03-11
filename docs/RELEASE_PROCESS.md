# Release Process

## Branch model

- `main`: stable, release-ready code.
- `next`: integration branch for upcoming features.
- feature branches: `codex/<short-topic>` merged into `next`.

## Versioning

This repo uses Semantic Versioning (`MAJOR.MINOR.PATCH`):

- `MAJOR`: breaking changes.
- `MINOR`: backward-compatible features.
- `PATCH`: backward-compatible fixes.

## Required release artifacts

Every release must include:

- updated `CHANGELOG.md`
- git tag (example: `v1.0.0`)
- short release notes in GitHub Releases

## Release checklist

1. Merge approved changes into `main`.
2. Run checks:
   - `npx tsc --noEmit`
   - `npm run lint` (if configured)
3. Confirm no secrets are tracked:
   - `.env.local` untracked
   - no token strings in committed files
4. Update `CHANGELOG.md` for the target version.
5. Commit and push to `main`.
6. Create annotated tag:
   - `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
   - `git push origin vX.Y.Z`
7. Publish GitHub Release notes from the tag.

## Rollback strategy

- To roll back locally to a prior stable version:
  - `git checkout vX.Y.Z`
- To pin production usage:
  - deploy from an explicit tag, not from a moving branch.

## Contributor update guidance

- Users who want latest fixes: `git pull origin main`.
- Users who want stability: stay pinned to a release tag.
