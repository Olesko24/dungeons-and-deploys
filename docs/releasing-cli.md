# Releasing the CLI

The `quest` CLI in `apps/cli` is published to npm as [`dungeons-and-deploys`](https://www.npmjs.com/package/dungeons-and-deploys).
A deploy updates the API and website, but CLI changes only reach players when you release them here.

## One-time setup per machine

The release uses its own npm login in `~/.npmrc-dnd` (`%USERPROFILE%\.npmrc-dnd` on Windows), so it never
publishes to another registry from your global `.npmrc`.

1. Node 24 or newer, and pnpm from the repository root:
   ```sh
   corepack enable
   pnpm install
   ```
   On Windows, if this fails with `Cannot find module ...corepack/v1/pnpm/.../pnpm.cjs`, update Corepack
   (`npm install -g corepack@latest` and `corepack cache clean`) or install pnpm directly
   (`corepack disable` and `npm install -g pnpm@<version from package.json>`).
2. Log in to npm (opens the browser):
   ```sh
   # macOS / Linux
   npm login --auth-type=web --registry https://registry.npmjs.org --userconfig ~/.npmrc-dnd
   # Windows PowerShell
   npm login --auth-type=web --registry https://registry.npmjs.org --userconfig "$HOME\.npmrc-dnd"
   ```

## Every release

1. Bump the version in `apps/cli/package.json`. Fixes are a patch, new commands a minor version:
   ```sh
   cd apps/cli
   npm version patch --no-git-tag-version   # or: minor
   ```
2. Commit and push to `main`:
   ```sh
   git commit -am "chore(cli): release 0.1.1"
   git push
   ```
3. Publish:
   ```sh
   pnpm release
   ```
   npm opens the browser (or prints a link) to confirm the publish with your passkey. The script waits until
   you have confirmed.
   The script stops before publishing when you are not on `main`, have uncommitted changes, `main` differs
   from GitHub, the version is already on npm, a test fails or the build has CRLF line endings.
4. npm holds the upload as a staged release. Until you approve it on npmjs.com, the package shows a
   placeholder `0.0.0-stage` or the previous version. Approve it there.
5. Check that it is live, then tag the release:
   ```sh
   npm view dungeons-and-deploys dist-tags --registry https://registry.npmjs.org
   git tag cli-v0.1.1 && git push origin cli-v0.1.1
   ```

## When something goes wrong

| Message | Cause | Fix |
|---|---|---|
| `EOTP` / `This operation requires a one-time password` | npm did not start the browser confirmation | Make sure `--auth-type=web` is passed (the script does), or update npm: `npm install -g npm@latest` |
| `403 ... Two-factor authentication ... is required` | Account without 2FA or the token cannot publish | Enable 2FA on npmjs.com and log in again |
| `ENEEDAUTH` or `401` | No login in `.npmrc-dnd` | Run the login from the setup again |
| `has CRLF line endings` | Built from a Windows checkout without `newLine: lf` | Keep `"newLine": "lf"` in `apps/cli/tsconfig.build.json` |

The server does not know the CLI version. Changes to API responses must keep working with older CLI versions,
since players update whenever they like.
