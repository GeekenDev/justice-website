import { NextRequest, NextResponse } from "next/server";
import { getFilesChangeLogFeed } from "@/lib/db";

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

export async function GET(request: NextRequest) {
  try {
    const offset = parsePositiveInt(request.nextUrl.searchParams.get("offset"), 0);
    const requestedLimit = parsePositiveInt(request.nextUrl.searchParams.get("limit"), 20);
    const limit = Math.max(1, Math.min(100, requestedLimit));

    const feed = await getFilesChangeLogFeed({
      limit: limit + 1,
      offset,
    });
    const hasMore = feed.items.length > limit;
    const items = hasMore ? feed.items.slice(0, limit) : feed.items;

    return NextResponse.json({
      items,
      offset,
      limit,
      nextOffset: offset + items.length,
      hasMore,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load log entries",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
