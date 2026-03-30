import { Client } from "@notionhq/client";
import type {
  BlockObjectResponse,
  GetPageResponse,
  PageObjectResponse,
  QueryDatabaseResponse
} from "@notionhq/client/build/src/api-endpoints";
import { getSyncConfig, normalizeDateString, requireConfigValue } from "@/lib/config";

type NotionDailyPage = {
  id: string;
  title: string;
  categoryValue: string;
  dateValue?: string;
  isCompleted: boolean;
  raw: PageObjectResponse;
};

type NotionPageMatch = {
  id: string;
  title: string;
  raw: PageObjectResponse;
};

type UpsertNotionPageInput = {
  databaseId: string;
  title: string;
  date: string;
  category: string;
  content: string;
};

type UpsertNotionPageResult = {
  pageId: string;
  title: string;
  created: boolean;
  updated: boolean;
};

const DATE_PROPERTY_FALLBACKS = ["진행날짜", "date"];
const COMPLETED_PROPERTY_FALLBACKS = ["완료", "done", "completed"];
const CATEGORY_PROPERTY_FALLBACKS = ["category", "카테고리"];

let notionClient: Client | undefined;

function getNotionClient(): Client {
  if (!notionClient) {
    notionClient = new Client({
      auth: requireConfigValue(getSyncConfig().notionApiKey, "NOTION_API_KEY")
    });
  }

  return notionClient;
}

function getNotionDatabaseId(): string {
  return requireConfigValue(getSyncConfig().notionDatabaseId, "NOTION_DATABASE_ID");
}

function getDailySnippetDatabaseId(): string {
  return requireConfigValue(getSyncConfig().notionDailySnippetDatabaseId, "NOTION_DAILY_SNIPPET_DATABASE_ID");
}

function isPageResponse(response: GetPageResponse): response is PageObjectResponse {
  return "properties" in response;
}

function isPageObject(result: QueryDatabaseResponse["results"][number]): result is PageObjectResponse {
  return "properties" in result;
}

function readTitle(page: PageObjectResponse): string {
  const titleProperty = Object.values(page.properties).find((property) => property.type === "title");

  if (!titleProperty || titleProperty.type !== "title") {
    return "Untitled";
  }

  return titleProperty.title.map((item) => item.plain_text).join("") || "Untitled";
}

function findProperty(page: PageObjectResponse, propertyName: string, fallbacks: string[]) {
  const candidateNames = [propertyName, ...fallbacks];

  for (const candidateName of candidateNames) {
    const property = page.properties[candidateName];

    if (property) {
      return property;
    }
  }

  return undefined;
}

function readDateValue(page: PageObjectResponse, propertyName: string): string | undefined {
  const property = findProperty(page, propertyName, DATE_PROPERTY_FALLBACKS);

  if (!property || property.type !== "date") {
    return undefined;
  }

  return property.date?.start;
}

function readCheckboxValue(page: PageObjectResponse, propertyName: string): boolean {
  const property = findProperty(page, propertyName, COMPLETED_PROPERTY_FALLBACKS);
  return property?.type === "checkbox" ? property.checkbox : false;
}

function readCategoryValueSync(page: PageObjectResponse, propertyName: string): string {
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

async function readRelationNames(relationIds: string[]): Promise<string[]> {
  const notion = getNotionClient();
  const names = await Promise.all(
    relationIds.map(async (relationId) => {
      try {
        const response = await notion.pages.retrieve({
          page_id: relationId
        });

        return isPageResponse(response) ? readTitle(response) : "";
      } catch {
        return "";
      }
    })
  );

  return names.filter(Boolean);
}

async function readCategoryValue(page: PageObjectResponse, propertyName: string): Promise<string> {
  const property = findProperty(page, propertyName, CATEGORY_PROPERTY_FALLBACKS);

  if (!property) {
    return "";
  }

  if (property.type === "relation") {
    const relationNames = await readRelationNames(property.relation.map((item) => item.id));
    return relationNames.join(",");
  }

  return readCategoryValueSync(page, propertyName);
}

async function mapNotionDailyPage(page: PageObjectResponse): Promise<NotionDailyPage> {
  const config = getSyncConfig();

  return {
    id: page.id,
    title: readTitle(page),
    categoryValue: (await readCategoryValue(page, config.notionCategoryProperty)).toLowerCase(),
    dateValue: readDateValue(page, config.notionDateProperty),
    isCompleted: readCheckboxValue(page, config.notionCompletedProperty),
    raw: page
  };
}

async function getAllDatabasePages(databaseId: string): Promise<PageObjectResponse[]> {
  const notion = getNotionClient();
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 100,
      start_cursor: cursor
    });

    pages.push(...response.results.filter(isPageObject));
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return pages;
}

export async function getTodayDailySnippetPages(): Promise<NotionDailyPage[]> {
  const config = getSyncConfig();
  const pages = await getAllDatabasePages(getNotionDatabaseId());
  const mappedPages = await Promise.all(pages.map((page) => mapNotionDailyPage(page)));
  const normalizedTargetCategory = config.notionTargetCategory.toLowerCase().replace(/\s+/g, "");

  return mappedPages.filter((page) => {
    const normalizedCategoryValue = page.categoryValue.replace(/\s+/g, "");
    return normalizedCategoryValue.includes(normalizedTargetCategory) && page.isCompleted && Boolean(page.dateValue);
  });
}

export async function getPageBlocks(pageId: string): Promise<BlockObjectResponse[]> {
  const notion = getNotionClient();
  const blocks: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const result = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100
    });

    blocks.push(...result.results.filter((block): block is BlockObjectResponse => "type" in block));
    cursor = result.has_more ? result.next_cursor ?? undefined : undefined;
  } while (cursor);

  return blocks;
}

export async function getNotionPageById(pageId: string): Promise<NotionDailyPage | null> {
  try {
    const response = await getNotionClient().pages.retrieve({
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

export async function findNotionPageByExactTitle(databaseId: string, title: string): Promise<NotionPageMatch | null> {
  const pages = await getAllDatabasePages(databaseId);
  const match = pages.find((page) => readTitle(page) === title);

  if (!match) {
    return null;
  }

  return {
    id: match.id,
    title,
    raw: match
  };
}

export async function findSchedulePageForDate(date: string): Promise<NotionPageMatch | null> {
  const config = getSyncConfig();
  const normalizedDate = normalizeDateString(date);
  const keyword = config.notionScheduleTitleKeyword.toLowerCase();
  const pages = await getAllDatabasePages(getNotionDatabaseId());
  const candidates = await Promise.all(
    pages.map(async (page) => ({
      page,
      mapped: await mapNotionDailyPage(page)
    }))
  );

  const matched = candidates
    .filter(({ mapped }) => normalizeDateString(mapped.dateValue ?? "") === normalizedDate)
    .find(({ mapped }) => mapped.title.toLowerCase().includes(keyword) && !mapped.categoryValue.includes(config.notionTargetCategory.toLowerCase()));

  if (!matched) {
    return null;
  }

  return {
    id: matched.page.id,
    title: matched.mapped.title,
    raw: matched.page
  };
}

export async function findDailySnippetPageForDate(date: string): Promise<NotionPageMatch | null> {
  const config = getSyncConfig();
  const normalizedDate = normalizeDateString(date);
  const pages = await getAllDatabasePages(getDailySnippetDatabaseId());
  const candidates = await Promise.all(
    pages.map(async (page) => ({
      page,
      mapped: await mapNotionDailyPage(page)
    }))
  );

  const normalizedTargetCategory = config.notionTargetCategory.toLowerCase().replace(/\s+/g, "");
  const matched = candidates.find(({ mapped }) => {
    const categoryValue = mapped.categoryValue.replace(/\s+/g, "");
    return normalizeDateString(mapped.dateValue ?? "") === normalizedDate && categoryValue.includes(normalizedTargetCategory);
  });

  if (!matched) {
    return null;
  }

  return {
    id: matched.page.id,
    title: matched.mapped.title,
    raw: matched.page
  };
}

function buildRichTextContent(content: string) {
  const chunks = content.match(/[\s\S]{1,1800}/g) ?? [content];

  return chunks.map((chunk) => ({
    type: "text" as const,
    text: {
      content: chunk
    }
  }));
}

function createTextBlock(type: "paragraph" | "heading_1" | "heading_2" | "bulleted_list_item", content: string) {
  return {
    object: "block" as const,
    type,
    [type]: {
      rich_text: buildRichTextContent(content)
    }
  };
}

function createTodoBlock(content: string, checked: boolean) {
  return {
    object: "block" as const,
    type: "to_do" as const,
    to_do: {
      rich_text: buildRichTextContent(content),
      checked
    }
  };
}

function markdownToBlocks(markdown: string) {
  const blocks: Array<Record<string, unknown>> = [];

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push(createTextBlock("heading_1", line.slice(2).trim()));
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push(createTextBlock("heading_2", line.slice(3).trim()));
      continue;
    }

    if (line.startsWith("- [ ] ")) {
      blocks.push(createTodoBlock(line.slice(6).trim(), false));
      continue;
    }

    if (line.startsWith("- [x] ") || line.startsWith("- [X] ")) {
      blocks.push(createTodoBlock(line.slice(6).trim(), true));
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push(createTextBlock("bulleted_list_item", line.slice(2).trim()));
      continue;
    }

    blocks.push(createTextBlock("paragraph", line));
  }

  return blocks;
}

async function replacePageContent(pageId: string, markdown: string): Promise<void> {
  const notion = getNotionClient();
  const existingBlocks = await getPageBlocks(pageId);

  for (const block of existingBlocks) {
    await notion.blocks.delete({
      block_id: block.id
    });
  }

  const blocks = markdownToBlocks(markdown);

  for (let index = 0; index < blocks.length; index += 100) {
    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks.slice(index, index + 100) as never
    });
  }
}

async function getDatabaseTitlePropertyName(databaseId: string): Promise<string> {
  const notion = getNotionClient();
  const database = await notion.databases.retrieve({
    database_id: databaseId
  });
  const properties = "properties" in database ? database.properties : {};
  const titlePropertyName = Object.entries(properties).find(([, property]) => property.type === "title")?.[0];

  if (!titlePropertyName) {
    throw new Error("Notion database is missing a title property");
  }

  return titlePropertyName;
}

async function buildPageProperties(databaseId: string, title: string, date: string, category: string): Promise<Record<string, never>> {
  const notion = getNotionClient();
  const config = getSyncConfig();
  const database = await notion.databases.retrieve({
    database_id: databaseId
  });
  const properties = "properties" in database ? database.properties : {};
  const titlePropertyName = await getDatabaseTitlePropertyName(databaseId);
  const pageProperties: Record<string, unknown> = {
    [titlePropertyName]: {
      title: [
        {
          type: "text",
          text: {
            content: title
          }
        }
      ]
    }
  };

  const dateProperty = properties[config.notionDateProperty];

  if (dateProperty?.type === "date") {
    pageProperties[config.notionDateProperty] = {
      date: {
        start: date
      }
    };
  }

  const categoryProperty = properties[config.notionCategoryProperty];

  if (categoryProperty?.type === "select") {
    pageProperties[config.notionCategoryProperty] = {
      select: {
        name: category
      }
    };
  } else if (categoryProperty?.type === "multi_select") {
    pageProperties[config.notionCategoryProperty] = {
      multi_select: [
        {
          name: category
        }
      ]
    };
  } else if (categoryProperty?.type === "rich_text") {
    pageProperties[config.notionCategoryProperty] = {
      rich_text: [
        {
          type: "text",
          text: {
            content: category
          }
        }
      ]
    };
  }

  const completedProperty = properties[config.notionCompletedProperty];

  if (completedProperty?.type === "checkbox") {
    pageProperties[config.notionCompletedProperty] = {
      checkbox: false
    };
  }

  return pageProperties as Record<string, never>;
}

export async function findSchedulePageByTitle(title: string): Promise<NotionPageMatch | null> {
  return findNotionPageByExactTitle(getNotionDatabaseId(), title);
}

export async function upsertDailySnippetPage(input: UpsertNotionPageInput): Promise<UpsertNotionPageResult> {
  const notion = getNotionClient();
  const existingPage = await findDailySnippetPageForDate(input.date);
  const properties = await buildPageProperties(input.databaseId, input.title, input.date, input.category);

  if (!existingPage) {
    const createdPage = await notion.pages.create({
      parent: {
        database_id: input.databaseId
      },
      properties
    });

    if (!("id" in createdPage) || typeof createdPage.id !== "string") {
      throw new Error("Failed to create daily_snippet page");
    }

    await replacePageContent(createdPage.id, input.content);

    return {
      pageId: createdPage.id,
      title: input.title,
      created: true,
      updated: false
    };
  }

  await notion.pages.update({
    page_id: existingPage.id,
    properties
  });
  await replacePageContent(existingPage.id, input.content);

  return {
    pageId: existingPage.id,
    title: input.title,
    created: false,
    updated: true
  };
}

export function getDailySnippetTargetDatabaseId() {
  return getDailySnippetDatabaseId();
}

export async function checkNotionConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await getNotionClient().databases.retrieve({
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
