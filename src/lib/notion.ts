import { Client } from "@notionhq/client";
import type {
  GetPageResponse,
  PageObjectResponse,
  QueryDatabaseParameters,
  QueryDatabaseResponse
} from "@notionhq/client/build/src/api-endpoints";
import { getSyncConfig, getTodayDateString, requireConfigValue } from "@/lib/config";

type NotionDailyPage = {
  id: string;
  title: string;
  categoryValue: string;
  dateValue?: string;
  raw: PageObjectResponse;
};

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
  const property = page.properties[propertyName];
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
  // A type guard tells TypeScript this response has page properties.
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
  const property = page.properties[propertyName];
  if (!property) {
    return "";
  }

  if (property.type === "relation") {
    // If the category is stored as a relation, resolve the related page titles first.
    const relationNames = await readRelationNames(property.relation.map((item) => item.id));
    return relationNames.join(",");
  }

  return readCategoryValue(page, propertyName);
}

function readDateValue(page: PageObjectResponse, propertyName: string): string | undefined {
  const property = page.properties[propertyName];
  if (!property) {
    return undefined;
  }

  if (property.type === "date") {
    return property.date?.start;
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

  return {
    id: page.id,
    title: readTitle(page),
    categoryValue,
    dateValue,
    raw: page
  };
}

export async function getTodayDailySnippetPages(): Promise<NotionDailyPage[]> {
  const config = getSyncConfig();
  const notion = getNotionClient();
  const today = getTodayDateString(config.syncTimezone);
  const databaseId = getNotionDatabaseId();
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined = undefined;

  do {
    // Query in pages because the Notion API may not return everything at once.
    const query: QueryDatabaseParameters = {
      database_id: databaseId,
      filter: {
        property: config.notionDateProperty,
        date: {
          equals: today
        }
      },
      sorts: [
        {
          property: config.notionDateProperty,
          direction: "ascending"
        }
      ],
      page_size: 100,
      start_cursor: cursor
    };

    const response = await notion.databases.query(query);

    pages.push(...response.results.filter(isPageObject));
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  const normalizedTargetCategory = config.notionTargetCategory.toLowerCase().replace(/\s+/g, "");

  const mappedPages = await Promise.all(
    pages.map((page) => mapNotionDailyPage(page))
  );

  return mappedPages.filter((page) => {
    // Normalize spacing/casing so minor formatting differences do not break filtering.
    const normalizedCategoryValue = page.categoryValue.replace(/\s+/g, "");
    return normalizedCategoryValue.includes(normalizedTargetCategory) && page.dateValue?.slice(0, 10) === today;
  });
}

export async function getPageBlocks(pageId: string) {
  const notion = getNotionClient();
  const blocks = [];
  let cursor: string | undefined = undefined;

  do {
    // Page blocks are also paginated, so keep fetching until there is no next cursor.
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
