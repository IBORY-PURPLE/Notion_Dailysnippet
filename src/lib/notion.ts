import { Client } from "@notionhq/client";
import type {
  GetPageResponse,
  PageObjectResponse,
  QueryDatabaseResponse
} from "@notionhq/client/build/src/api-endpoints";
import { getSyncConfig, requireConfigValue } from "@/lib/config";

type NotionDailyPage = {
  id: string;
  title: string;
  categoryValue: string;
  dateValue?: string;
  isCompleted: boolean;
  raw: PageObjectResponse;
};

const DATE_PROPERTY_FALLBACKS = ["진행날짜", "date"];
const COMPLETED_PROPERTY_FALLBACKS = ["완료", "done", "completed"];
const CATEGORY_PROPERTY_FALLBACKS = ["category", "카테고리"];

let notionClient: Client | undefined;

function getNotionClient(): Client {
  if (!notionClient) {
    // Create the client once and reuse it for later calls.
    notionClient = new Client({
      auth: requireConfigValue(getSyncConfig().notionApiKey, "NOTION_API_KEY")
    });
  }

  return notionClient;
}

function getNotionDatabaseId(): string {
  return requireConfigValue(getSyncConfig().notionDatabaseId, "NOTION_DATABASE_ID");
}

function readTitle(page: PageObjectResponse): string {
  // Find the property whose type is `title`, then join its text fragments.
  const titleProperty = Object.values(page.properties).find((property) => property.type === "title");

  if (!titleProperty || titleProperty.type !== "title") {
    return "Untitled";
  }

  return titleProperty.title.map((item) => item.plain_text).join("") || "Untitled";
}

function readCategoryValue(page: PageObjectResponse, propertyName: string): string {
  const property = findProperty(page, propertyName, CATEGORY_PROPERTY_FALLBACKS);
  if (!property) {
    return "";
  }

  if (property.type === "select") {
    return property.select?.name ?? "";
  }

  if (property.type === "multi_select") {
    return property.multi_select.map((item) => item.name).join(",");
  }

  if (property.type === "rich_text") {
    return property.rich_text.map((item) => item.plain_text).join("");
  }

  return "";
}

function isPageResponse(response: GetPageResponse): response is PageObjectResponse {
  return "properties" in response;
}

async function readRelationNames(relationIds: string[]): Promise<string[]> {
  const notion = getNotionClient();
  const relationNames = await Promise.all(
    relationIds.map(async (relationId) => {
      try {
        const relationPage = await notion.pages.retrieve({ page_id: relationId });

        if (!isPageResponse(relationPage)) {
          return "";
        }

        return readTitle(relationPage);
      } catch {
        return "";
      }
    })
  );

  return relationNames.filter(Boolean);
}

async function readCategoryValueAsync(page: PageObjectResponse, propertyName: string): Promise<string> {
  const property = findProperty(page, propertyName, CATEGORY_PROPERTY_FALLBACKS);
  if (!property) {
    return "";
  }

  if (property.type === "relation") {
    const relationNames = await readRelationNames(property.relation.map((item) => item.id));
    return relationNames.join(",");
  }

  return readCategoryValue(page, propertyName);
}

function readDateValue(page: PageObjectResponse, propertyName: string): string | undefined {
  const property = findProperty(page, propertyName, DATE_PROPERTY_FALLBACKS);
  if (!property) {
    return undefined;
  }

  if (property.type === "date") {
    return property.date?.start;
  }

  return undefined;
}

function readCheckboxValue(page: PageObjectResponse, propertyName: string): boolean {
  const property = findProperty(page, propertyName, COMPLETED_PROPERTY_FALLBACKS);
  return property?.type === "checkbox" ? property.checkbox : false;
}

function findProperty(
  page: PageObjectResponse,
  propertyName: string,
  fallbacks: string[]
) {
  const candidateNames = [propertyName, ...fallbacks];

  for (const candidateName of candidateNames) {
    const property = page.properties[candidateName];
    if (property) {
      return property;
    }
  }

  return undefined;
}

function isPageObject(result: QueryDatabaseResponse["results"][number]): result is PageObjectResponse {
  return "properties" in result;
}

async function mapNotionDailyPage(page: PageObjectResponse): Promise<NotionDailyPage> {
  const config = getSyncConfig();
  const categoryValue = (await readCategoryValueAsync(page, config.notionCategoryProperty)).toLowerCase();
  const dateValue = readDateValue(page, config.notionDateProperty);
  const isCompleted = readCheckboxValue(page, config.notionCompletedProperty);

  return {
    id: page.id,
    title: readTitle(page),
    categoryValue,
    dateValue,
    isCompleted,
    raw: page
  };
}

export async function getTodayDailySnippetPages(): Promise<NotionDailyPage[]> {
  const config = getSyncConfig();
  const notion = getNotionClient();
  const databaseId = getNotionDatabaseId();
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined = undefined;

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      sorts: [
        {
          timestamp: "last_edited_time",
          direction: "descending"
        }
      ],
      page_size: 100,
      start_cursor: cursor
    });

    pages.push(...response.results.filter(isPageObject));
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  const normalizedTargetCategory = config.notionTargetCategory.toLowerCase().replace(/\s+/g, "");

  const mappedPages = await Promise.all(
    pages.map((page) => mapNotionDailyPage(page))
  );

  return mappedPages.filter((page) => {
    const normalizedCategoryValue = page.categoryValue.replace(/\s+/g, "");
    return normalizedCategoryValue.includes(normalizedTargetCategory) && page.isCompleted && Boolean(page.dateValue);
  });
}

export async function getPageBlocks(pageId: string) {
  const notion = getNotionClient();
  const blocks = [];
  let cursor: string | undefined = undefined;

  do {
    const result = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100
    });

    blocks.push(...result.results);
    cursor = result.has_more ? result.next_cursor ?? undefined : undefined;
  } while (cursor);

  return blocks;
}

export async function getNotionPageById(pageId: string): Promise<NotionDailyPage | null> {
  try {
    const notion = getNotionClient();
    const response = await notion.pages.retrieve({
      page_id: pageId
    });

    if (!isPageResponse(response)) {
      return null;
    }

    return mapNotionDailyPage(response);
  } catch {
    return null;
  }
}

export async function checkNotionConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const notion = getNotionClient();
    await notion.databases.retrieve({
      database_id: getNotionDatabaseId()
    });

    return {
      ok: true,
      message: "Notion database connection is healthy"
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown Notion connection error"
    };
  }
}

export { getNotionClient };
export type { NotionDailyPage };
