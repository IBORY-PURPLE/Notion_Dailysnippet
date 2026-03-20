export type SyncFailureReason =
  | "MARKDOWN_CONVERSION_FAILED"
  | "PAYLOAD_VALIDATION_FAILED"
  | "DELIVERY_FAILED";

export type SyncResultStatus = "synced" | "failed" | "skipped";

export type SyncResult = {
  notionPageId: string;
  title: string;
  date: string;
  category: string;
  status: SyncResultStatus;
  reason?: SyncFailureReason;
  message?: string;
  apiStatus?: number;
};

export type SyncSummary = {
  ok: boolean;
  message: string;
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  results: SyncResult[];
};

export type WebhookRequestMeta = {
  source: "notion-webhook";
  eventType?: string;
  requestId?: string;
  dedupeKey: string;
  pageId?: string;
  receivedAt: string;
};
