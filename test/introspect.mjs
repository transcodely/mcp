// CI smoke test: the bridge must start and answer introspection with no
// credentials, serving exactly the vendored tool surface, and a keyless tool
// call must return the guidance error.
//
// The expected tool list is read from tools.json rather than hardcoded — a
// hardcoded count is what let the "seven tools" claim survive a surface change
// everywhere else in this repo.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readTools, toolCounts } from "../scripts/lib/tools.mjs";

const vendored = readTools();
const expected = vendored.map((t) => t.name).sort();
const counts = toolCounts(vendored);

const client = new Client({ name: "ci", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["src/index.mjs"] }));

const { tools } = await client.listTools();
const served = tools.map((t) => t.name).sort();
if (served.join(",") !== expected.join(",")) {
	throw new Error(`bridge serves ${served.join(", ")}; tools.json has ${expected.join(", ")}`);
}
// `title` is top-level in the current spec (and in what the api exports);
// `annotations.title` is where older servers put it. The Anthropic connectors
// directory requires a display title, not a particular slot for it.
if (!tools.every((t) => t.title ?? t.annotations?.title)) {
	throw new Error("tool missing a display title");
}
if (!tools.every((t) => typeof t.annotations?.readOnlyHint === "boolean")) {
	throw new Error("tool missing annotations.readOnlyHint");
}

const res = await client.callTool({ name: "get_usage", arguments: {} });
if (!res.isError) throw new Error("keyless call should error");
if (!res.content[0].text.includes("mcp.transcodely.com")) throw new Error("guidance missing");

console.log(
	`ok: ${counts.total} annotated tools (${counts.read} read-only), keyless call guides to the hosted endpoint`,
);
await client.close();
process.exit(0);
