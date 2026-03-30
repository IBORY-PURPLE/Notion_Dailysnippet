import { getTodayDateString, getSyncConfig, normalizeDateString } from "@/lib/config";
import { sendToDailySnippet, validateDailySnippetPayload } from "@/lib/dailySnippet";
import {
  findSchedulePageForDate,
  getDailySnippetTargetDatabaseId,
  upsertDailySnippetPage
} from "@/lib/notion";
import { convertPageToMarkdown } from "@/lib/notionToMarkdown";

export type GenerateTodaySnippetOptions = {
  date?: string;
  dryRun?: boolean;
  sendToServer?: boolean;
};

export type GenerateTodaySnippetResult = {
  ok: boolean;
  mode: "dry-run" | "write";
  sent: boolean;
  date: string;
  sourcePageTitle: string;
  sourcePageId: string;
  targetPageTitle: string;
  targetPageId?: string;
  created?: boolean;
  updated?: boolean;
  content: string;
  message: string;
  apiStatus?: number;
};

function buildDailySnippetTitle(date: string): string {
  const config = getSyncConfig();
  return config.notionDailySnippetPageTitle;
}

function buildGeneratedContent(date: string, sourcePageTitle: string, sourceMarkdown: string): string {
  const trimmedMarkdown = sourceMarkdown.trim();

  return [
    `# ${date} daily_snippet`,
    "",
    "## Source",
    `- Schedule page: ${sourcePageTitle}`,
    "",
    "## Schedule",
    trimmedMarkdown || "_No content found in the source schedule page._"
  ].join("\n");
}

export async function generateTodaySnippet(
  options: GenerateTodaySnippetOptions = {}
): Promise<GenerateTodaySnippetResult> {
  const config = getSyncConfig();
  const targetDate = normalizeDateString(options.date ?? getTodayDateString(config.syncTimezone));
  const targetPageTitle = buildDailySnippetTitle(targetDate);
  const sourcePage = await findSchedulePageForDate(targetDate);

  if (!sourcePage) {
    throw new Error(`Source schedule page not found for date ${targetDate}`);
  }

  const sourceMarkdown = await convertPageToMarkdown(sourcePage.id);
  const content = buildGeneratedContent(targetDate, sourcePage.title, sourceMarkdown);
  const validation = validateDailySnippetPayload({ content });

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  const dryRun = options.dryRun ?? true;

  if (dryRun) {
    return {
      ok: true,
      mode: "dry-run",
      sent: false,
      date: targetDate,
      sourcePageTitle: sourcePage.title,
      sourcePageId: sourcePage.id,
      targetPageTitle,
      content,
      message: "Dry run completed without writing to Notion or sending to the server"
    };
  }

  const targetPage = await upsertDailySnippetPage({
    databaseId: getDailySnippetTargetDatabaseId(),
    title: targetPageTitle,
    date: targetDate,
    category: config.notionTargetCategory,
    content
  });

  if (!options.sendToServer) {
    return {
      ok: true,
      mode: "write",
      sent: false,
      date: targetDate,
      sourcePageTitle: sourcePage.title,
      sourcePageId: sourcePage.id,
      targetPageTitle: targetPage.title,
      targetPageId: targetPage.pageId,
      created: targetPage.created,
      updated: targetPage.updated,
      content,
      message: "daily_snippet page created or updated in Notion"
    };
  }

  const response = await sendToDailySnippet(validation.payload, {
    idempotencyKey: `generated:${targetPage.pageId}:${targetDate}`
  });

  return {
    ok: response.date === targetDate,
    mode: "write",
    sent: true,
    date: targetDate,
    sourcePageTitle: sourcePage.title,
    sourcePageId: sourcePage.id,
    targetPageTitle: targetPage.title,
    targetPageId: targetPage.pageId,
    created: targetPage.created,
    updated: targetPage.updated,
    content,
    message:
      response.date === targetDate
        ? "daily_snippet page updated and sent to the Daily Snippet server"
        : `Server response date mismatch: expected ${targetDate}, received ${response.date ?? "unknown"}`,
    apiStatus: response.status
  };
}
