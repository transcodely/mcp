# Transcodely MCP Server

**A video pipeline for AI agents, over the [Model Context Protocol](https://modelcontextprotocol.io) — with nothing on it that can delete your work.**

[![smithery badge](https://smithery.ai/badge/transcodely/video)](https://smithery.ai/servers/transcodely/video)
[![transcodely/mcp MCP server](https://glama.ai/mcp/servers/transcodely/mcp/badges/score.svg)](https://glama.ai/mcp/servers/transcodely/mcp)

Hand your agent a video URL and it comes back a playable link: transcoded into an ABR ladder, hosted, captioned if you ask. Then let it read back what it actually produced, what it cost, and why an upload did not become a job. No delete, no cancel, no key material. Connect with one OAuth click — no API key to create or paste.

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

<!-- BEGIN GENERATED TOOLS — npm run readme:gen -->
## Tools (15)

Fifteen tools: nine only read, four start work you are billed for, and two overwrite a setting that only affects work created after it. No tool on this surface deletes, cancels, removes or rotates anything.

| Tool | Effect | What it does |
|---|---|---|
| `create_job` | creates work | Create a transcoding job. |
| `create_preset` | creates work | Create a custom encoding preset for this app: a named, reusable bundle of encoding settings that create_job can reference by slug. |
| `create_video_from_url` | creates work | Ingest a remote https:// video and host it in one call — this is the tool for "transcode and host this, give me a link". |
| `generate_captions` | creates work | Generate AI captions (subtitles) for a hosted video by id (vid_...). |
| `get_ingest_rule` | read | Fetch one ingest rule by id (ing_...): its origin, enabled state, filters, the job it submits, and its event/job counts. |
| `get_job_status` | read | Get a concise status snapshot for a transcoding job by id (job_...): overall status and progress, any error code/message, and per-output status/progress with errors. |
| `get_output_report` | read | Get the full measurement report for one job output (job_... plus out_...): what the produced file turned out to BE, measured from the written file, and the verdict of comparing that against what the job asked for. |
| `get_usage` | read | Return hosting usage and cost for a billing month: videos encoded, encoding minutes, average storage, egress, request counts, and per-line and total cost in EUR. |
| `get_video` | read | Fetch a hosted video by id (vid_...): status, visibility, title, duration, poster image, encoded renditions (resolution, codec, bitrate, dimensions), and — once status is "ready" — a playback block. |
| `list_ingest_events` | read | List the storage deliveries this app's ingest rules received, newest first, with what became of each: the bucket and object key, the outcome (received, matched, created, skipped or failed), the REASON for a skip or failure, and the job id when one was created. |
| `list_ingest_rules` | read | List this app's ingest rules: the standing instructions that turn an object landing in a storage origin into a transcoding job. |
| `list_jobs` | read | List transcoding jobs for the authenticated app, newest first. |
| `list_presets` | read | List the encoding presets available to this app: the read-only ones the platform ships and the app's own custom ones. |
| `set_spend_limit` | overwrites a setting | Set or clear this app's monthly transcoding spend limit, in EUR. |
| `update_preset` | overwrites a setting | Update a custom preset's settings by id (pst_...). |

*Generated from [`tools.json`](./tools.json) by `npm run readme:gen` — do not edit by hand. Read-only: 9. Writing: 6.*
<!-- END GENERATED TOOLS -->

## What the surface cannot do

The promise is narrow and literal, and it is checked rather than asserted: `test/vendored.mjs` re-derives it from `tools.json` on every CI run and fails if a future release adds a tool whose name begins with `delete`, `cancel`, `remove`, `purge`, `rotate` or `destroy`.

- **Nothing is deleted or cancelled.** No tool removes a video, a job, an output, a preset or a rule, and none stops work that is already queued or running. An agent that decides mid-task to "clean up" has no instrument for it.
- **Nothing reads key or secret material.** There is no tool for API keys, and the ingest tools deliberately withhold even the prefix-and-last-four hint the REST API exposes: a rule's inbound secret is shown once, at creation, and never by this server. A tool result lands in an agent transcript, so anything a transcript should not carry is not on the surface at all.
- **Nothing reaches your organization.** Members, plans, invoices, team settings and the admin surface have no tools.
- **The overwriting pair only ever reaches forward.** `update_preset` and `set_spend_limit` carry `destructiveHint: true`, which in the protocol means "replaces a value" rather than "additive" — not that anything is removed. A preset is read and expanded when a job is *created*, so editing one never reaches a job that already exists; lowering a spend limit blocks the *next* job and never stops one in flight.

## Who can change the spend limit

`set_spend_limit` is the only tool with an authorization rule of its own, because it is the only one that moves money policy.

- It requires an **organization owner or admin**, signed in through the browser OAuth flow. This is the same membership check the REST API applies, enforced on this path too.
- **API-key sessions are refused outright** — including the stdio bridge below, which authenticates with `ak_…`. The refusal says so in words rather than failing as a generic permission error.
- It reads the limit back instead of echoing what it was given: a limit set above a plan or platform ceiling stores fine and changes nothing, because the lower ceiling still binds. The result carries the previous and the new *effective* limit and the rung it comes from.

## Auth and guardrails

- OAuth 2.1 with PKCE via browser consent; the server implements RFC 9728 Protected Resource Metadata and RFC 8707 resource indicators.
- **Every tool call is scoped to one Transcodely app**, resolved from the session, never from a tool argument. An agent cannot widen its own scope by passing a different id: a job, video, preset or rule belonging to another app reads back as *not found* rather than as a permission error, which would confirm it exists. Connect to `https://mcp.transcodely.com/mcp/app_…` to pin a specific app; the bare URL resolves to your organization's oldest active app.
- An `ak_…` key presented at a different app's URL is rejected outright.
- Every call writes the same audit trail as the equivalent REST call.
- The MCP server is free to connect; work an agent starts is billed at [the ordinary Transcodely rates](https://www.transcodely.com/pricing). Read-only tools are free to call.

## Try it

1. *"Transcode and host this video and give me a link: https://www.transcodely.com/videos/bbb-30s.mp4"*
2. *"Generate English captions for that video."*
3. *"What's the status of my last job?"*
4. *"Did that 1080p output actually come out as 1080p h264? Show me the measured report."*
5. *"I uploaded a file to my bucket and no job appeared — what happened?"*
6. *"How much have I spent on video this month, and which day cost the most?"*

## Run locally (stdio bridge)

Remote-capable clients should connect straight to the hosted endpoint above — that's the
one-click OAuth path. For stdio-only clients, sandboxes, and headless use, this repo is
also a runnable bridge that serves the same tools over stdio and forwards calls to the
hosted server:

```bash
# with an API key (create one in the Transcodely dashboard):
TRANSCODELY_API_KEY=ak_... npx github:transcodely/mcp

# or via Docker:
docker build -t transcodely-mcp .
docker run -i --rm -e TRANSCODELY_API_KEY=ak_... transcodely-mcp
```

Without `TRANSCODELY_API_KEY` the bridge still starts and answers introspection
(`initialize`, `tools/list`); tool calls return an error pointing at the two auth paths.
`set_spend_limit` is listed but always refused over this path — see the rule above.

## How `tools.json` is kept honest

[`tools.json`](./tools.json) is **generated, not written**: it is the byte-exact stdout of
the Transcodely API's own export, `go run ./cmd/mcp --dump-tools`, run in a checkout of the
release pinned in [`api-pin.json`](./api-pin.json). The README table above is generated from
it in turn. Two checks hold that chain:

| Check | Command | Runs |
|---|---|---|
| Vendored consistency — counts, annotations, the "nothing deletes" promise, manifest versions, the README naming every tool | `node test/vendored.mjs` | every push and PR |
| The bridge serves exactly the vendored surface, keyless calls guide | `node test/introspect.mjs` | every push and PR |
| The README table is regenerated from `tools.json` | `node scripts/gen-readme.mjs --check` | every push and PR |
| `tools.json` is byte-exact with the pinned api release | `npm run tools:check` | when a token is available — see below |

To land a tool-surface change:

```bash
# from a local api checkout on the release you are vendoring
TRANSCODELY_API_PATH=~/git/transcodely/api npm run tools:sync
npm run readme:gen
# bump "ref" in api-pin.json to that release, and the version in
# server.json + package.json, in the same commit
npm test
```

**The honest limitation:** `transcodely/api` is a private repository, so the parity job needs
a read token in `API_REPO_TOKEN` and cannot run on a pull request from a fork. When the token
is absent the script exits 78 and the job reports *not armed* rather than passing — it never
claims a parity it did not check. The always-on checks above still catch the drift that has
actually bitten here: an export that moved while the README, the manifest and the bridge kept
the old numbers.

## Manifest

[`server.json`](./server.json) is the manifest published to the official MCP registry. Its
`version` must be bumped for a republish to take effect — the registry serves the last
published version's description, so a description edit with an unchanged version is invisible.
