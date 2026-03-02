import type { Metadata } from "next";
import { getFilesChangeLogFeed, type FilesChangeLogFeedItem } from "@/lib/db";
import LogPageClient from "./page-client";

const INITIAL_PAGE_SIZE = 20;

export const metadata: Metadata = {
  title: "Change Log",
  description: "Recent database-backed file changes feed.",
  alternates: {
    canonical: "/log",
  },
};

export const dynamic = "force-dynamic";

export default async function LogPage() {
  let initialItems: FilesChangeLogFeedItem[] = [];
  let initialHasMore = false;
  let initialError: string | null = null;

  try {
    const feed = await getFilesChangeLogFeed({
      limit: INITIAL_PAGE_SIZE + 1,
      offset: 0,
    });
    initialHasMore = feed.items.length > INITIAL_PAGE_SIZE;
    initialItems = initialHasMore
      ? feed.items.slice(0, INITIAL_PAGE_SIZE)
      : feed.items;
  } catch (error) {
    initialError = error instanceof Error ? error.message : "Unknown database error.";
  }

  return (
    <LogPageClient
      initialItems={initialItems}
      initialHasMore={initialHasMore}
      initialError={initialError}
    />
  );
}
