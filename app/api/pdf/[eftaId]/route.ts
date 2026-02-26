import { NextRequest, NextResponse } from "next/server";
import { getDeletedFileById, getFileById } from "@/lib/db";
import { logServerVerbose } from "@/lib/logging";
import { withSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    eftaId: string;
  }>;
};

async function resolveSourceUrl(eftaId: string) {
  const normalizedId = eftaId.trim().toUpperCase();
  logServerVerbose("api/pdf", "Resolving source URL", { eftaId: normalizedId });
  const fullRecord = await getFileById(normalizedId);
  if (fullRecord?.file) {
    const sources = withSources(fullRecord.file).sources;
    logServerVerbose("api/pdf", "Found source in primary files table", {
      eftaId: normalizedId,
      hasOriginal: Boolean(sources.original_link),
      hasDoj: Boolean(sources.doj_link),
    });
    return {
      sourceUrl: sources.original_link,
      altSourceUrl: sources.doj_link,
      eftaId: normalizedId,
    };
  }

  const deletedRecord = await getDeletedFileById(normalizedId);
  if (deletedRecord) {
    const sources = withSources(deletedRecord).sources;
    logServerVerbose("api/pdf", "Found source in deleted files table", {
      eftaId: normalizedId,
      hasOriginal: Boolean(sources.original_link),
      hasDoj: Boolean(sources.doj_link),
    });
    return {
      sourceUrl: sources.original_link,
      altSourceUrl: sources.doj_link,
      eftaId: normalizedId,
    };
  }

  return null;
}

async function isPdfResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/pdf")) {
    logServerVerbose("api/pdf", "Detected PDF via content-type", { contentType });
    return true;
  }
  try {
    const probe = await response.clone().arrayBuffer();
    const head = new Uint8Array(probe.slice(0, 5));
    const isPdfMagic =
      head.length >= 5 &&
      head[0] === 0x25 && // %
      head[1] === 0x50 && // P
      head[2] === 0x44 && // D
      head[3] === 0x46 && // F
      head[4] === 0x2d; // -
    logServerVerbose("api/pdf", "Detected PDF via magic bytes", {
      isPdfMagic,
      contentType,
    });
    return isPdfMagic;
  } catch {
    logServerVerbose("api/pdf", "Failed to probe response body for PDF magic bytes");
    return false;
  }
}

function extractEftaIdFromUrl(url: string) {
  const match = url.match(/(EFTA\d{8})/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { eftaId } = await context.params;
    logServerVerbose("api/pdf", "Incoming request", {
      eftaId,
      url: request.url,
      range: request.headers.get("range"),
    });
    const resolved = await resolveSourceUrl(eftaId);
    if (!resolved) {
      logServerVerbose("api/pdf", "No source record found", { eftaId });
      return NextResponse.json({ error: "PDF source not found" }, { status: 404 });
    }
    const candidateUrls = [resolved.sourceUrl, resolved.altSourceUrl].filter(
      (value): value is string => Boolean(value),
    );
    if (candidateUrls.length === 0) {
      logServerVerbose("api/pdf", "Resolved record has no usable source URLs", {
        eftaId: resolved.eftaId,
      });
      return NextResponse.json({ error: "Original source URL unavailable" }, { status: 404 });
    }
    logServerVerbose("api/pdf", "Candidate source URLs prepared", {
      eftaId: resolved.eftaId,
      candidateCount: candidateUrls.length,
      candidateUrls,
    });

    const { searchParams } = new URL(request.url);
    if (searchParams.get("meta") === "1") {
      logServerVerbose("api/pdf", "Returning metadata response", {
        eftaId: resolved.eftaId,
      });
      return NextResponse.json({
        eftaId: resolved.eftaId,
        pageCount: null,
        sourceUrl: candidateUrls[0] ?? null,
      });
    }

    const forwardedHeaders = new Headers();
    const range = request.headers.get("range");
    if (range) {
      forwardedHeaders.set("range", range);
    }

    const requestHeaders = new Headers(forwardedHeaders);
    requestHeaders.set("accept", "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8");
    requestHeaders.set("user-agent", "Mozilla/5.0 (compatible; EpsteinFilesBot/1.0)");

    const matchingCandidates: string[] = [];
    const fallbackCandidates: string[] = [];
    for (const candidateUrl of candidateUrls) {
      const candidateEftaId = extractEftaIdFromUrl(candidateUrl);
      if (candidateEftaId && candidateEftaId !== resolved.eftaId) {
        fallbackCandidates.push(candidateUrl);
      } else {
        matchingCandidates.push(candidateUrl);
      }
    }
    const orderedCandidates = [...matchingCandidates, ...fallbackCandidates];
    if (fallbackCandidates.length > 0) {
      logServerVerbose("api/pdf", "Found EFTA-mismatched fallback candidates", {
        requestedEftaId: resolved.eftaId,
        fallbackCandidates,
      });
    }

    let upstream: Response | null = null;
    for (const candidateUrl of orderedCandidates) {
      logServerVerbose("api/pdf", "Fetching candidate upstream URL", {
        candidateUrl,
      });
      const response = await fetch(candidateUrl, {
        method: "GET",
        headers: requestHeaders,
        redirect: "follow",
        cache: "no-store",
      });

      if (!response.ok && response.status !== 206) {
        logServerVerbose("api/pdf", "Candidate response not OK", {
          candidateUrl,
          status: response.status,
          contentType: response.headers.get("content-type"),
        });
        continue;
      }
      logServerVerbose("api/pdf", "Candidate response OK, validating PDF", {
        candidateUrl,
        status: response.status,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
      });
      if (await isPdfResponse(response)) {
        upstream = response;
        logServerVerbose("api/pdf", "Selected valid PDF response", {
          candidateUrl,
          status: response.status,
        });
        break;
      }
      logServerVerbose("api/pdf", "Candidate was not a valid PDF payload", {
        candidateUrl,
      });
    }

    if (!upstream) {
      logServerVerbose("api/pdf", "No valid PDF response found from all candidates", {
        eftaId: resolved.eftaId,
      });
      return NextResponse.json(
        { error: "Could not fetch a valid PDF response from upstream sources" },
        { status: 502 },
      );
    }

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges");
    const etag = upstream.headers.get("etag");
    const lastModified = upstream.headers.get("last-modified");

    headers.set("Cache-Control", "public, max-age=300");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Range, Content-Length");
    headers.set("Accept-Ranges", acceptRanges || "bytes");
    headers.set("Content-Type", contentType || "application/pdf");

    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }
    if (contentRange) {
      headers.set("Content-Range", contentRange);
    }
    if (etag) {
      headers.set("ETag", etag);
    }
    if (lastModified) {
      headers.set("Last-Modified", lastModified);
    }

    logServerVerbose("api/pdf", "Streaming PDF response", {
      eftaId: resolved.eftaId,
      status: upstream.status,
      contentType,
      contentLength,
      contentRange,
    });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    logServerVerbose("api/pdf", "Unhandled error in PDF route", {
      error: String(error),
    });
    return NextResponse.json(
      { error: "Failed to stream PDF", details: String(error) },
      { status: 500 },
    );
  }
}
