// CI smoke test: the bridge must start and answer introspection with no
// credentials, and a keyless tool call must return the guidance error.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "ci", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["src/index.mjs"] }));

const { tools } = await client.listTools();
if (tools.length !== 7) throw new Error(`expected 7 tools, got ${tools.length}`);
if (!tools.every((t) => t.annotations?.title)) throw new Error("tool missing annotations.title");

const res = await client.callTool({ name: "get_usage", arguments: {} });
if (!res.isError) throw new Error("keyless call should error");
if (!res.content[0].text.includes("mcp.transcodely.com")) throw new Error("guidance missing");

console.log("ok: 7 annotated tools, keyless call guides to the hosted endpoint");
await client.close();
process.exit(0);
