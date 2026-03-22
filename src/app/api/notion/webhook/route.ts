import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSyncConfig } from "@/lib/config";
import { reserveIdempotencyKey, releaseIdempotencyKey } from "@/lib/idempotency";
import { logError, logInfo } from "@/lib/logger";
import { runDailySnippetSync, syncNotionPageById } from "@/lib/sync";
import type { WebhookRequestMeta } from "@/lib/types";

const SUPPORTED_WEBHOOK_EVENTS = new Set([
  "page.created",
  "page.updated",
  "page.properties.updated",
  "database.updated"
]);

function parseJsonSafely(rawBody: string): unknown {
  if (!rawBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function readWebhookEventType(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.type === "string") {
    return record.type;
  }

  if (record.event && typeof record.event === "object") {
    const eventRecord = record.event as Record<string, unknown>;
    if (typeof eventRecord.type === "string") {
      return eventRecord.type;
    }
  }

  if (typeof record.action === "string") {
    return record.action;
  }

  return undefined;
}

function readWebhookPageId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  const directCandidates = [record.page_id, record.pageId, record.id];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  const nestedKeys = ["page", "data", "entity", "event"];
  for (const key of nestedKeys) {
    const nestedValue = record[key];
    if (nestedValue && typeof nestedValue === "object") {
      const nestedRecord = nestedValue as Record<string, unknown>;
      const nestedCandidates = [nestedRecord.page_id, nestedRecord.pageId, nestedRecord.id];

      for (const candidate of nestedCandidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate;
        }
      }
    }
  }

  return undefined;
}

function buildWebhookMeta(
  req: NextRequest,
  rawBody: string,
  eventType?: string,
  pageId?: string
): WebhookRequestMeta {
  const requestId =
    req.headers.get("x-webhook-id") ??
    req.headers.get("x-request-id") ??
    req.headers.get("x-notion-delivery-id") ??
    undefined;
  const dedupeSource = requestId ?? rawBody;
  const dedupeKey = createHash("sha256").update(dedupeSource).digest("hex");

  return {
    source: "notion-webhook",
    eventType,
    requestId,
    dedupeKey,
    pageId,
    receivedAt: new Date().toISOString()
  };
}

export async function POST(req: NextRequest) {
  const config = getSyncConfig();
  const dedupeTtlMs = config.syncDedupeTtlSeconds * 1000;
  let rawBody = "";

  try {
    if (config.notionWebhookSecret) {
      const incomingSecret = req.headers.get("x-webhook-secret");
      if (incomingSecret !== config.notionWebhookSecret) {
        logError("webhook.unauthorized", {
          receivedAt: new Date().toISOString()
        });

        return NextResponse.json(
          {
            ok: false,
            message: "Unauthorized webhook"
          },
          { status: 401 }
        );
      }
    }

    rawBody = await req.text();
    const payload = parseJsonSafely(rawBody);
    const eventType = readWebhookEventType(payload);
    const pageId = readWebhookPageId(payload);
    const meta = buildWebhookMeta(req, rawBody, eventType, pageId);

    logInfo("webhook.received", { ...meta, rawBody });

    if (eventType && !SUPPORTED_WEBHOOK_EVENTS.has(eventType)) {
      return NextResponse.json(
        {
          ok: true,
          message: `Ignored unsupported webhook event: ${eventType}`,
          meta
        },
        { status: 202 }
      );
    }

    if (!reserveIdempotencyKey(meta.dedupeKey, dedupeTtlMs)) {
      return NextResponse.json(
        {
          ok: true,
          message: "Duplicate webhook ignored",
          meta
        },
        { status: 202 }
      );
    }

    const result = pageId ? await syncNotionPageById(pageId) : await runDailySnippetSync();

    return NextResponse.json({
      ok: result.ok,
      message: "Webhook processed",
      meta,
      result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const payload = parseJsonSafely(rawBody);
    const meta = buildWebhookMeta(
      req,
      rawBody,
      readWebhookEventType(payload),
      readWebhookPageId(payload)
    );

    releaseIdempotencyKey(meta.dedupeKey);
    logError("webhook.failed", {
      ...meta,
      message
    });

    return NextResponse.json(
      {
        ok: false,
        message
      },
      { status: 500 }
    );
  }
}
