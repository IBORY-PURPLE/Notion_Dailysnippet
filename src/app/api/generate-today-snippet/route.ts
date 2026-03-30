import { NextRequest, NextResponse } from "next/server";
import { generateTodaySnippet } from "@/lib/usecases/generateTodaySnippet";

type GenerateTodaySnippetRequest = {
  date?: string;
  dryRun?: boolean;
  sendToServer?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as GenerateTodaySnippetRequest;
    const result = await generateTodaySnippet({
      date: body.date,
      dryRun: body.dryRun,
      sendToServer: body.sendToServer
    });

    return NextResponse.json(result);
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
