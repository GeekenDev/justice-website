import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "doj-files.geeken.dev",
  "justice.gov",
  "www.justice.gov",
]);

function getTargetUrl(request: NextRequest) {
  const value = new URL(request.url).searchParams.get("url")?.trim() ?? "";
  if (!value) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return null;
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return null;
  }

  return parsed.toString();
}

export async function GET(request: NextRequest) {
  try {
    const targetUrl = getTargetUrl(request);
    if (!targetUrl) {
      return NextResponse.json({ error: "Invalid or missing url" }, { status: 400 });
    }

    const forwardedHeaders = new Headers();
    const range = request.headers.get("range");
    if (range) {
      forwardedHeaders.set("range", range);
    }
    forwardedHeaders.set("accept", "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8");
    // Avoid upstream compression work for large binary payloads.
    forwardedHeaders.set("accept-encoding", "identity");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let upstream: Response;
    try {
      upstream = await fetch(targetUrl, {
        method: "GET",
        headers: forwardedHeaders,
        redirect: "follow",
        // Range requests should bypass cache; full-file requests can be cached.
        cache: range ? "no-store" : "force-cache",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `Upstream fetch failed with status ${upstream.status}` },
        { status: upstream.status },
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

    if (contentType) {
      headers.set("Content-Type", contentType);
    } else {
      headers.set("Content-Type", "application/pdf");
    }
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

    // Use the native Response for stream passthrough to minimize worker overhead.
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to proxy PDF", details: String(error) },
      { status: 500 },
    );
  }
}
