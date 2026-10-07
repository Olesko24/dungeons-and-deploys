#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const server = process.env.TOKENQUEST_URL ?? "http://localhost:3000";
const configDir = join(homedir(), ".tokenquest");

async function api(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(`${server}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function login(code: string | undefined) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question("Email: ")).trim();
  rl.close();

  const reg = await api("/auth/register", { method: "POST", body: { email, code } });
  if (reg.status !== 200) throw new Error(reg.data.error ?? `Register failed (${reg.status})`);
  console.log(`Check your email. Confirm code: ${reg.data.confirmCode}`);
  process.stdout.write("Waiting...");

  while (true) {
    await sleep(2000);
    const poll = await api("/auth/poll", { method: "POST", body: { loginId: reg.data.loginId } });
    if (poll.status === 202) continue;
    if (poll.status !== 200) throw new Error(`\n${poll.data.error ?? `Login failed (${poll.status})`}`);

    await mkdir(configDir, { recursive: true, mode: 0o700 });
    await writeFile(join(configDir, "config.json"), JSON.stringify({ server, token: poll.data.token }, null, 2), { mode: 0o600 });
    const me = await api("/me", { token: poll.data.token });
    console.log(` ✓ Logged in as ${me.data.email}`);
    return;
  }
}

const { positionals, values } = parseArgs({ allowPositionals: true, options: { code: { type: "string" } } });

try {
  switch (positionals[0]) {
    case "login":
      await login(values.code);
      break;
    default:
      console.log("Usage: quest login [--code <ACCESS_CODE>]");
      process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
