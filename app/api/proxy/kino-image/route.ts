import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseIntWithBounds(value: string | null, fallback: number, min: number, max: number) {
  const n = Number(value ?? "");
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isAllowedKinoUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const hostAllowed =
      parsed.hostname === "getkino.com" || parsed.hostname.endsWith(".getkino.com");
    const pathAllowed = parsed.pathname.includes("/documents/thumbnails/");
    return parsed.protocol === "https:" && hostAllowed && pathAllowed;
  } catch {
    return false;
  }
}

function injectTransform(rawUrl: string, width: number, quality: number) {
  const parsed = new URL(rawUrl);
  const transform = `width=${width},quality=${quality},format=auto`;
  const marker = "/cdn-cgi/image/";
  const idx = parsed.pathname.indexOf(marker);
  if (idx === -1) {
    return rawUrl;
  }

  const after = parsed.pathname.slice(idx + marker.length);
  const restStart = after.indexOf("/");
  if (restStart === -1) {
    return rawUrl;
  }
  const rest = after.slice(restStart + 1);
  parsed.pathname = `${marker}${transform}/${rest}`;
  return parsed.toString();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("url")?.trim() ?? "";
    if (!source || !isAllowedKinoUrl(source)) {
      return NextResponse.json({ error: "Invalid kino image url" }, { status: 400 });
    }

    const width = parseIntWithBounds(searchParams.get("width"), 400, 64, 2000);
    const quality = parseIntWithBounds(searchParams.get("quality"), 80, 1, 100);
    const upstreamUrl = injectTransform(source, width, quality);

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5",
      },
      cache: "force-cache",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Upstream image request failed", status: upstream.status },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to proxy kino image", details: String(error) },
      { status: 500 },
    );
  }
}
