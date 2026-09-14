#!/usr/bin/env node
// Prove tools.json is byte-for-byte what the pinned api release exports.
//
//   TRANSCODELY_API_PATH=~/git/transcodely/api node scripts/check-api-parity.mjs
//   node scripts/check-api-parity.mjs            # clones the pinned ref itself
//   node scripts/check-api-parity.mjs --write    # re-vendor instead of comparing
//
// With TRANSCODELY_API_PATH the check runs against a local checkout and does NOT
// verify that the checkout is at the pinned ref — that mode is for the developer
// landing a tool change, who is deliberately ahead of the pin. Without it, the
// script clones `repository` at `ref` from api-pin.json, which is the mode CI
// uses and the only one that proves the vendored file matches a released api.
//
// transcodely/api is private, so the clone needs a token in $API_REPO_TOKEN (or
// $GITHUB_TOKEN with access). Without one the script exits 78 — "not armed" —
// rather than reporting a pass it did not earn. CI treats 78 as a skip with a
// warning annotation; see .github/workflows/ci.yml.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOOLS_PATH, readPin, readToolsRaw } from "./lib/tools.mjs";

const NOT_ARMED = 78;
const pin = readPin();
const write = process.argv.includes("--write");

function run(cmd, args, cwd) {
	return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The api checkout to export from, plus whether we have to clean it up. */
function resolveCheckout() {
	const local = process.env.TRANSCODELY_API_PATH;
	if (local) {
		console.log(`using local api checkout: ${local} (pin ${pin.ref} NOT verified in this mode)`);
		return { dir: local, temporary: false };
	}

	const token = process.env.API_REPO_TOKEN ?? process.env.GITHUB_TOKEN;
	if (!token) {
		console.warn(
			"api parity NOT ARMED: transcodely/api is private and no API_REPO_TOKEN is set.\n" +
				"Run locally with TRANSCODELY_API_PATH=/path/to/api, or provide a token.",
		);
		process.exit(NOT_ARMED);
	}

	const dir = mkdtempSync(join(tmpdir(), "transcodely-api-"));
	const url = pin.repository.replace("https://", `https://x-access-token:${token}@`);
	console.log(`cloning ${pin.repository} at ${pin.ref}`);
	// A missing ref must fail loudly: a pin that names a tag nobody cut is the
	// exact mistake this file exists to catch.
	run("git", ["clone", "--depth", "1", "--branch", pin.ref, url, dir]);
	return { dir, temporary: true };
}

const { dir, temporary } = resolveCheckout();
let exported;
try {
	const [cmd, ...args] = pin.command.split(" ");
	exported = run(cmd, args, dir);
} finally {
	if (temporary) rmSync(dir, { recursive: true, force: true });
}

if (write) {
	writeFileSync(TOOLS_PATH, exported);
	console.log("re-vendored tools.json — now run: npm run readme:gen");
	process.exit(0);
}

const vendored = readToolsRaw();
if (vendored === exported) {
	const { tools } = JSON.parse(vendored);
	console.log(`ok: tools.json is byte-exact with the api export (${tools.length} tools)`);
	process.exit(0);
}

console.error("tools.json DIFFERS from the api export.");
const a = JSON.parse(vendored).tools.map((t) => t.name);
const b = JSON.parse(exported).tools.map((t) => t.name);
const added = b.filter((n) => !a.includes(n));
const removed = a.filter((n) => !b.includes(n));
if (added.length > 0) console.error(`  tools only in the api: ${added.join(", ")}`);
if (removed.length > 0) console.error(`  tools only in this repo: ${removed.join(", ")}`);
if (added.length === 0 && removed.length === 0) {
	console.error("  same tool names — a description, schema or annotation changed.");
}
console.error("Re-vendor with: npm run tools:sync && npm run readme:gen");
process.exit(1);
