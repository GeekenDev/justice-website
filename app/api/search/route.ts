import { NextRequest, NextResponse } from "next/server";
import {
  SearchParams,
  createQueryCacheDebug,
  getV2SearchResultPage,
  getQueryCacheHeaderValue,
  recordV2SearchQuery,
  saveV2SearchResultPage,
  searchFiles
} from "@/lib/db";
import { withSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

function extractV2CacheKey(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as {
    from?: unknown;
    size?: unknown;
    suggest?: {
      did_you_mean?: {
        text?: unknown;
      };
    };
  };

  const query = body.suggest?.did_you_mean?.text;
  const from = Number(body.from ?? 0);
  const size = Number(body.size ?? 0);
  if (
    typeof query !== "string" ||
    query.length === 0 ||
    !Number.isFinite(from) ||
    !Number.isFinite(size) ||
    size <= 0 ||
    from < 0
  ) {
    return null;
  }

  const page = Math.floor(from / size) + 1;
  return { query, page };
}

export async function POST(request: NextRequest) {
  try {
    const esUrl = process.env.ES_URL?.trim();
    const esApiKey = process.env.ES_API_KEY?.trim();
    const esIndex = process.env.ES_INDEX?.trim();

    if (!esUrl || !esApiKey || !esIndex) {
      return NextResponse.json(
        {
          error:
            "Missing Elasticsearch configuration. Expected ES_URL, ES_API_KEY, and ES_INDEX."
        },
        { status: 500 },
      );
    }

    const body = await request.text();
    let parsedBody: unknown = null;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = null;
    }

    const cacheKey = extractV2CacheKey(parsedBody);
    if (cacheKey) {
      const cached = await getV2SearchResultPage(cacheKey);
      if (cached && typeof cached === "object") {
        return NextResponse.json(cached, {
          headers: {
            "X-ES-Index": esIndex,
            "X-Search-V2-Cache": "hit",
          },
        });
      }
    }

    const target = `${esUrl.replace(/\/+$/, "")}/${encodeURIComponent(esIndex)}/_search`;
    const esResponse = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${esApiKey}`,
      },
      body,
      cache: "no-store",
    });

    const responseText = await esResponse.text();
    if (esResponse.ok && cacheKey?.query) {
      await recordV2SearchQuery(cacheKey.query);
    }
    if (esResponse.ok && cacheKey) {
      try {
        const parsedResponse = JSON.parse(responseText);
        await saveV2SearchResultPage({
          query: cacheKey.query,
          page: cacheKey.page,
          payload: parsedResponse,
        });
      } catch {
        // Best-effort cache write; ignore parse/cache failures.
      }
    }

    return new NextResponse(responseText, {
      status: esResponse.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-ES-Index": esIndex,
        "X-Search-V2-Cache": "miss",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to proxy Elasticsearch search", details: String(error) },
      { status: 500 },
    );
  }
}

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
