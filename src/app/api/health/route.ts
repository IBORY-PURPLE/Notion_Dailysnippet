import { NextResponse } from "next/server";
import { checkNotionConnection } from "@/lib/notion";
import { getSyncConfig } from "@/lib/config";

export async function GET() {
  const config = getSyncConfig();

  const requiredEnvChecks = {
    NOTION_API_KEY: Boolean(config.notionApiKey),
    NOTION_DATABASE_ID: Boolean(config.notionDatabaseId),
    DAILY_SNIPPET_API_URL: Boolean(config.dailySnippetApiUrl)
  };

  const missingEnv = Object.entries(requiredEnvChecks)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  const notion =
    missingEnv.includes("NOTION_API_KEY") || missingEnv.includes("NOTION_DATABASE_ID")
      ? {
          ok: false,
          message: "Skipped Notion connection check because required env vars are missing"
        }
      : await checkNotionConnection();

  const dailySnippet = {
    ok: Boolean(config.dailySnippetApiUrl),
    message: config.dailySnippetApiUrl
      ? "Daily snippet API URL is configured"
      : "Missing DAILY_SNIPPET_API_URL"
  };

  return NextResponse.json({
    ok: missingEnv.length === 0 && notion.ok && dailySnippet.ok,
    environment: config.runtimeEnv,
    checks: {
      env: {
        ok: missingEnv.length === 0,
        missing: missingEnv
      },
      notion,
      dailySnippet
    }
  });
}
