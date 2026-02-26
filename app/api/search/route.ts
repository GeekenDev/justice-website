import { NextRequest, NextResponse } from "next/server";
import {
  SearchParams,
  createQueryCacheDebug,
  getQueryCacheHeaderValue,
  searchFiles
} from "@/lib/db";
import { withSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params: SearchParams = {
      q: searchParams.get("q") ?? undefined,
      dataset: searchParams.get("dataset") ?? undefined,
      altered: (searchParams.get("altered") as SearchParams["altered"]) ?? "all",
      hidden: (searchParams.get("hidden") as SearchParams["hidden"]) ?? "all",
      deleted: (searchParams.get("deleted") as SearchParams["deleted"]) ?? "all",
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("pageSize") ?? "25")
    };

    const queryCacheDebug = createQueryCacheDebug();
    const result = await searchFiles(params, queryCacheDebug);
    return NextResponse.json(
      {
        ...result,
        rows: result.rows.map(withSources),
      },
      {
      headers: {
        "X-Query-Cache": getQueryCacheHeaderValue(queryCacheDebug)
      }
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to search files", details: String(error) },
      { status: 500 }
    );
  }
}
