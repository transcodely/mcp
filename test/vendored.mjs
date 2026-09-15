// Offline gate: everything this repo says about the tool surface has to agree
// with tools.json.
//
// This runs with no api checkout and no credentials, so it is the check that
// actually gates every push and every fork PR. It cannot notice the api adding
// a tool — only scripts/check-api-parity.mjs can — but it does catch the whole
// drift class that has bitten before: a vendored export that moved while the
// README, the registry manifest and the bridge kept the old count.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	BILLABLE,
	README_PATH,
	ROOT,
	SERVER_JSON_PATH,
	assertBillableAreWrites,
	assertNothingDeletes,
	effectOf,
	isBillable,
	numberWord,
	readExport,
	readPin,
	toolCounts,
} from "../scripts/lib/tools.mjs";

const { server, tools } = readExport();
const counts = toolCounts(tools);
const readme = readFileSync(README_PATH, "utf8");
const serverJson = JSON.parse(readFileSync(SERVER_JSON_PATH, "utf8"));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

// --- the export itself -------------------------------------------------------

assert.equal(server.name, "transcodely", "the export names a different server");
assert.ok(tools.length > 0, "the export carries no tools");

for (const tool of tools) {
	for (const field of ["name", "title", "description", "annotations", "inputSchema"]) {
		assert.ok(tool[field], `${tool.name ?? "<unnamed>"} is missing ${field}`);
	}
	// Both are Anthropic-directory requirements and the reason a client can
	// show a safe/unsafe badge. An absent readOnlyHint reads as "may write".
	assert.equal(typeof tool.annotations.readOnlyHint, "boolean", `${tool.name}: readOnlyHint`);
	if (effectOf(tool) !== "read") {
		assert.equal(
			typeof tool.annotations.destructiveHint,
			"boolean",
			`${tool.name}: a writing tool must state destructiveHint explicitly — ` +
				"the protocol default for an absent hint is destructive",
		);
	}
}

assert.deepEqual(
	[...tools.map((t) => t.name)].sort(),
	tools.map((t) => t.name),
	"the export is expected to be sorted by name",
);

// The promise on the front of the README, re-derived rather than trusted.
assertNothingDeletes(tools);
assertBillableAreWrites(tools);

// --- billing claims ----------------------------------------------------------

// MCP annotations carry no billing dimension, so `BILLABLE` is a written list.
// A written list can go stale, and the way it goes stale is a new free write
// tool inheriting a "billable" label from the row above it. Nothing here may
// mention a non-billable tool on the same line as a charge.
const CHARGE_WORDS = /billable|billed|bills you|costs money|charged/i;
for (const tool of tools) {
	if (isBillable(tool)) continue;
	for (const [label, text] of [
		["README.md", readme],
		["server.json description", serverJson.description],
	]) {
		for (const line of text.split("\n")) {
			assert.ok(
				!(line.includes(tool.name) && CHARGE_WORDS.test(line)),
				`${label} calls ${tool.name} billable, but it is not in BILLABLE. ` +
					`Either it really does charge (add it, and say why) or the label is wrong:\n  ${line.trim()}`,
			);
		}
	}
}

// And the converse: every tool we DO charge for must be named somewhere with
// its charge, so the README cannot quietly stop warning about one.
for (const name of BILLABLE) {
	assert.ok(
		readme.split("\n").some((line) => line.includes(name) && CHARGE_WORDS.test(line)),
		`README never marks ${name} as billable, but it is`,
	);
}

// --- counts stated in prose --------------------------------------------------

// RECON trap 1: the tool count is written out in five places and they have to
// move together. Here we hold the two that live in this repo.
const NUMERAL = "\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";
const phrase = new RegExp(`\\b(${NUMERAL}) tools\\b`, "gi");

// Every count the prose may legitimately quote: the whole surface, or one of
// the groups the export defines. Anything else is a stale claim.
const legitimate = new Set(
	[counts.total, counts.read, counts.create, counts.overwrite, counts.billable]
		.flatMap((n) => [String(n), numberWord(n)]),
);

for (const [label, text] of [
	["README.md", readme],
	["server.json description", serverJson.description],
]) {
	const said = [...text.matchAll(phrase)].map((m) => m[1].toLowerCase());
	assert.ok(said.length > 0, `${label} never states the tool count`);
	for (const word of said) {
		assert.ok(
			legitimate.has(word),
			`${label} says "${word} tools", which is no group the export has`,
		);
	}
}

// The total itself must actually appear somewhere, or the check above passes
// on a file that only ever quotes sub-counts.
assert.ok(
	[...readme.matchAll(phrase)].some((m) => m[1].toLowerCase() === numberWord(counts.total)),
	`README.md never states the real total of ${counts.total} tools`,
);

// The per-line check above only sees claims that NAME a tool. The claim that
// actually shipped wrong was an aggregate — "four start work you are billed
// for" — which names nothing. So a numeral reaching a charge word within one
// clause (no sentence break, dash, newline or table pipe between them) must be
// the billable count, not the create count.
// The inner class excludes a further numeral, so the match is the numeral
// NEAREST the charge word — otherwise "nine only read, four start work you are
// billed for" is reported against "nine", which is not the claim at fault.
const CHARGE_COUNT = new RegExp(
	`\\b(${NUMERAL})\\b(?:(?!\\b(?:${NUMERAL})\\b)[^.\\n\u2014|]){0,45}?`
		+ "(?:billable|billed|charged|costs money)",
	"gi",
);
for (const match of readme.matchAll(CHARGE_COUNT)) {
	assert.equal(
		match[1].toLowerCase(),
		numberWord(counts.billable),
		`README quotes "${match[1]}" next to a charge, but ${counts.billable} tools are ` +
			`billable:\n  ${match[0]}`,
	);
}

// --- every tool is documented ------------------------------------------------

for (const tool of tools) {
	assert.ok(readme.includes(`\`${tool.name}\``), `README never mentions ${tool.name}`);
}

// --- manifests agree ---------------------------------------------------------

assert.equal(
	serverJson.version,
	pkg.version,
	"server.json and package.json must carry the same version — the registry listing " +
		"and the npx bridge are the same release",
);
assert.match(serverJson.version, /^\d+\.\d+\.\d+$/, "server.json version must be semver");

// The registry schema caps `description` at 100 characters. Finding that out at
// `mcp-publisher publish` time means a failed release, not a failed test.
assert.ok(
	serverJson.description.length <= 100,
	`server.json description is ${serverJson.description.length} chars; the MCP registry schema caps it at 100`,
);

const pin = readPin();
assert.match(pin.ref, /^v\d+\.\d+\.\d+$/, "api-pin.json ref must be a released api tag");
assert.ok(pin.repository.startsWith("https://"), "api-pin.json repository must be an https clone URL");
assert.ok(pin.command.includes("--dump-tools"), "api-pin.json command must be the tool export");

console.log(
	`ok: ${counts.total} tools (${counts.read} read, ${counts.create} create of which ` +
		`${counts.billable} billable, ${counts.overwrite} overwrite), nothing that deletes, ` +
		`manifests at ${serverJson.version}`,
);
