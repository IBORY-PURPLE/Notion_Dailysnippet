---
name: notion-daily-snippet
description: Create or update a `daily_snippet` page from today's schedule page in Notion, then optionally send the generated content to the Daily Snippet server while preserving the existing webhook-based "completed page -> POST request" flow. Use when Codex needs to run the daily snippet generation workflow manually, validate today's source page, dry-run the generated content, or troubleshoot the Notion-to-snippet orchestration.
---

# Notion Daily Snippet

Keep the existing webhook flow unchanged. Treat this skill as an additional manual or semi-automatic entrypoint.

## Follow This Workflow

1. Confirm the target date.
2. Find the source page for the target date using date metadata first, then narrow by the schedule title keyword.
3. Read the source page content and extract the material needed for the snippet.
4. Find an existing `daily_snippet` page for that date or create one if missing.
5. Fill or update the target page content.
6. If requested, send the final content to the Daily Snippet server.
7. Return a short execution summary with source page, target page, and send status.

## Keep Responsibilities Separate

- Keep webhook behavior as-is.
- Use the app code for business logic when possible.
- Use this skill to orchestrate the run, not to embed large amounts of one-off logic in the prompt.
- Prefer a fixed script or API entrypoint over ad hoc MCP/tool sequences when the repository already exposes reusable code.

## Execution Rules

- Default to `dry-run` first unless the user clearly asks to write to Notion or send to the server.
- Before creating a new `daily_snippet` page, check whether one already exists for the same date.
- If the source schedule page is missing, stop and report that clearly.
- If the generated content is empty or structurally broken, do not write or send it.
- If server delivery fails, do not silently mark the workflow successful.
- Preserve idempotency behavior for outbound delivery when the application already provides it.

## Required Inputs

Collect or infer these values before execution:

- Target date in `Asia/Seoul` unless the user says otherwise
- Source page lookup rule for the daily schedule page
- Target Notion database or page location for `daily_snippet`
- Whether to `dry-run`, `write`, and `send`

## Preferred App Interfaces

Prefer these internal boundaries:

- `usecases/generateTodaySnippet`
- `notion/scheduleRepo`
- `notion/dailySnippetRepo`
- `clients/dailySnippetClient`
- `POST /api/generate-today-snippet`

If those modules do not exist yet, recommend or create them before expanding this skill further.

## Repository Entry Point

Use the repository's generation endpoint when the local app server is running.

- `POST /api/generate-today-snippet`
- Request body:
  - `date?: string`
  - `dryRun?: boolean`
  - `sendToServer?: boolean`

Prefer these modes:

- Dry run: `{"dryRun": true}`
- Write only: `{"dryRun": false, "sendToServer": false}`
- Write and send: `{"dryRun": false, "sendToServer": true}`

## Output Format

Return a compact summary with:

- target date
- source page title or id
- target `daily_snippet` page title or id
- created or updated status
- sent or skipped status
- failure reason if any

## Troubleshooting

- If the webhook flow works but this skill does not, compare the source of truth used by each path.
- If the wrong page is selected, inspect the date property and schedule title keyword first.
- If duplicate target pages appear, tighten the date-based lookup before page creation.
- If content quality is poor, fix the transformation layer rather than adding prompt-only patch logic here.
