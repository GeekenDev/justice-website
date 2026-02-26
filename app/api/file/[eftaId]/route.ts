import { NextRequest, NextResponse } from "next/server";
import {
  createQueryCacheDebug,
  getFileById,
  getQueryCacheHeaderValue
} from "@/lib/db";
import { withSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    eftaId: string;
  }>;
};

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { eftaId } = await context.params;
    const queryCacheDebug = createQueryCacheDebug();
    const result = await getFileById(eftaId, queryCacheDebug);

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      file: withSources(result.file),
      parent: result.parent ? withSources(result.parent) : null,
      children: result.children.map(withSources),
    }, {
      headers: {
        "X-Query-Cache": getQueryCacheHeaderValue(queryCacheDebug)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load file", details: String(error) },
      { status: 500 }
    );
  }
}
