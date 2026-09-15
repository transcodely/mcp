#!/usr/bin/env node
// Regenerate the README's tool table from tools.json.
//
//   node scripts/gen-readme.mjs            rewrite the generated block
//   node scripts/gen-readme.mjs --check    fail if it is out of date (CI)
//
// The table is never hand-typed. Every cell comes from the vendored export:
// the name, the title, the effect derived from the MCP annotations, and the
// FIRST SENTENCE of the api's own description, verbatim. That is the point —
// the README cannot describe a tool the server does not serve, and it cannot
// keep a stale count after a tool is added.
//
// The prose around the block is hand-written and stays that way: the auth
// rules and the safety story are claims about the server, not about the
// export, and a human has to stand behind them.
import { readFileSync, writeFileSync } from "node:fs";
import {
	README_PATH,
	assertBillableAreWrites,
	assertNothingDeletes,
	capitalize,
	effectOf,
	firstSentence,
	isBillable,
	numberWord,
	readTools,
	toolCounts,
} from "./lib/tools.mjs";

const BEGIN = "<!-- BEGIN GENERATED TOOLS — npm run readme:gen -->";
const END = "<!-- END GENERATED TOOLS -->";

/**
 * The Effect cell.
 *
 * "billable" comes from the WRITTEN list in lib/tools.mjs, never from the
 * annotations — MCP annotations say nothing about money, and inferring it from
 * them labelled `create_preset` billable when saving a preset is free.
 */
function effectLabel(tool) {
	const effect = effectOf(tool);
	if (effect === "read") return "read";
	if (effect === "overwrite") return "overwrites a setting";
	return isBillable(tool) ? "creates work · billable" : "creates · free";
}

function render() {
	const tools = readTools();
	assertNothingDeletes(tools);
	assertBillableAreWrites(tools);
	const counts = toolCounts(tools);

	const rows = tools.map((tool) => {
		const what = firstSentence(tool.description).replaceAll("|", "\\|");
		return `| \`${tool.name}\` | ${effectLabel(tool)} | ${what} |`;
	});

	const writes = counts.create + counts.overwrite;
	const lines = [
		BEGIN,
		`## Tools (${counts.total})`,
		"",
		`${capitalize(numberWord(counts.total))} tools: ${numberWord(counts.read)} only read, ` +
			`${numberWord(counts.create)} create something — ${numberWord(counts.billable)} of those ` +
			"start work you are billed for, and saving a preset is free — and " +
			`${numberWord(counts.overwrite)} overwrite a setting that only affects work created after it. ` +
			"No tool on this surface deletes, cancels, removes or rotates anything.",
		"",
		"| Tool | Effect | What it does |",
		"|---|---|---|",
		...rows,
		"",
		`*Generated from [\`tools.json\`](./tools.json) by \`npm run readme:gen\` — do not edit by hand. ` +
			`Read-only: ${counts.read}. Writing: ${writes}. Billable: ${counts.billable}.*`,
		END,
	];
	return lines.join("\n");
}

const readme = readFileSync(README_PATH, "utf8");
const start = readme.indexOf(BEGIN);
const stop = readme.indexOf(END);
if (start < 0 || stop < 0) {
	console.error(`README.md is missing the generated block markers:\n  ${BEGIN}\n  ${END}`);
	process.exit(1);
}

const next = readme.slice(0, start) + render() + readme.slice(stop + END.length);

if (process.argv.includes("--check")) {
	if (next !== readme) {
		console.error(
			"README.md's tool table is stale — tools.json has moved since it was generated.\n" +
				"Run: npm run readme:gen",
		);
		process.exit(1);
	}
	console.log("ok: README tool table matches tools.json");
} else {
	writeFileSync(README_PATH, next);
	console.log("wrote README.md tool table from tools.json");
}
