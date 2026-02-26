import { NextRequest, NextResponse } from "next/server";
import { getDeletedFileById } from "@/lib/db";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

function normalizeEftaId(value: string | null) {
  return (value ?? "").trim().toUpperCase();
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wantsXml(request: NextRequest, requestUrl: URL) {
  const format = (requestUrl.searchParams.get("format") ?? "")
    .trim()
    .toLowerCase();
  if (format === "xml") {
    return true;
  }
  const accept = (request.headers.get("accept") ?? "").toLowerCase();
  return accept.includes("text/xml") || accept.includes("application/xml");
}

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const targetUrl = requestUrl.searchParams.get("url")?.trim() ?? "";
    if (!targetUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    let parsedTarget: URL;
    try {
      parsedTarget = new URL(targetUrl);
    } catch {
      return NextResponse.json({ error: "Invalid url parameter" }, { status: 400 });
    }

    if (parsedTarget.pathname !== "/deleted-docs-browser") {
      return NextResponse.json({ error: "Unsupported target URL" }, { status: 400 });
    }

    const eftaId = normalizeEftaId(parsedTarget.searchParams.get("id"));
    if (!eftaId) {
      return NextResponse.json({ error: "Target URL must include id" }, { status: 400 });
    }

    const file = await getDeletedFileById(eftaId);
    if (!file) {
      return NextResponse.json({ error: "Deleted file not found" }, { status: 404 });
    }

    const width = Math.min(2000, parsePositiveInt(requestUrl.searchParams.get("maxwidth"), 1100));
    const height = Math.min(2000, parsePositiveInt(requestUrl.searchParams.get("maxheight"), 760));

    const canonicalUrl = absoluteUrl(
      `/deleted-docs-browser?id=${encodeURIComponent(file.efta_id)}`,
    );
    const datasetLabel = file.dataset ? `Dataset ${file.dataset}` : "Unknown dataset";

    const oembed = {
      version: "1.0",
      type: "rich",
      provider_name: "Epstein Files",
      provider_url: absoluteUrl("/"),
      title: `Deleted File ${file.efta_id} (${datasetLabel})`,
      width,
      height,
      cache_age: 300,
      html: `<iframe src="${canonicalUrl}" width="${width}" height="${height}" frameborder="0" loading="lazy" allowfullscreen></iframe>`,
    };

    if (wantsXml(request, requestUrl)) {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<oembed>
  <version>${escapeXml(String(oembed.version))}</version>
  <type>${escapeXml(String(oembed.type))}</type>
  <provider_name>${escapeXml(oembed.provider_name)}</provider_name>
  <provider_url>${escapeXml(oembed.provider_url)}</provider_url>
  <title>${escapeXml(oembed.title)}</title>
  <width>${oembed.width}</width>
  <height>${oembed.height}</height>
  <cache_age>${oembed.cache_age}</cache_age>
  <html>${escapeXml(oembed.html)}</html>
</oembed>`;

      return new NextResponse(xml, {
        status: 200,
        headers: {
          "content-type": "text/xml; charset=utf-8",
        },
      });
    }

    return NextResponse.json(oembed);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate oEmbed", details: String(error) },
      { status: 500 },
    );
  }
}
