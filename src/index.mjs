#!/usr/bin/env node
// Stdio bridge for the hosted Transcodely MCP server.
//
// The real server lives at https://mcp.transcodely.com/mcp (streamable HTTP,
// browser OAuth). Clients that support remote servers should connect there
// directly. This bridge exists for stdio-only clients and headless use: it
// serves the hosted server's exact tool surface (vendored in ../tools.json,
// generated from the server's own tools/list) and forwards tool calls to the
// hosted endpoint using a Transcodely API key from $TRANSCODELY_API_KEY.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ENDPOINT = process.env.TRANSCODELY_MCP_URL ?? "https://mcp.transcodely.com/mcp";
const API_KEY = process.env.TRANSCODELY_API_KEY;

const here = dirname(fileURLToPath(import.meta.url));
const tools = JSON.parse(readFileSync(join(here, "..", "tools.json"), "utf8"));

const server = new Server(
  { name: "transcodely", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

let upstream;
async function upstreamClient() {
  if (upstream) return upstream;
  const client = new Client({ name: "transcodely-mcp-bridge", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
  });
  await client.connect(transport);
  upstream = client;
  return upstream;
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (!API_KEY) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            "No credentials: this bridge forwards to the hosted Transcodely MCP server, " +
            "which requires authentication. Either set TRANSCODELY_API_KEY (create a key " +
            "at https://www.transcodely.com) and restart, or — better, if your client " +
            "supports remote MCP servers — connect it directly to " +
            "https://mcp.transcodely.com/mcp and authorize in the browser.",
        },
      ],
    };
  }
  try {
    const client = await upstreamClient();
    return await client.callTool({ name: req.params.name, arguments: req.params.arguments ?? {} });
  } catch (err) {
    upstream = undefined; // force a fresh session on the next call
    return {
      isError: true,
      content: [{ type: "text", text: `Upstream call failed: ${err?.message ?? String(err)}` }],
    };
  }
});

await server.connect(new StdioServerTransport());
