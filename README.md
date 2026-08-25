# Transcodely MCP Server

**Video transcoding and hosting for AI agents, over the [Model Context Protocol](https://modelcontextprotocol.io).**

Transcodely is agent-native video infrastructure: transcode, host, and get a playable link back from one natural-language prompt. Connect with one OAuth click — no API key to create or paste — then hand your agent a video URL.

- **Server URL (streamable HTTP):** `https://mcp.transcodely.com/mcp`
- **Product page:** https://www.transcodely.com/mcp
- **Connect guide:** https://www.transcodely.com/docs/guides/mcp
- **Registry identifier:** `com.transcodely/mcp`

> This is the public home of the hosted server: connect instructions, the tool surface, and the registry manifest. The server itself is a hosted service — there is nothing to install or run.

## Connect

**Claude Code**

```bash
claude mcp add --transport http transcodely https://mcp.transcodely.com/mcp
```

Then run `/mcp` inside Claude Code and pick **Authenticate** — your browser opens, you approve, and the tools are live. No Transcodely account yet? One is created for you during authorization.

**claude.ai / Claude desktop** — Settings → Connectors → Add custom connector → `https://mcp.transcodely.com/mcp`.

**Cursor** — add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "transcodely": { "type": "http", "url": "https://mcp.transcodely.com/mcp" }
  }
}
```

Any other client that supports remote MCP servers over streamable HTTP works the same way. For headless use (CI, server-side agents), attach a Transcodely API key as a bearer token instead — see the [connect guide](https://www.transcodely.com/docs/guides/mcp).

## Tools (7)

| Tool | Effect |
|---|---|
| `create_video_from_url` | Ingest an `https://` video, transcode it into an adaptive ladder, host it — returns a video that becomes playable when ready |
| `create_job` | Create a transcoding job writing renditions to a storage origin you own |
| `generate_captions` | AI captions (WebVTT) for a hosted video; idempotent per video + language |
| `get_video` | Status, renditions, and the playable link for a hosted video |
| `get_job_status` | Concise job status/progress snapshot, built for polling |
| `list_jobs` | Jobs for the authenticated app, newest first, with pagination |
| `get_usage` | Usage and cost for a billing month, per-line and total, in EUR |

Nothing on this surface deletes or modifies existing data: four tools only read, three create work.

## Try it

1. *"Transcode and host this video and give me a link: https://www.transcodely.com/videos/bbb-30s.mp4"*
2. *"Generate English captions for that video."*
3. *"What's the status of my last job?"*
4. *"How much have I spent on video this month, and which day cost the most?"*

## Auth and guardrails

- OAuth 2.1 with PKCE via browser consent; the server implements RFC 9728 Protected Resource Metadata and RFC 8707 resource indicators.
- Every tool call is scoped to a single Transcodely app and writes the same audit trail as REST calls.
- The MCP server is free to connect; work an agent starts is billed at [the ordinary Transcodely rates](https://www.transcodely.com/pricing). Read-only tools are free to call.

## Manifest

[`server.json`](./server.json) is the manifest published to the official MCP registry.
