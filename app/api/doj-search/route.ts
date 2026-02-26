import { NextRequest, NextResponse } from "next/server";
import {
  getDojSearchBookmarkCounts,
  getFileSourceInputsByEftaIds,
  getDojSearchUserBookmarks,
  getDojSearchUserVotes,
  getDojSearchVotes,
  recordDojSearchQuery,
  saveDojSearchResultPage,
} from "@/lib/db";
import { buildDojLink, buildOriginalLink } from "@/lib/sources";

export const dynamic = "force-dynamic";

const DEFAULT_DOJ_COOKIE =
  "ak_bmsc=980E36495CF5AAC1BFD253B8CA5A0B69~000000000000000000000000000000~YAAQalUXAnIE92+cAQAAh6RWkB7Sn4tQQ9tuFugwHzan83Aa/tvrgOaj4s80AtwMDOIIYCABNYLU1dMQFhuDZ9PAruDXYUu688JVP4g8juSRRcS7zSTAni34QvXKH6MYoycFA9fsdQzulAHzgoB2GHjo9uk5WdwW8iBOplSxOyLeF6vGoIBrH5woXudEjC/bzHqK6C2MidTWKIVgqOvj3Z+Gd/vfaLU6Xm/3NWKKmD4z1ZnksOY0P1tWFVS4vVFh1HQiWKGfYxwA2tmPyekL3vg0JM/CH5knnJEfs0YbXD9xiH3nmUgBJ3MIFUtwU2pmqTXa1CGa1nI56MbPn3HKlMa8jriFkerpY2LtQ0RxmYQX7UGQYdtwIxYUwqdiSR1ZpgLzEW+kc8a30ti6xdhC3BD7stu3MjqReO3xpo5YzcOZw04Ou7R/Z22h+PJ5pPDnEmNZhLImP6pBEmyAtVM6sChiw05Q";
const DOJ_PAGE_SIZE = 10;

type DoiSearchResult = {
  title: string;
  url: string;
  snippet: string | null;
  fileName: string | null;
  highlight: string | null;
  fileSize: number | null;
  sources: {
    original_link: string | null;
    doj_link: string | null;
  };
  upvotes: number;
  bookmarkCount: number;
  userVoted: boolean;
  userBookmarked: boolean;
};

function toSourceLinks(
  eftaId: string | null,
  dataset: string | null,
  filePath: string | null,
) {
  if (!eftaId || !dataset) {
    return {
      original_link: null,
      doj_link: null,
    };
  }

  const sourceInput = {
    efta_id: eftaId,
    dataset,
    file_path: filePath,
  };

  return {
    original_link: buildOriginalLink(sourceInput),
    doj_link: buildDojLink(sourceInput),
  };
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeUrl(href: string) {
  if (!href) {
    return "";
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  if (href.startsWith("/")) {
    return `https://www.justice.gov${href}`;
  }
  return `https://www.justice.gov/${href.replace(/^\/+/, "")}`;
}

function parseDatasetAndEftaFromUrl(url: string) {
  if (!url) {
    return { dataset: null, eftaId: null };
  }
  const datasetMatch = url.match(/DataSet(?:%20|\s)+(\d+)/i);
  const eftaMatch = url.match(/(EFTA\d{8})/i);
  return {
    dataset: datasetMatch?.[1] ?? null,
    eftaId: eftaMatch?.[1]?.toUpperCase() ?? null,
  };
}

function parseEftaIdFromResult(result: DoiSearchResult) {
  const fromName = result.fileName?.match(/(EFTA\d{8})/i)?.[1] ?? null;
  const fromUrl = result.url.match(/(EFTA\d{8})/i)?.[1] ?? null;
  return (fromName ?? fromUrl)?.toUpperCase() ?? null;
}

function parseResults(html: string): DoiSearchResult[] {
  const results: DoiSearchResult[] = [];
  const seen = new Set<string>();

  const blockRegex =
    /<article[\s\S]*?<\/article>|<li[^>]*class="[^"]*views-row[^"]*"[\s\S]*?<\/li>/gi;
  const blocks = html.match(blockRegex) ?? [];

  for (const block of blocks) {
    const anchorMatch =
      block.match(/<h[23][^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ??
      block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);

    if (!anchorMatch) {
      continue;
    }

    const url = normalizeUrl(anchorMatch[1]);
    const title = decodeHtml(stripTags(anchorMatch[2]));
    if (!url || !title || seen.has(url)) {
      continue;
    }

    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch
      ? decodeHtml(stripTags(snippetMatch[1])) || null
      : null;

    seen.add(url);
    const sourceInfo = parseDatasetAndEftaFromUrl(url);
    results.push({
      title,
      url,
      snippet,
      fileName: null,
      highlight: null,
      fileSize: null,
      sources: toSourceLinks(sourceInfo.eftaId, sourceInfo.dataset, null),
      upvotes: 0,
      bookmarkCount: 0,
      userVoted: false,
      userBookmarked: false,
    });
  }

  return results;
}

function stripHighlightTags(value: string) {
  return value.replace(/<\/?em>/gi, "").trim();
}

function parseElasticResults(payload: unknown): {
  total: number | null;
  uniqueCount: number | null;
  results: DoiSearchResult[];
} | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as {
      hits?: {
        total?: { value?: number };
        hits?: Array<{
          _source?: {
            ORIGIN_FILE_NAME?: string;
            ORIGIN_FILE_URI?: string;
            key?: string;
            fileSize?: number;
          };
          highlight?: { content?: string[] };
        }>;
      };
    aggregations?: { unique_count?: { value?: number } };
  };

  const hitRows = root.hits?.hits;
  if (!Array.isArray(hitRows)) {
    return null;
  }

  const results: DoiSearchResult[] = hitRows.map((hit) => {
    const fileName = hit._source?.ORIGIN_FILE_NAME ?? null;
    const uri = hit._source?.ORIGIN_FILE_URI ?? "";
    const keyPath = hit._source?.key ?? "";
    const sourceInfo = parseDatasetAndEftaFromUrl(uri);
    const highlightValue = hit.highlight?.content?.[0] ?? null;
    const normalizedFilePath = keyPath
      ? keyPath.replace(/^DataSet(?:%20|\s)+\d+\//i, "")
      : fileName;
    return {
      title: fileName || uri || "Untitled",
      url: normalizeUrl(uri),
      snippet: highlightValue ? stripHighlightTags(highlightValue) : null,
      fileName,
      highlight: highlightValue,
      fileSize:
        typeof hit._source?.fileSize === "number" ? hit._source.fileSize : null,
      sources: toSourceLinks(
        sourceInfo.eftaId,
        sourceInfo.dataset,
        normalizedFilePath,
      ),
      upvotes: 0,
      bookmarkCount: 0,
      userVoted: false,
      userBookmarked: false,
    };
  });

  return {
    total: typeof root.hits?.total?.value === "number" ? root.hits.total.value : null,
    uniqueCount:
      typeof root.aggregations?.unique_count?.value === "number"
        ? root.aggregations.unique_count.value
        : null,
    results,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keys = (searchParams.get("keys") ?? "").trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  if (!keys) {
    return NextResponse.json(
      { error: "Missing required query param: keys" },
      { status: 400 },
    );
  }

  const target = new URL("https://www.justice.gov/multimedia-search");
  target.searchParams.set("keys", keys);
  target.searchParams.set("page", String(page));
  const voterId = request.headers.get("x-voter-id")?.trim() ?? "";

  try {
    const cookie = process.env.DOJ_SEARCH_COOKIE?.trim() || DEFAULT_DOJ_COOKIE;
    const response = await fetch(target.toString(), {
      headers: {
        accept:
          "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-US,en;q=0.9,ru;q=0.8",
        priority: "u=0, i",
        "sec-ch-ua":
          "\"Not:A-Brand\";v=\"99\", \"Google Chrome\";v=\"145\", \"Chromium\";v=\"145\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "upgrade-insecure-requests": "1",
        Referer: target.toString(),
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        ...(cookie ? { cookie } : {}),
      },
      redirect: "follow",
      cache: "no-store",
    });

    const html = await response.text();
    let parsedJson: unknown = null;
    try {
      parsedJson = JSON.parse(html);
    } catch {
      parsedJson = null;
    }

    const elasticParsed = parseElasticResults(parsedJson);
    if (elasticParsed) {
      const eftaIds = elasticParsed.results
        .map(parseEftaIdFromResult)
        .filter((id): id is string => Boolean(id));
      const sourceLookups = await getFileSourceInputsByEftaIds(eftaIds);
      const enrichedResults = elasticParsed.results.map((result) => {
        const eftaId = parseEftaIdFromResult(result);
        if (!eftaId) {
          return result;
        }
        const sourceFromDb = sourceLookups[eftaId];
        if (!sourceFromDb?.dataset || !sourceFromDb?.file_path) {
          return result;
        }
        return {
          ...result,
          sources: toSourceLinks(eftaId, sourceFromDb.dataset, sourceFromDb.file_path),
        };
      });
      const urls = enrichedResults.map((r) => r.url);
      const [votes, bookmarkCounts, userVotes, userBookmarks] = await Promise.all([
        getDojSearchVotes(urls),
        getDojSearchBookmarkCounts(urls),
        getDojSearchUserVotes(urls, voterId),
        getDojSearchUserBookmarks(urls, voterId),
      ]);
      const resultsWithVotes = enrichedResults.map((result) => ({
        ...result,
        upvotes: votes[result.url] ?? 0,
        bookmarkCount: bookmarkCounts[result.url] ?? 0,
        userVoted: userVotes[result.url] ?? false,
        userBookmarked: userBookmarks[result.url] ?? false,
      }));
      if (enrichedResults.length > 0) {
        await recordDojSearchQuery(keys);
      }
      const responsePayload = {
        keys,
        page,
        url: target.toString(),
        ok: response.ok,
        blocked: !response.ok,
        results: resultsWithVotes,
        resultCount: resultsWithVotes.length,
        total: elasticParsed.total,
        uniqueCount: elasticParsed.uniqueCount,
        pageSize: DOJ_PAGE_SIZE,
        totalPages:
          typeof elasticParsed.total === "number"
            ? Math.max(1, Math.ceil(elasticParsed.total / DOJ_PAGE_SIZE))
            : null,
        status: response.status,
      };
      await saveDojSearchResultPage({
        query: keys,
        page,
        payload: responsePayload,
      });
      return NextResponse.json(responsePayload);
    }

    const accessDenied = /Access Denied/i.test(html);
    const results = parseResults(html);
    const urls = results.map((r) => r.url);
    const [votes, bookmarkCounts, userVotes, userBookmarks] = await Promise.all([
      getDojSearchVotes(urls),
      getDojSearchBookmarkCounts(urls),
      getDojSearchUserVotes(urls, voterId),
      getDojSearchUserBookmarks(urls, voterId),
    ]);
    const resultsWithVotes = results.map((result) => ({
      ...result,
      upvotes: votes[result.url] ?? 0,
      bookmarkCount: bookmarkCounts[result.url] ?? 0,
      userVoted: userVotes[result.url] ?? false,
      userBookmarked: userBookmarks[result.url] ?? false,
    }));
    if (resultsWithVotes.length > 0 && !accessDenied && response.ok) {
      await recordDojSearchQuery(keys);
    }

    const responsePayload = {
      keys,
      page,
      url: target.toString(),
      ok: response.ok && !accessDenied,
      blocked: accessDenied || !response.ok,
      results: resultsWithVotes,
      resultCount: resultsWithVotes.length,
      total: null,
      uniqueCount: null,
      pageSize: null,
      totalPages: null,
      status: response.status,
    };
    await saveDojSearchResultPage({
      query: keys,
      page,
      payload: responsePayload,
    });
    return NextResponse.json(responsePayload);
  } catch (error) {
    return NextResponse.json(
      {
        keys,
        page,
        url: target.toString(),
        ok: false,
        blocked: true,
        error: `DOJ request failed: ${String(error)}`,
        results: [],
        resultCount: 0,
        total: null,
        uniqueCount: null,
        pageSize: null,
        totalPages: null,
      },
      { status: 502 },
    );
  }
}
