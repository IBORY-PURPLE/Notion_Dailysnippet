import { NextResponse } from "next/server";
import { runDailySnippetSync } from "@/lib/sync";

export async function POST() {
  try {
    // Keep the route thin: it only handles HTTP and delegates the real work to sync logic.
    const result = await runDailySnippetSync();
    return NextResponse.json(result);
  } catch (error) {
    // In TypeScript, `catch` can receive any value, so we narrow it before reading `.message`.
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
