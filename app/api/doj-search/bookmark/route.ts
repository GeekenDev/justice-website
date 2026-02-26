import { NextRequest, NextResponse } from "next/server";
import { bookmarkDojSearchResult, getDojSearchBookmarkByUrl } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    if (!voterId) {
      return NextResponse.json({ error: "Missing voter ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url")?.trim() ?? "";
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const result = await getDojSearchBookmarkByUrl(url, voterId);
    return NextResponse.json({
      url,
      bookmarked: result.bookmarked,
      note: result.note,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load bookmark note", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    if (!voterId) {
      return NextResponse.json({ error: "Missing voter ID" }, { status: 400 });
    }

    const body = (await request.json()) as {
      url?: string;
      title?: string | null;
      fileName?: string | null;
      snippet?: string | null;
      highlight?: string | null;
      fileSize?: number | null;
      sources?: {
        original_link?: string | null;
        doj_link?: string | null;
      };
      note?: string | null;
    };

    const url = body.url?.trim() ?? "";
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const result = await bookmarkDojSearchResult({
      url,
      title: body.title ?? null,
      fileName: body.fileName ?? null,
      snippet: body.snippet ?? null,
      highlight: body.highlight ?? null,
      fileSize: body.fileSize ?? null,
      originalLink: body.sources?.original_link ?? null,
      dojLink: body.sources?.doj_link ?? null,
      note: body.note ?? null,
      voterId,
    });

    return NextResponse.json({
      url,
      alreadyBookmarked: result.alreadyBookmarked,
      totalBookmarks: result.totalBookmarks,
      bookmarkCount: result.bookmarkCount,
      note: result.note ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to bookmark result", details: String(error) },
      { status: 500 },
    );
  }
}
