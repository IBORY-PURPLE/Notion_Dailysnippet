import { NotionToMarkdown } from "notion-to-md";
import { getNotionClient } from "@/lib/notion";

export async function convertPageToMarkdown(pageId: string): Promise<string> {
  // Reuse the project's Notion client so this converter uses the same API settings.
  const n2m = new NotionToMarkdown({ notionClient: getNotionClient() });

  // `await` pauses here until the Notion API returns the page blocks.
  const mdBlocks = await n2m.pageToMarkdown(pageId);

  // The library returns an object, and `parent` is the actual Markdown body we want.
  return n2m.toMarkdownString(mdBlocks).parent;
}
