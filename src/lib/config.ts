export type SyncConfig = {
  notionApiKey: string | undefined;
  notionDatabaseId: string | undefined;
  notionDailySnippetDatabaseId: string | undefined;
  notionCategoryProperty: string;
  notionDateProperty: string;
  notionCompletedProperty: string;
  notionTargetCategory: string;
  notionScheduleTitleKeyword: string;
  notionDailySnippetPageTitle: string;
  notionWebhookSecret: string | undefined;
  syncTimezone: string;
  syncDedupeTtlSeconds: number;
  dailySnippetApiUrl: string | undefined;
  dailySnippetApiKey: string | undefined;
  dailySnippetApiKeyHeader: string;
  runtimeEnv: string;
};

function readNumberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

export function getSyncConfig(): SyncConfig {
  return {
    notionApiKey: process.env.NOTION_API_KEY,
    notionDatabaseId: process.env.NOTION_DATABASE_ID,
    notionDailySnippetDatabaseId: process.env.NOTION_DAILY_SNIPPET_DATABASE_ID ?? process.env.NOTION_DATABASE_ID,
    notionCategoryProperty: process.env.NOTION_CATEGORY_PROPERTY ?? "category",
    notionDateProperty: process.env.NOTION_DATE_PROPERTY ?? "진행날짜",
    notionCompletedProperty: process.env.NOTION_COMPLETED_PROPERTY ?? "완료",
    notionTargetCategory: process.env.NOTION_TARGET_CATEGORY ?? "daily_snippet",
    notionScheduleTitleKeyword: process.env.NOTION_SCHEDULE_TITLE_KEYWORD ?? "시간표",
    notionDailySnippetPageTitle: process.env.NOTION_DAILY_SNIPPET_PAGE_TITLE ?? "Daily_Snippet",
    notionWebhookSecret: process.env.NOTION_WEBHOOK_SECRET,
    syncTimezone: process.env.SYNC_TIMEZONE ?? "Asia/Seoul",
    syncDedupeTtlSeconds: readNumberEnv("SYNC_DEDUPE_TTL_SECONDS", 600),
    dailySnippetApiUrl: process.env.DAILY_SNIPPET_API_URL,
    dailySnippetApiKey: process.env.DAILY_SNIPPET_API_KEY,
    dailySnippetApiKeyHeader: process.env.DAILY_SNIPPET_API_KEY_HEADER ?? "Authorization",
    runtimeEnv: process.env.NODE_ENV ?? "development"
  };
}

export function requireConfigValue(value: string | undefined, envName: string): string {
  if (!value) {
    throw new Error(`Missing ${envName} in environment variables`);
  }

  return value;
}

export function getTodayDateString(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function normalizeDateString(dateValue: string): string {
  return dateValue.slice(0, 10);
}

export function isProductionEnvironment(): boolean {
  return getSyncConfig().runtimeEnv === "production";
}
