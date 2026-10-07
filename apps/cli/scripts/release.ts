// Publishes the CLI to npm after checks, on macOS, Linux and Windows: pnpm release
// npm asks for the 2FA passkey in the browser while publishing.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const run = (cmd: string) => execSync(cmd, { stdio: "inherit" });
const out = (cmd: string) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const fail = (message: string) => {
  console.error(`Release stopped: ${message}`);
  process.exit(1);
};

const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));

// What goes to npm has to be the code on main at GitHub.
if (out("git rev-parse --abbrev-ref HEAD") !== "main") fail("release from the main branch");
if (out("git status --porcelain")) fail("commit or stash your changes first");
run("git fetch --quiet origin main");
if (out("git rev-parse HEAD") !== out("git rev-parse origin/main")) fail("main differs from origin/main, pull or push first");

let published: string[] = [];
try {
  published = [JSON.parse(out(`npm view ${name} versions --json --registry https://registry.npmjs.org`))].flat();
} catch {
  // Not on npm yet.
}
if (published.includes(version)) fail(`${version} is already on npm, bump the version in apps/cli/package.json first`);

run("pnpm test");
run("pnpm build");
for (const file of readdirSync("dist")) {
  if (readFileSync(join("dist", file), "utf8").includes("\r")) fail(`dist/${file} has CRLF line endings, the bin would break on macOS and Linux`);
}

run(`npm publish --ignore-scripts --auth-type=web --userconfig "${join(homedir(), ".npmrc-dnd")}"`);
console.log(`\nPublished ${name}@${version}. Approve the staged release on npmjs.com, then tag it:`);
console.log(`  git tag cli-v${version} && git push origin cli-v${version}`);
