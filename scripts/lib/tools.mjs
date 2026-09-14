// Shared reader for the vendored tool export.
//
// tools.json is generated — the byte-exact stdout of the api's
// `go run ./cmd/mcp --dump-tools` at the release pinned in api-pin.json.
// Nothing in this repo may edit it by hand; scripts/check-api-parity.mjs
// proves that it did not happen.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Repository root, resolved from this file rather than the cwd. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const TOOLS_PATH = join(ROOT, "tools.json");
export const PIN_PATH = join(ROOT, "api-pin.json");
export const README_PATH = join(ROOT, "README.md");
export const SERVER_JSON_PATH = join(ROOT, "server.json");

/** The export as written on disk, bytes included — parity compares these. */
export function readToolsRaw() {
	return readFileSync(TOOLS_PATH, "utf8");
}

/** The parsed export: `{ server, tools }`. */
export function readExport() {
	return JSON.parse(readToolsRaw());
}

/** Every tool, in the export's own order (the api sorts by name). */
export function readTools() {
	return readExport().tools;
}

/** The pinned api release. */
export function readPin() {
	return JSON.parse(readFileSync(PIN_PATH, "utf8"));
}

/**
 * The tools that put a charge on your bill, by name.
 *
 * This list is WRITTEN, not derived, and that is deliberate. MCP annotations
 * carry no billing dimension: `readOnlyHint` and `destructiveHint` describe
 * what a call does to your data, never what it costs. Reading "not read-only"
 * as "billed" published `create_preset` as billable on four public surfaces,
 * which is false — saving a preset writes a config row and nothing else.
 *
 * Verified against the api's charge path: each of these three reaches
 * `Jobs.Create` (`internal/mcpserver/tools_jobs.go:92`,
 * `tools_videos.go:75` via `Videos.CreateFromUrl`, and `tools_videos.go:216`).
 * `internal/services/presets/` has no ledger, charge or invoice reference —
 * only a cost ESTIMATOR that computes a display figure for a future job.
 *
 * `assertBillableAreWrites` holds it to the export; `test/vendored.mjs` holds
 * every public surface to it.
 */
export const BILLABLE = new Set([
	"create_job",
	"create_video_from_url",
	"generate_captions",
]);

/** Whether calling this tool costs money. Never inferred from annotations. */
export function isBillable(tool) {
	return BILLABLE.has(typeof tool === "string" ? tool : tool.name);
}

/**
 * What a tool does to your account, derived from its MCP annotations only.
 *
 * `overwrite` is the protocol's `destructiveHint`, which means "not additive" —
 * it replaces a value you already had. It is NOT a claim that something is
 * removed: no tool on this surface deletes or cancels anything, which
 * `assertNothingDeletes` re-proves from the export on every run.
 */
export function effectOf(tool) {
	const a = tool.annotations ?? {};
	if (a.readOnlyHint) return "read";
	if (a.destructiveHint) return "overwrite";
	return "create";
}

/** Counts by effect, for every sentence in the repo that states a number. */
export function toolCounts(tools = readTools()) {
	const counts = { read: 0, create: 0, overwrite: 0 };
	for (const tool of tools) counts[effectOf(tool)] += 1;
	return { total: tools.length, ...counts, billable: tools.filter(isBillable).length };
}

/**
 * Every billable tool must exist and must write; a read-only tool that bills
 * would be a contradiction, and a name that no longer exists would silently
 * shrink the list. Throws naming the offender.
 */
export function assertBillableAreWrites(tools = readTools()) {
	const byName = new Map(tools.map((t) => [t.name, t]));
	for (const name of BILLABLE) {
		const tool = byName.get(name);
		if (!tool) {
			throw new Error(`BILLABLE names ${name}, which the export does not carry`);
		}
		if (effectOf(tool) === "read") {
			throw new Error(`BILLABLE names ${name}, which the export marks read-only`);
		}
	}
}

/**
 * The first sentence of a tool's description, verbatim.
 *
 * Splits on a period followed by whitespace and a capital, and never inside an
 * ellipsis (`job_... plus`) — the README table is generated from this, so it
 * must be a deterministic cut of the api's own words, never a paraphrase.
 */
export function firstSentence(description) {
	return description.split(/(?<!\.\.)(?<=\.)\s+(?=[A-Z])/)[0].trim();
}

/**
 * The repo's central promise, re-derived from the export rather than asserted.
 *
 * Throws with the offending tool names, so a future api release that adds a
 * `delete_*` or `cancel_*` tool cannot land here behind a README that still
 * says nothing deletes.
 */
export function assertNothingDeletes(tools = readTools()) {
	const banned = tools
		.map((t) => t.name)
		.filter((name) => /^(delete|destroy|remove|cancel|purge|revoke|rotate)_/.test(name));
	if (banned.length > 0) {
		throw new Error(
			`the export carries tools that break the "nothing deletes or cancels" promise: ${banned.join(", ")}. ` +
				"Fix the promise in README.md and server.json before vendoring this export.",
		);
	}
}

/** Small English numerals, so prose reads like prose and still comes from the data. */
const WORDS = [
	"zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
	"ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
	"seventeen", "eighteen", "nineteen", "twenty",
];

export function numberWord(n) {
	return WORDS[n] ?? String(n);
}

export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
