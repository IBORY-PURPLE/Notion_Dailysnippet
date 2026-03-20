import { NextResponse } from "next/server";
import { convertPageToMarkdown } from "@/lib/notionToMarkdown";
import { getTodayDailySnippetPages } from "@/lib/notion";

function todayDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.SYNC_TIMEZONE ?? "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export async function GET() {
  try {
    const pages = await getTodayDailySnippetPages();

    const results = await Promise.all(
      pages.map(async (page) => ({
        notionPageId: page.id,
        title: page.title,
        date: page.dateValue?.slice(0, 10) ?? todayDateString(),
        category: page.categoryValue,
        contentMarkdown: await convertPageToMarkdown(page.id)
      }))
    );

    return NextResponse.json({
      ok: true,
      count: results.length,
      pages: results
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
