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
	README_PATH,
	ROOT,
	SERVER_JSON_PATH,
	assertNothingDeletes,
	effectOf,
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

// --- counts stated in prose --------------------------------------------------

// RECON trap 1: the tool count is written out in five places and they have to
// move together. Here we hold the two that live in this repo.
const NUMERAL = "\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";
const phrase = new RegExp(`\\b(${NUMERAL}) tools\\b`, "gi");
for (const [label, text] of [
	["README.md", readme],
	["server.json description", serverJson.description],
]) {
	const said = [...text.matchAll(phrase)].map((m) => m[1].toLowerCase());
	assert.ok(said.length > 0, `${label} never states the tool count`);
	for (const word of said) {
		assert.equal(
			word,
			numberWord(counts.total),
			`${label} says "${word} tools" but the export carries ${counts.total}`,
		);
	}
}

const readOnlyClaim = new RegExp(`\\b(${NUMERAL}) read-only\\b`, "gi");
for (const match of readme.matchAll(readOnlyClaim)) {
	assert.equal(
		match[1].toLowerCase(),
		numberWord(counts.read),
		`README says "${match[1]} read-only" but the export has ${counts.read}`,
	);
}
for (const match of serverJson.description.matchAll(readOnlyClaim)) {
	assert.equal(
		match[1].toLowerCase(),
		numberWord(counts.read),
		`server.json says "${match[1]} read-only" but the export has ${counts.read}`,
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
	`ok: ${counts.total} tools (${counts.read} read, ${counts.create} create, ` +
		`${counts.overwrite} overwrite), nothing that deletes, manifests at ${serverJson.version}`,
);
