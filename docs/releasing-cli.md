# Releasing the CLI

The `quest` CLI in `apps/cli` is published to npm as [`dungeons-and-deploys`](https://www.npmjs.com/package/dungeons-and-deploys).
A deploy updates the API and website, but CLI changes only reach players when you release them here.

Releases run in GitHub Actions (`.github/workflows/release-cli.yml`) when a `cli-v*` tag is pushed. npm trusted
publishing authenticates the workflow, so there is no npm token in the repository, and npm shows the provenance
of every version. The workflow also creates a GitHub release with the changes since the last tag.

## One-time setup

On npmjs.com, open the package settings of `dungeons-and-deploys` and add a trusted publisher:

| Field | Value |
|---|---|
| Publisher | GitHub Actions |
| Organization or user | `Olesko24` |
| Repository | `dungeons-and-deploys` |
| Workflow filename | `release-cli.yml` |
| Environment | leave empty |
| Allowed actions | none besides the always allowed `npm stage publish` |

The publisher can only stage. A version goes live once you approve it with 2FA, so a compromised workflow
cannot publish on its own.

## Every release

1. Bump the version in `apps/cli/package.json`. Fixes are a patch, new commands a minor version:
   ```sh
   cd apps/cli
   npm version minor --no-git-tag-version   # or: patch
   ```
2. `main` only takes pull requests. Open one for the version bump, squash-merge it once CI passes, then tag the
   merged commit:
   ```sh
   git switch -c release/cli-0.2.0
   git commit -am "chore(cli): release 0.2.0"
   git push -u origin release/cli-0.2.0
   gh pr create --fill
   gh pr checks --watch && gh pr merge --squash --delete-branch
   git switch main && git pull
   git tag cli-v0.2.0 && git push origin cli-v0.2.0
   ```
3. The workflow checks that the tag matches the version and is on `main`, runs the CLI tests, builds, stages
   the version on npm and creates a GitHub pre-release. Follow it under **Actions → Release CLI**.
4. Approve the staged version on npmjs.com with 2FA (or `npm stage approve <stage-id>`). Until then the package
   shows the previous version. Check that it is live:
   ```sh
   npm view dungeons-and-deploys dist-tags --registry https://registry.npmjs.org
   ```
5. Mark the GitHub release as latest: `gh release edit cli-v0.2.0 --prerelease=false --latest`

## When something goes wrong

| Message | Cause | Fix |
|---|---|---|
| `Tag cli-v… does not match apps/cli version …` | Tag and `package.json` differ | Delete the tag (`git push --delete origin cli-v…`), fix the version, tag again |
| `Tag cli-v… is not on main` | Tagged a commit that is not on `main` | Delete the tag and tag a commit on `main` |
| `404` or `ENEEDAUTH` on publish | No trusted publisher on npmjs.com, or a typo in it | Check the one-time setup, the workflow filename must match exactly |
| `You cannot publish over the previously published versions` | The version is already on npm | Bump the version and tag again |

A failed run can be started again from the Actions page after the cause is fixed.

The server does not know the CLI version. Changes to API responses must keep working with older CLI versions,
since players update whenever they like.
