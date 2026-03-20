import { getSyncConfig, requireConfigValue } from "@/lib/config";

type DailySnippetPayload = {
  content: string;
};

type PayloadValidationResult =
  | { ok: true; payload: DailySnippetPayload }
  | { ok: false; errors: string[] };

type DailySnippetResponse = {
  status: number;
  contentType: string;
  body: unknown;
};

type SendToDailySnippetOptions = {
  idempotencyKey?: string;
};

export class DailySnippetRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = "DailySnippetRequestError";
  }
}

export function isDailySnippetPayload(value: unknown): value is DailySnippetPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.content === "string"
  );
}

export function validateDailySnippetPayload(payload: unknown): PayloadValidationResult {
  if (!isDailySnippetPayload(payload)) {
    return {
      ok: false,
      errors: ["Payload shape is invalid"]
    };
  }

  const errors: string[] = [];

  if (!payload.content.trim()) {
    errors.push("content must not be empty");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    payload
  };
}

function getApiConfig() {
  const config = getSyncConfig();

  return {
    apiUrl: requireConfigValue(config.dailySnippetApiUrl, "DAILY_SNIPPET_API_URL"),
    apiKey: config.dailySnippetApiKey,
    apiKeyHeader: config.dailySnippetApiKeyHeader
  };
}

// Daily snippet API로 전송하는 기능.

export async function sendToDailySnippet(
  payload: DailySnippetPayload,
  options: SendToDailySnippetOptions = {}
): Promise<DailySnippetResponse> {
  const { apiUrl, apiKey, apiKeyHeader } = getApiConfig();

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers[apiKeyHeader] = apiKey;
  }

  if (options.idempotencyKey) {
    headers["X-Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const responseBody = typeof body === "string" ? body : JSON.stringify(body);
    throw new DailySnippetRequestError(
      `Daily snippet API request failed (${response.status}): ${responseBody}`,
      response.status,
      responseBody
    );
  }

  return {
    status: response.status,
    contentType,
    body
  };
}

export type { DailySnippetPayload, DailySnippetResponse, SendToDailySnippetOptions };
