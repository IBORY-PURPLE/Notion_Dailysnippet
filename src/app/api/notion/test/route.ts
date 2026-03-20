import { NextResponse } from "next/server";
import { isProductionEnvironment, requireConfigValue, getSyncConfig } from "@/lib/config";

function validateEnv() {
  const config = getSyncConfig();

  return {
    notionApiKey: requireConfigValue(config.notionApiKey, "NOTION_API_KEY"),
    notionDatabaseId: requireConfigValue(config.notionDatabaseId, "NOTION_DATABASE_ID")
  };
}

async function queryNotionDatabase() {
  const { notionApiKey, notionDatabaseId } = validateEnv();

  const response = await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  const data = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

function createNotFoundResponse() {
  return NextResponse.json(
    {
      ok: false,
      message: "Not found"
    },
    { status: 404 }
  );
}

export async function GET() {
  if (isProductionEnvironment()) {
    return createNotFoundResponse();
  }

  try {
    const result = await queryNotionDatabase();

    return NextResponse.json(result, {
      status: result.ok ? 200 : result.status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        message
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  if (isProductionEnvironment()) {
    return createNotFoundResponse();
  }

  return GET();
}
