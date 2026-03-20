import { getTodayDateString, normalizeDateString, getSyncConfig } from "@/lib/config";
import { sendToDailySnippet, validateDailySnippetPayload, type DailySnippetPayload } from "@/lib/dailySnippet";
import { reserveIdempotencyKey, releaseIdempotencyKey } from "@/lib/idempotency";
import { logError, logInfo } from "@/lib/logger";
import { getNotionPageById, getTodayDailySnippetPages, type NotionDailyPage } from "@/lib/notion";
import { convertPageToMarkdown } from "@/lib/notionToMarkdown";
import type { SyncFailureReason, SyncResult, SyncSummary } from "@/lib/types";

function createFailedResult(
  payload: Omit<SyncResult, "status">,
  reason: SyncFailureReason,
  message: string,
  apiStatus?: number
): SyncResult {
  return {
    ...payload,
    status: "failed",
    reason,
    message,
    apiStatus
  };
}

function isEligibleDailySnippetPage(page: NotionDailyPage, targetCategory: string, today: string): boolean {
  const normalizedCategoryValue = page.categoryValue.replace(/\s+/g, "");
  const normalizedTargetCategory = targetCategory.toLowerCase().replace(/\s+/g, "");

  return normalizedCategoryValue.includes(normalizedTargetCategory) && page.dateValue?.slice(0, 10) === today;
}

async function syncPages(targetPages: NotionDailyPage[], emptyMessage: string): Promise<SyncSummary> {
  const config = getSyncConfig();
  const today = getTodayDateString(config.syncTimezone);
  const dedupeTtlMs = config.syncDedupeTtlSeconds * 1000;

  // Log the sync start so we can trace which date/config this run used.
  logInfo("sync.start", {
    today,
    timezone: config.syncTimezone,
    targetCategory: config.notionTargetCategory
  });

  logInfo("sync.pages.loaded", {
    count: targetPages.length
  });

  if (targetPages.length === 0) {
    // No matching page is a valid outcome, not necessarily an error.
    logInfo("sync.complete", {
      syncedCount: 0,
      failedCount: 0,
      skippedCount: 0
    });

    return {
      ok: true,
      message: emptyMessage,
      syncedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: []
    };
  }

  const results: SyncResult[] = [];

  for (const page of targetPages) {
    // Normalize the date once so later result objects and dedupe keys stay consistent.
    const normalizedDate = normalizeDateString(page.dateValue ?? today);
    const baseResult = {
      notionPageId: page.id,
      title: page.title,
      date: normalizedDate,
      category: config.notionTargetCategory
    };

    logInfo("sync.page.start", {
      notionPageId: page.id,
      title: page.title
    });

    let markdown: string;

    try {
      // Convert the Notion page body into Markdown before sending it anywhere else.
      markdown = await convertPageToMarkdown(page.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown markdown conversion error";
      const failedResult = createFailedResult(baseResult, "MARKDOWN_CONVERSION_FAILED", message);

      results.push(failedResult);
      logError("sync.page.markdown_failed", failedResult);
      continue;
    }

    const payload: DailySnippetPayload = {
      content: markdown
    };

    // Validate the payload before making a network request.
    const validation = validateDailySnippetPayload(payload);

    if (!validation.ok) {
      const failedResult = createFailedResult(
        baseResult,
        "PAYLOAD_VALIDATION_FAILED",
        validation.errors.join("; ")
      );

      results.push(failedResult);
      logError("sync.page.payload_invalid", failedResult);
      continue;
    }

    const idempotencyKey = `${page.id}:${normalizedDate}`;

    // Prevent duplicate sends for the same page/date during a short time window.
    if (!reserveIdempotencyKey(idempotencyKey, dedupeTtlMs)) {
      const skippedResult: SyncResult = {
        ...baseResult,
        status: "skipped",
        message: "Skipped duplicate sync attempt",
        apiStatus: 202
      };

      results.push(skippedResult);
      logInfo("sync.page.duplicate_skipped", {
        ...skippedResult,
        idempotencyKey
      });
      continue;
    }

    try {
      // This is the actual delivery step to the Daily Snippet API.
      const response = await sendToDailySnippet(validation.payload, {
        idempotencyKey
      });
      const successResult: SyncResult = {
        ...baseResult,
        status: "synced",
        apiStatus: response.status
      };

      results.push(successResult);
      logInfo("sync.page.synced", {
        ...successResult,
        idempotencyKey,
        responseContentType: response.contentType
      });
    } catch (error) {
      // Release the dedupe key on failure so a retry is still possible.
      releaseIdempotencyKey(idempotencyKey);

      const apiStatus =
        error instanceof Error && "status" in error && typeof error.status === "number"
          ? error.status
          : undefined;
      const message = error instanceof Error ? error.message : "Unknown delivery error";
      const failedResult = createFailedResult(baseResult, "DELIVERY_FAILED", message, apiStatus);

      results.push(failedResult);
      logError("sync.page.delivery_failed", {
        ...failedResult,
        idempotencyKey
      });
    }
  }

  // Build summary counts from the per-page results.
  const syncedCount = results.filter((result) => result.status === "synced").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const skippedCount = results.filter((result) => result.status === "skipped").length;

  logInfo("sync.complete", {
    syncedCount,
    failedCount,
    skippedCount
  });

  return {
    ok: failedCount === 0,
    message: failedCount === 0 ? "Sync completed successfully" : "Sync completed with partial failures",
    syncedCount,
    failedCount,
    skippedCount,
    results
  };
}

export async function runDailySnippetSync(): Promise<SyncSummary> {
  const pages = await getTodayDailySnippetPages();

  return syncPages(pages, "No page matched today's daily_snippet condition");
}

export async function syncNotionPageById(pageId: string): Promise<SyncSummary> {
  const config = getSyncConfig();
  const today = getTodayDateString(config.syncTimezone);
  const page = await getNotionPageById(pageId);

  if (!page) {
    return {
      ok: false,
      message: "Webhook page could not be loaded from Notion",
      syncedCount: 0,
      failedCount: 1,
      skippedCount: 0,
      results: [
        {
          notionPageId: pageId,
          title: "Unknown",
          date: today,
          category: config.notionTargetCategory,
          status: "failed",
          reason: "MARKDOWN_CONVERSION_FAILED",
          message: "Webhook page could not be loaded from Notion"
        }
      ]
    };
  }

  if (!isEligibleDailySnippetPage(page, config.notionTargetCategory, today)) {
    return {
      ok: true,
      message: "Webhook page did not match today's daily_snippet condition",
      syncedCount: 0,
      failedCount: 0,
      skippedCount: 1,
      results: [
        {
          notionPageId: page.id,
          title: page.title,
          date: normalizeDateString(page.dateValue ?? today),
          category: config.notionTargetCategory,
          status: "skipped",
          message: "Webhook page did not match today's daily_snippet condition",
          apiStatus: 202
        }
      ]
    };
  }

  return syncPages([page], "No eligible webhook page matched the sync condition");
}
