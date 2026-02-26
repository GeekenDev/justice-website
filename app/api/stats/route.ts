import { NextResponse } from "next/server";
import {
  createQueryCacheDebug,
  getDatasets,
  getQueryCacheHeaderValue,
  getStats
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const queryCacheDebug = createQueryCacheDebug();
    const [stats, datasets] = await Promise.all([
      getStats(queryCacheDebug),
      getDatasets(queryCacheDebug)
    ]);
    return NextResponse.json({
      stats,
      datasets: datasets.map((d) => d.dataset).filter(Boolean)
    }, {
      headers: {
        "X-Query-Cache": getQueryCacheHeaderValue(queryCacheDebug)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load stats", details: String(error) },
      { status: 500 }
    );
  }
}
